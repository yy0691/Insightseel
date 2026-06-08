/**
 * Recording Service
 * Captures audio/screen directly in the browser via getDisplayMedia / getUserMedia
 * and MediaRecorder. The resulting Blob is fed into the existing import pipeline
 * (audio extraction -> transcription), so any source (Tencent Meeting, Bilibili
 * playback, etc.) can be transcribed without scraping or server-side downloads.
 */

export type RecordingMode = 'screen' | 'screen-mic' | 'mic';

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  hasVideo: boolean;
}

export interface RecordingController {
  stop: () => Promise<RecordingResult>;
  cancel: () => void;
  getElapsedMs: () => number;
  /** Fires when the underlying capture ends on its own (e.g. user clicks "Stop sharing"). */
  onAutoStop?: () => void;
}

export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof MediaRecorder !== 'undefined'
  );
}

export function isScreenRecordingSupported(): boolean {
  return isRecordingSupported() && typeof navigator.mediaDevices.getDisplayMedia === 'function';
}

/** Pick the best supported container/codec for the given track layout. */
function pickMimeType(hasVideo: boolean): string {
  const videoCandidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  const audioCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  const candidates = hasVideo ? videoCandidates : audioCandidates;
  for (const type of candidates) {
    if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return hasVideo ? 'video/webm' : 'audio/webm';
}

/**
 * Mix multiple audio MediaStreamTracks into a single track using the Web Audio API.
 * Used to combine system/tab audio (from getDisplayMedia) with microphone audio.
 */
function mixAudioTracks(streams: MediaStream[]): { track: MediaStreamTrack; context: AudioContext } | null {
  const audioStreams = streams.filter((s) => s.getAudioTracks().length > 0);
  if (audioStreams.length === 0) return null;

  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const context: AudioContext = new AudioCtx();
  const destination = context.createMediaStreamDestination();

  for (const stream of audioStreams) {
    const source = context.createMediaStreamSource(stream);
    source.connect(destination);
  }

  return { track: destination.stream.getAudioTracks()[0], context };
}

export async function startRecording(mode: RecordingMode): Promise<RecordingController> {
  if (!isRecordingSupported()) {
    throw new Error('Recording is not supported in this browser.');
  }
  if ((mode === 'screen' || mode === 'screen-mic') && !isScreenRecordingSupported()) {
    throw new Error('Screen recording is not supported in this browser.');
  }

  const sourceStreams: MediaStream[] = [];
  let audioContext: AudioContext | null = null;
  let hasVideo = false;

  try {
    let displayStream: MediaStream | null = null;
    let micStream: MediaStream | null = null;

    if (mode === 'screen' || mode === 'screen-mic') {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      sourceStreams.push(displayStream);
      hasVideo = displayStream.getVideoTracks().length > 0;
    }

    if (mode === 'mic' || mode === 'screen-mic') {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      sourceStreams.push(micStream);
    }

    // Build the recording stream.
    const recordingStream = new MediaStream();

    if (displayStream) {
      for (const track of displayStream.getVideoTracks()) {
        recordingStream.addTrack(track);
      }
    }

    // Combine audio from all sources into a single mixed track when needed.
    const audioStreams: MediaStream[] = [];
    if (displayStream && displayStream.getAudioTracks().length > 0) audioStreams.push(displayStream);
    if (micStream && micStream.getAudioTracks().length > 0) audioStreams.push(micStream);

    if (audioStreams.length === 1) {
      for (const track of audioStreams[0].getAudioTracks()) {
        recordingStream.addTrack(track);
      }
    } else if (audioStreams.length > 1) {
      const mixed = mixAudioTracks(audioStreams);
      if (mixed) {
        audioContext = mixed.context;
        recordingStream.addTrack(mixed.track);
      }
    }

    if (recordingStream.getTracks().length === 0) {
      throw new Error('No audio or video track was captured.');
    }

    const mimeType = pickMimeType(hasVideo);
    const recorder = new MediaRecorder(recordingStream, { mimeType });
    const chunks: BlobPart[] = [];
    const startedAt = Date.now();
    let stoppedAt = 0;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    const controller: RecordingController = {
      getElapsedMs: () => (stoppedAt || Date.now()) - startedAt,
      stop: () =>
        new Promise<RecordingResult>((resolve) => {
          const finalize = () => {
            stoppedAt = Date.now();
            cleanup();
            resolve({
              blob: new Blob(chunks, { type: mimeType }),
              mimeType,
              durationMs: stoppedAt - startedAt,
              hasVideo,
            });
          };
          if (recorder.state === 'inactive') {
            finalize();
            return;
          }
          recorder.onstop = finalize;
          recorder.stop();
        }),
      cancel: () => {
        try {
          if (recorder.state !== 'inactive') {
            recorder.onstop = null;
            recorder.stop();
          }
        } catch {
          /* ignore */
        }
        cleanup();
      },
    };

    function cleanup() {
      for (const stream of sourceStreams) {
        for (const track of stream.getTracks()) {
          try {
            track.stop();
          } catch {
            /* ignore */
          }
        }
      }
      if (audioContext) {
        audioContext.close().catch(() => undefined);
        audioContext = null;
      }
    }

    // Detect user-initiated stop (e.g. clicking the browser's "Stop sharing" bar).
    if (displayStream) {
      const videoTrack = displayStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.addEventListener('ended', () => {
          controller.onAutoStop?.();
        });
      }
    }

    recorder.start(1000);
    return controller;
  } catch (error) {
    for (const stream of sourceStreams) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      }
    }
    if (audioContext) {
      (audioContext as AudioContext).close().catch(() => undefined);
    }
    throw error;
  }
}
