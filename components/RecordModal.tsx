import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Monitor, Mic, Square, Loader2 } from 'lucide-react';
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
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const supported = isRecordingSupported();
  const screenSupported = isScreenRecordingSupported();

  // Two independent source toggles
  const [useSystem, setUseSystem] = useState(screenSupported);
  const [useMic, setUseMic] = useState(true);

  // Derived recording mode
  const mode: RecordingMode = useSystem && useMic ? 'screen-mic' : useSystem ? 'screen' : 'mic';
  const canStart = supported && (useSystem || useMic);

  const controllerRef = useRef<RecordingController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Source toggle row helper
  const SourceToggle = ({
    icon, label, desc, checked, onChange, disabled,
  }: {
    icon: React.ReactNode; label: string; desc: string;
    checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
  }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={[
        'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition',
        checked ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300',
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
      ].join(' ')}
    >
      <span className="text-slate-700 flex-shrink-0">{icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        <span className="block text-xs text-slate-500">{desc}</span>
      </span>
      {/* Toggle pill */}
      <span className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-slate-900' : 'bg-slate-200'}`}>
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-1'}`} />
      </span>
    </button>
  );

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
            <SourceToggle
              icon={<Monitor className="h-5 w-5" />}
              label={isZh ? '屏幕 / 系统音频' : 'Screen / System Audio'}
              desc={isZh ? '录制屏幕画面及电脑内部声音（会议、视频等）' : 'Capture screen + computer audio (meetings, videos, etc.)'}
              checked={useSystem}
              onChange={setUseSystem}
              disabled={!screenSupported}
            />
            <SourceToggle
              icon={<Mic className="h-5 w-5" />}
              label={isZh ? '麦克风' : 'Microphone'}
              desc={isZh ? '录制你的声音' : 'Record your voice'}
              checked={useMic}
              onChange={setUseMic}
            />
            {!canStart && (
              <p className="pt-1 text-xs text-amber-600">
                {isZh ? '请至少启用一个音频来源' : 'Enable at least one audio source'}
              </p>
            )}
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
              disabled={!canStart || phase === 'finishing'}
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
