import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Monitor, Mic, MonitorSpeaker, Square, Loader2 } from 'lucide-react';
import { BaseModal } from './ui/BaseModal';
import {
  startRecording,
  isRecordingSupported,
  isScreenRecordingSupported,
  type RecordingMode,
  type RecordingController,
  type RecordingResult,
} from '../services/recordingService';

interface RecordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (result: RecordingResult) => void;
  language: string;
}

type Phase = 'select' | 'recording' | 'finishing';

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const RecordModal: React.FC<RecordModalProps> = ({ open, onOpenChange, onComplete, language }) => {
  const isZh = language === 'zh';
  const [phase, setPhase] = useState<Phase>('select');
  const [mode, setMode] = useState<RecordingMode>('screen-mic');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const controllerRef = useRef<RecordingController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const supported = isRecordingSupported();
  const screenSupported = isScreenRecordingSupported();

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const resetState = useCallback(() => {
    clearTimer();
    controllerRef.current = null;
    setPhase('select');
    setElapsed(0);
    setError(null);
  }, []);

  useEffect(() => {
    if (open) {
      resetState();
    } else {
      // Closing while recording: cancel capture and release devices.
      if (controllerRef.current) {
        controllerRef.current.cancel();
        controllerRef.current = null;
      }
      clearTimer();
    }
  }, [open, resetState]);

  useEffect(() => () => clearTimer(), []);

  const finishRecording = useCallback(async () => {
    const controller = controllerRef.current;
    if (!controller) return;
    clearTimer();
    setPhase('finishing');
    try {
      const result = await controller.stop();
      controllerRef.current = null;
      if (result.blob.size === 0) {
        setError(isZh ? '没有录到内容，请重试。' : 'Nothing was recorded. Please try again.');
        setPhase('select');
        return;
      }
      onComplete(result);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('select');
    }
  }, [isZh, onComplete, onOpenChange]);

  const beginRecording = async () => {
    setError(null);
    try {
      const controller = await startRecording(mode);
      controller.onAutoStop = () => {
        void finishRecording();
      };
      controllerRef.current = controller;
      setPhase('recording');
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(controller.getElapsedMs());
      }, 250);
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
        setError(isZh ? '已取消或未授予权限。' : 'Permission denied or cancelled.');
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
      setPhase('select');
    }
  };

  const modeOptions: { value: RecordingMode; label: string; desc: string; icon: React.ReactNode; disabled?: boolean }[] = [
    {
      value: 'screen-mic',
      label: isZh ? '屏幕 + 麦克风' : 'Screen + Mic',
      desc: isZh ? '录制画面、系统声音和你的麦克风' : 'Capture screen, system audio and your mic',
      icon: <MonitorSpeaker className="h-5 w-5" />,
      disabled: !screenSupported,
    },
    {
      value: 'screen',
      label: isZh ? '仅屏幕' : 'Screen only',
      desc: isZh ? '录制画面和系统声音（如标签页/会议）' : 'Capture screen and system audio (tab/meeting)',
      icon: <Monitor className="h-5 w-5" />,
      disabled: !screenSupported,
    },
    {
      value: 'mic',
      label: isZh ? '仅麦克风' : 'Microphone only',
      desc: isZh ? '只录制你的语音' : 'Record your voice only',
      icon: <Mic className="h-5 w-5" />,
    },
  ];

  return (
    <BaseModal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      closeOnOverlayClick={phase === 'select'}
      showCloseButton={phase === 'select'}
    >
      <BaseModal.Header
        title={isZh ? '录音 / 录屏' : 'Record Audio / Screen'}
        subtitle={
          phase === 'recording'
            ? isZh
              ? '录制中…完成后将自动转写'
              : 'Recording… it will be transcribed when you stop'
            : isZh
              ? '录制后将自动进入转写流程，适用于腾讯会议等任意来源'
              : 'The recording will be transcribed automatically — works for any source'
        }
      />
      <BaseModal.Body>
        {!supported ? (
          <p className="text-sm text-red-600">
            {isZh ? '当前浏览器不支持录制功能。' : 'Recording is not supported in this browser.'}
          </p>
        ) : phase === 'recording' ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
            </span>
            <div className="font-mono text-4xl font-semibold tabular-nums text-slate-900">
              {formatElapsed(elapsed)}
            </div>
            <p className="text-xs text-slate-500">
              {isZh ? '点击下方按钮结束录制' : 'Click below to finish recording'}
            </p>
          </div>
        ) : phase === 'finishing' ? (
          <div className="flex flex-col items-center gap-3 py-6 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">{isZh ? '正在处理录制…' : 'Processing recording…'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {modeOptions.map((opt) => (
              <button
                key={opt.value}
                disabled={opt.disabled}
                onClick={() => setMode(opt.value)}
                className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition ${
                  mode === opt.value
                    ? 'border-slate-900 bg-slate-50'
                    : 'border-slate-200 hover:border-slate-300'
                } ${opt.disabled ? 'cursor-not-allowed opacity-40' : ''}`}
              >
                <span className="mt-0.5 text-slate-700">{opt.icon}</span>
                <span>
                  <span className="block text-sm font-medium text-slate-900">{opt.label}</span>
                  <span className="block text-xs text-slate-500">{opt.desc}</span>
                </span>
              </button>
            ))}
            {error && <p className="pt-1 text-sm text-red-600">{error}</p>}
          </div>
        )}
      </BaseModal.Body>
      <BaseModal.Footer>
        {phase === 'recording' ? (
          <button
            onClick={() => void finishRecording()}
            className="ml-auto flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-red-700"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            {isZh ? '结束并转写' : 'Stop & Transcribe'}
          </button>
        ) : (
          <>
            <button
              onClick={() => onOpenChange(false)}
              disabled={phase === 'finishing'}
              className="px-4 py-2 text-sm font-medium text-slate-600 transition hover:text-slate-900 disabled:opacity-40"
            >
              {isZh ? '取消' : 'Cancel'}
            </button>
            <button
              onClick={beginRecording}
              disabled={!supported || phase === 'finishing'}
              className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isZh ? '开始录制' : 'Start Recording'}
            </button>
          </>
        )}
      </BaseModal.Footer>
    </BaseModal>
  );
};

export default RecordModal;
