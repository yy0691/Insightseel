# Toast & Modal 统一体系改造指南

## 📋 目标

建立全站统一的 Toast 和 Modal 体系，确保任何样式改动都能"传染"到全局。

---

## 一、全局 Toast 体系

### 1. 已创建的基础架构

- ✅ `hooks/useToastStore.ts` - Toast 状态管理（Zustand）
- ✅ `components/ui/ToastHost.tsx` - Toast UI 渲染容器

### 2. 在 App.tsx 中集成 ToastHost

**位置**：在 `<div className="min-h-screen...">` 的最外层添加

```tsx
import { ToastHost } from './components/ui/ToastHost';

return (
  <div className="min-h-screen w-screen flex font-sans relative bg-gradient-to-br from-slate-50 to-slate-200">
    <ToastHost /> {/* 添加这一行 */}
    {/* 其他内容 */}
  </div>
);
```

### 3. 迁移现有错误提示

#### 3.1 App.tsx 中的错误提示

**找到**：
```tsx
{error && (
  <div role="alert" onClick={() => setError(null)} className="fixed top-5 right-5...">
    {/* 错误提示内容 */}
  </div>
)}
```

**替换为**：
```tsx
import { toast } from './hooks/useToastStore';

// 删除整个 error && <div> 块
// 在需要显示错误的地方，改为：
if (error) {
  toast.error({ 
    title: '出错了', 
    description: error 
  });
  setError(null); // 清空状态
}
```

#### 3.2 AccountPanel 中的同步消息

**找到**：
```tsx
const [syncMessage, setSyncMessage] = useState<string | null>(null);

// 在显示消息的地方：
setSyncMessage(`✓ ${t("syncedStats", ...)}`);
setTimeout(() => setSyncMessage(null), 5000);
```

**替换为**：
```tsx
import { toast } from '../hooks/useToastStore';

// 删除 syncMessage 状态
// 替换所有 setSyncMessage 调用：
toast.success({ 
  title: t("syncedStats", videos, subtitles, analyses, notes, chats) 
});

// 错误消息：
toast.error({ 
  title: t("error"), 
  description: result.error 
});
```

#### 3.3 SettingsModal 中的测试连接提示

**找到**：
```tsx
{testState.status !== 'idle' && (
  <p className={`text-xs ${testState.status === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
    {testState.message}
  </p>
)}
```

**替换为**：
```tsx
import { toast } from '../hooks/useToastStore';

// 在测试连接成功/失败时：
if (testState.status === 'success') {
  toast.success({ title: testState.message });
} else if (testState.status === 'error') {
  toast.error({ title: testState.message });
}
// 删除 UI 中的 testState 显示部分
```

### 4. 搜索并替换所有临时提示

**搜索关键词**：
- `fixed top-` / `fixed bottom-`
- `bg-red-` / `bg-emerald-` / `bg-rose-`
- `setSyncMessage` / `setExportMessage`
- `setError` / `setMessage`
- `role="alert"`

**替换策略**：
- 所有 `setError(...)` → `toast.error({ title: '错误', description: ... })`
- 所有 `setSyncMessage('✓ ...')` → `toast.success({ title: ... })`
- 所有 `setSyncMessage('✗ ...')` → `toast.error({ title: ... })`

---

## 二、全局 Modal 体系

### 1. 已创建的基础架构

- ✅ `components/ui/BaseModal.tsx` - 统一 Modal 外壳

### 2. 重构 SettingsModal

**当前结构**：
```tsx
return (
  <div className="fixed inset-0 z-50 ...">
    <div className="relative w-full max-w-xl ...">
      {/* 内容 */}
    </div>
  </div>
);
```

**改造为**：
```tsx
import { BaseModal } from './ui/BaseModal';

return (
  <BaseModal open={true} onOpenChange={onClose} size="lg">
    <BaseModal.Header 
      title={t('settingsTitle')} 
      subtitle={t('settingsDescription')} 
    />
    <BaseModal.Body>
      {/* 原有的表单内容，删除最外层容器 */}
    </BaseModal.Body>
    <BaseModal.Footer>
      {/* 原有的底部按钮 */}
    </BaseModal.Footer>
  </BaseModal>
);
```

**需要删除的代码**：
- 删除 `fixed inset-0` 遮罩层
- 删除 `relative w-full max-w-xl` 容器
- 删除关闭按钮（BaseModal 已提供）
- 删除 `backdrop-blur` 等样式（BaseModal 已处理）

### 3. 重构 AuthModal

**改造步骤**：
1. 将 `if (!isOpen) return null;` 改为使用 BaseModal 的 `open` prop
2. 删除遮罩和容器 div
3. 使用 `BaseModal.Header`、`BaseModal.Body`、`BaseModal.Footer`
4. 错误/成功消息改为使用 `toast`

### 4. 重构 FeedbackModal

**改造步骤**：
1. 删除 `fixed inset-0 bg-black/50` 遮罩
2. 删除 `rounded-2xl shadow-2xl` 容器
3. 使用 BaseModal 包装内容
4. 保持内部评分逻辑不变

### 5. AccountPanel 的处理

**选项 A**：如果 AccountPanel 需要作为 Modal 显示
- 使用 BaseModal 包装整个内容

**选项 B**：如果 AccountPanel 是侧边抽屉
- 保持现有实现，但统一视觉样式（圆角、阴影等）

---

## 三、统一视觉 Token

### Toast 视觉规范

```css
/* 位置 */
top: 20px (top-5)
right: 20px (right-5)

/* 容器 */
rounded-[24px]
bg-slate-900/90
border border-slate-900/60
shadow-xl shadow-slate-900/40
backdrop-blur-md

/* 图标 */
success: emerald-400, bg-emerald-500/20
error: rose-400, bg-rose-500/20
info: blue-400, bg-blue-500/20

/* 文字 */
title: text-xs font-semibold text-slate-100
description: text-xs text-slate-200/90
```

### Modal 视觉规范

```css
/* 遮罩 */
bg-black/35
backdrop-blur-md

/* 弹层 */
rounded-[32px]
bg-white
shadow-[0_18px_80px_rgba(15,23,42,0.32)]

/* 尺寸 */
sm: max-w-sm (360px)
md: max-w-md (480px)
lg: max-w-lg (640px)

/* 内边距 */
Header: px-8 py-6
Body: px-8 py-6
Footer: px-8 py-4

/* 按钮 */
Primary: bg-slate-900 text-white rounded-full
Secondary: border border-slate-200 bg-white text-slate-700 rounded-full
```

---

## 四、执行顺序（避免改崩）

### 阶段 1：基础集成（不破坏现有功能）

1. ✅ 在 App.tsx 添加 `<ToastHost />`
2. ✅ 保持现有错误提示不变
3. ✅ 新功能开始使用 `toast()` API

### 阶段 2：逐步迁移 Toast

1. 迁移 App.tsx 的错误提示
2. 迁移 AccountPanel 的同步消息
3. 迁移 SettingsModal 的测试提示
4. 搜索并迁移其他零散提示

### 阶段 3：重构 Modal（选一个最简单的开始）

1. 重构 FeedbackModal（最简单，内容少）
2. 重构 AuthModal
3. 重构 SettingsModal
4. 处理 AccountPanel（如果需要）

### 阶段 4：统一清扫

1. 搜索 `bg-black/50`、`shadow-2xl`、`rounded-2xl` 等
2. 搜索 `fixed inset-0`、`max-w-lg` 等
3. 统一替换为 BaseModal 或删除

---

## 五、迁移检查清单

### Toast 迁移

- [ ] App.tsx 错误提示已迁移
- [ ] AccountPanel 同步消息已迁移
- [ ] SettingsModal 测试提示已迁移
- [ ] 所有 `setError` 调用已改为 `toast.error`
- [ ] 所有 `setSyncMessage` 调用已改为 `toast.success/error`
- [ ] 已删除所有 `fixed top-` 错误提示 div

### Modal 迁移

- [ ] SettingsModal 已使用 BaseModal
- [ ] AuthModal 已使用 BaseModal
- [ ] FeedbackModal 已使用 BaseModal
- [ ] AccountPanel 已统一视觉样式（或使用 BaseModal）
- [ ] 已删除所有自定义遮罩层
- [ ] 已删除所有自定义关闭按钮

---

## 六、常见问题

### Q: 如何自定义 Toast 的显示时间？

```tsx
toast.success({ 
  title: '成功', 
  description: '操作完成',
  duration: 5000 // 5秒后消失，默认 4000ms
});
```

### Q: 如何阻止 Modal 点击遮罩关闭？

```tsx
<BaseModal 
  open={isOpen} 
  onOpenChange={setIsOpen}
  closeOnOverlayClick={false} // 禁用点击遮罩关闭
>
```

### Q: 如何隐藏 Modal 的关闭按钮？

```tsx
<BaseModal 
  open={isOpen} 
  onOpenChange={setIsOpen}
  showCloseButton={false} // 隐藏关闭按钮
>
```

### Q: Modal 内容需要滚动怎么办？

```tsx
<BaseModal.Body className="max-h-[70vh] overflow-y-auto">
  {/* 长内容 */}
</BaseModal.Body>
```

---

## 七、测试要点

1. **Toast 测试**：
   - 同时触发多个 toast，确认最多显示 2 条
   - 确认自动消失时间正确
   - 确认点击关闭功能正常

2. **Modal 测试**：
   - 确认 ESC 键关闭功能
   - 确认点击遮罩关闭功能（如果启用）
   - 确认动画流畅
   - 确认多个 Modal 的 z-index 正确

3. **视觉一致性**：
   - 所有 Toast 样式统一
   - 所有 Modal 样式统一
   - 响应式布局正常

---

完成以上改造后，任何 Toast 或 Modal 的样式改动都会自动应用到全站。

