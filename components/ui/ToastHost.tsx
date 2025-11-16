/**
 * ToastHost Component
 * 全局 Toast 渲染容器
 * 
 * 统一视觉规范：
 * - 位置：右上角，离边缘 20px
 * - 圆角：24px
 * - 背景：slate-900/90
 * - 最大同时显示：2 条
 * - 堆叠方向：向下堆叠
 */

import React, { useEffect } from 'react';
import { useToastStore, type Toast, setToastContext } from '../../hooks/useToastStore';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';

const ToastItem: React.FC<{ toast: Toast }> = ({ toast }) => {
  const { removeToast } = useToastStore();

  const iconConfig = {
    success: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
    error: { icon: X, color: 'text-rose-400', bg: 'bg-rose-500/20' },
    info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/20' },
  };

  const config = iconConfig[toast.type];
  const Icon = config.icon;

  return (
    <div
      onClick={() => removeToast(toast.id)}
      className="
        flex items-start gap-3
        rounded-[24px]
        border border-slate-900/60
        bg-slate-900/90
        backdrop-blur-md
        px-5 py-4
        shadow-xl shadow-slate-900/40
        text-slate-50
        max-w-sm
        cursor-pointer
        transition-all
        hover:bg-slate-900
        active:scale-[0.96]
        animate-in slide-in-from-top-2 fade-in
      "
    >
      {/* 左侧图标 */}
      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${config.bg}`}>
        <Icon className={`h-4 w-4 ${config.color}`} />
      </div>

      {/* 文案 */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold tracking-wide text-slate-100">
          {toast.title}
        </p>
        {toast.description && (
          <p className="mt-1 text-xs leading-relaxed text-slate-200/90">
            {toast.description}
          </p>
        )}
      </div>
    </div>
  );
};

export const ToastHost: React.FC = () => {
  const context = useToastStore();

  // 初始化 toast API 的 context 引用
  useEffect(() => {
    setToastContext(context);
  }, [context]);

  const { toasts } = context;

  if (toasts.length === 0) return null;

  return (
    <div
      className="
        fixed top-5 right-5 z-[100]
        flex flex-col gap-3
        pointer-events-none
      "
      style={{ pointerEvents: 'none' }}
    >
      {toasts.map((toast) => (
        <div key={toast.id} style={{ pointerEvents: 'auto' }}>
          <ToastItem toast={toast} />
        </div>
      ))}
    </div>
  );
};

