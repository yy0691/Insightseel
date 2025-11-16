/**
 * Global Toast Store
 * 全局 Toast 状态管理（使用 React Context + useState）
 * 
 * 使用方式：
 * import { toast } from './hooks/useToastStore';
 * 
 * toast.success({ title: '成功', description: '操作完成' });
 * toast.error({ title: '错误', description: '操作失败' });
 * toast.info({ title: '提示', description: '正在处理...' });
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number; // 自动消失时间（毫秒），默认 4000
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

// 生成唯一 ID
const generateId = () => `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toastData: Omit<Toast, 'id'>) => {
    const id = generateId();
    const toast: Toast = {
      ...toastData,
      id,
      duration: toastData.duration ?? 4000,
    };

    setToasts((prev) => {
      const newToasts = [...prev, toast].slice(-2); // 最多同时显示 2 条
      return newToasts;
    });

    // 自动移除
    if (toast.duration && toast.duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, toast.duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, clearAll }}>
      {children}
    </ToastContext.Provider>
  );
};

export const useToastStore = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToastStore must be used within ToastProvider');
  }
  return context;
};

/**
 * Toast API - 业务代码中使用的统一接口
 * 注意：需要在 ToastProvider 内部使用
 */
let toastContextRef: ToastContextType | null = null;

export const setToastContext = (context: ToastContextType) => {
  toastContextRef = context;
};

export const toast = {
  success: (data: { title: string; description?: string; duration?: number }) => {
    if (toastContextRef) {
      toastContextRef.addToast({ ...data, type: 'success' });
    } else {
      console.warn('Toast context not initialized. Make sure ToastProvider is mounted.');
    }
  },
  
  error: (data: { title: string; description?: string; duration?: number }) => {
    if (toastContextRef) {
      toastContextRef.addToast({ ...data, type: 'error' });
    } else {
      console.warn('Toast context not initialized. Make sure ToastProvider is mounted.');
    }
  },
  
  info: (data: { title: string; description?: string; duration?: number }) => {
    if (toastContextRef) {
      toastContextRef.addToast({ ...data, type: 'info' });
    } else {
      console.warn('Toast context not initialized. Make sure ToastProvider is mounted.');
    }
  },
};

