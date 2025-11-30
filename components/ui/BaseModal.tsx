/**
 * BaseModal Component
 * 全局 Modal 基础组件
 * 
 * 统一规范：
 * - 遮罩：fixed inset-0, bg-black/35, backdrop-blur-md
 * - 弹层：居中，圆角 28-32px，白色背景
 * - 动画：scale 0.96 → 1 + opacity 0 → 1 (200ms)
 * - 交互：点击遮罩关闭（可选），Esc 关闭
 * 
 * 使用方式：
 * <BaseModal open={isOpen} onOpenChange={setIsOpen} size="md">
 *   <BaseModal.Header title="标题" subtitle="副标题（可选）" />
 *   <BaseModal.Body>
 *     内容区域
 *   </BaseModal.Body>
 *   <BaseModal.Footer>
 *     <button>取消</button>
 *     <button>确认</button>
 *   </BaseModal.Footer>
 * </BaseModal>
 */

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export type ModalSize = 'sm' | 'md' | 'lg';

interface BaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  size?: ModalSize;
  closeOnOverlayClick?: boolean; // 点击遮罩是否关闭，默认 true
  showCloseButton?: boolean; // 是否显示右上角关闭按钮，默认 true
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

// 类型声明：让 TypeScript 知道 BaseModal 有这些子组件
interface BaseModalComponent extends React.FC<BaseModalProps> {
  Header: React.FC<HeaderProps>;
  Body: React.FC<BodyProps>;
  Footer: React.FC<FooterProps>;
}

// 前向声明（在 Header/Body/Footer 定义之前）
interface HeaderProps {
  title: string;
  subtitle?: string;
}

interface BodyProps {
  children: React.ReactNode;
  className?: string;
}

interface FooterProps {
  children: React.ReactNode;
  className?: string;
}

export const BaseModal: BaseModalComponent = ({
  open,
  onOpenChange,
  children,
  size = 'md',
  closeOnOverlayClick = true,
  showCloseButton = true,
}) => {
  // ESC 键关闭
  useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={closeOnOverlayClick ? () => onOpenChange(false) : undefined}
    >
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/35 backdrop-blur-md" />

      {/* 弹层容器 */}
      <div
        className={`
          relative w-full ${sizeClasses[size]}
          rounded-[32px]
          bg-white
          shadow-[0_18px_80px_rgba(15,23,42,0.32)]
          overflow-hidden
          animate-in fade-in zoom-in-95
          duration-200
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        {showCloseButton && (
          <button
            onClick={() => onOpenChange(false)}
            className="
              absolute right-5 top-5
              flex h-9 w-9 items-center justify-center
              rounded-full
              bg-slate-100/80
              text-slate-500
              hover:bg-slate-200
              hover:text-slate-700
              transition-colors
              z-10
            "
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* 内容插槽 */}
        {children}
      </div>
    </div>
  );
};

// Header 子组件
const Header: React.FC<HeaderProps> = ({ title, subtitle }) => (
  <div className="border-b border-slate-100 px-8 py-6">
    <h2 className="text-lg font-semibold tracking-tight text-slate-900">
      {title}
    </h2>
    {subtitle && (
      <p className="mt-1 text-sm text-slate-500 leading-relaxed">
        {subtitle}
      </p>
    )}
  </div>
);

// Body 子组件
const Body: React.FC<BodyProps> = ({ children, className = '' }) => (
  <div className={`px-8 py-6 ${className}`}>
    {children}
  </div>
);

// Footer 子组件
const Footer: React.FC<FooterProps> = ({ children, className = '' }) => (
  <div className={`
    flex items-center justify-between
    border-t border-slate-100
    bg-slate-50/60
    px-8 py-4
    ${className}
  `}>
    {children}
  </div>
);

// 将子组件附加到 BaseModal
BaseModal.Header = Header;
BaseModal.Body = Body;
BaseModal.Footer = Footer;

