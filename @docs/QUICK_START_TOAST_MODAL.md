# Toast & Modal 体系快速开始

## 🚀 5 分钟快速集成

### 第一步：在 App.tsx 添加 ToastProvider 和 ToastHost

**1.1 在 App 组件外层添加 ToastProvider**

在 `App.tsx` 的 `App` 组件中，用 `ToastProvider` 包裹 `LanguageProvider`：

```tsx
import { ToastProvider } from './hooks/useToastStore';

return (
  <ToastProvider>
    <LanguageProvider language={settings.language || "en"}>
      <AppContent settings={settings} onSettingsChange={setSettings} />
    </LanguageProvider>
  </ToastProvider>
);
```

**1.2 在 AppContent 组件中添加 ToastHost**

在 `AppContent` 组件的 `return` 语句最外层 div，添加 `<ToastHost />`：

```tsx
import { ToastHost } from './components/ui/ToastHost';

return (
  <div className="min-h-screen w-screen flex font-sans relative bg-gradient-to-br from-slate-50 to-slate-200">
    <ToastHost /> {/* 👈 添加这一行 */}
    {/* 其他内容保持不变 */}
  </div>
);
```

### 第二步：测试 Toast（可选）

在任意地方测试 Toast 是否工作：

```tsx
import { toast } from './hooks/useToastStore';

// 测试按钮
<button onClick={() => toast.success({ title: '测试成功' })}>
  测试 Toast
</button>
```

### 第三步：开始迁移

按照 `TOAST_MODAL_REFACTOR_GUIDE.md` 中的步骤逐步迁移。

---

## 📝 常用 API

### Toast API

```tsx
import { toast } from './hooks/useToastStore';

// 成功提示
toast.success({ 
  title: '操作成功',
  description: '数据已保存', // 可选
  duration: 4000 // 可选，默认 4000ms
});

// 错误提示
toast.error({ 
  title: '操作失败',
  description: '请检查网络连接'
});

// 信息提示
toast.info({ 
  title: '处理中',
  description: '正在同步数据...'
});
```

### BaseModal API

```tsx
import { BaseModal } from './components/ui/BaseModal';

<BaseModal 
  open={isOpen} 
  onOpenChange={setIsOpen}
  size="md" // 'sm' | 'md' | 'lg'
  closeOnOverlayClick={true} // 默认 true
  showCloseButton={true} // 默认 true
>
  <BaseModal.Header 
    title="标题"
    subtitle="副标题（可选）"
  />
  <BaseModal.Body>
    内容区域
  </BaseModal.Body>
  <BaseModal.Footer>
    <button>取消</button>
    <button>确认</button>
  </BaseModal.Footer>
</BaseModal>
```

---

## ⚠️ 注意事项

1. **不要同时保留新旧实现**：迁移后立即删除旧的错误提示 div
2. **Toast 会自动消失**：不需要手动调用 `removeToast`
3. **Modal 会自动处理 ESC 键**：不需要手动添加事件监听
4. **统一使用 BaseModal**：所有 Modal 都应该使用 BaseModal，不要自定义遮罩

---

## 🔍 验证清单

迁移完成后，检查：

- [ ] 所有错误提示都通过 Toast 显示
- [ ] 所有 Modal 都使用 BaseModal
- [ ] 没有残留的 `fixed top-` 错误提示
- [ ] 没有残留的自定义 Modal 遮罩
- [ ] Toast 和 Modal 的样式统一

