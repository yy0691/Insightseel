# Toast & Modal 迁移示例

## Toast 迁移示例

### 示例 1：App.tsx 错误提示

**迁移前**：
```tsx
const [error, setError] = useState<string | null>(null);

return (
  <div>
    {error && (
      <div
        role="alert"
        onClick={() => setError(null)}
        className="fixed top-5 right-5 z-50 cursor-pointer ..."
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-600/20">
          <span className="text-lg leading-none text-rose-400">✕</span>
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold">出错了</p>
          <p className="mt-1 text-xs">{error}</p>
        </div>
      </div>
    )}
  </div>
);
```

**迁移后**：
```tsx
import { toast } from './hooks/useToastStore';

// 删除 error 状态（如果不再需要）
// 或者保留用于其他用途，但不再用于 UI 显示

// 在需要显示错误的地方：
try {
  // ... 操作
} catch (err) {
  toast.error({ 
    title: '出错了', 
    description: err instanceof Error ? err.message : '未知错误' 
  });
}
```

### 示例 2：AccountPanel 同步消息

**迁移前**：
```tsx
const [syncMessage, setSyncMessage] = useState<string | null>(null);

const handleSync = async () => {
  try {
    const result = await syncService.syncToCloud(user.id);
    if (result.success) {
      setSyncMessage(`✓ ${t("syncedStats", ...)}`);
    } else {
      setSyncMessage(`✗ ${t("error")}: ${result.error}`);
    }
  } catch (error) {
    setSyncMessage(`✗ ${t("error")}: ${error.message}`);
  } finally {
    setTimeout(() => setSyncMessage(null), 5000);
  }
};

// UI 中：
{syncMessage && (
  <div className={`rounded-2xl px-3 py-2 text-xs ${
    syncMessage.startsWith("✓") ? "bg-emerald-50" : "bg-rose-50"
  }`}>
    {syncMessage}
  </div>
)}
```

**迁移后**：
```tsx
import { toast } from '../hooks/useToastStore';

// 删除 syncMessage 状态

const handleSync = async () => {
  try {
    const result = await syncService.syncToCloud(user.id);
    if (result.success) {
      toast.success({ 
        title: t("syncedStats", videos, subtitles, analyses, notes, chats) 
      });
    } else {
      toast.error({ 
        title: t("error"), 
        description: result.error 
      });
    }
  } catch (error) {
    toast.error({ 
      title: t("error"), 
      description: error instanceof Error ? error.message : t("anErrorOccurred")
    });
  }
};

// UI 中删除 syncMessage 显示部分
```

---

## Modal 迁移示例

### 示例 1：FeedbackModal

**迁移前**：
```tsx
return (
  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-gradient-to-br from-slate-50 to-slate-200 rounded-2xl shadow-2xl w-full max-w-sm border border-white/30">
      <div className="p-6 text-center">
        <h2 className="text-xl font-semibold mb-4">{t('feedbackModalTitle')}</h2>
        {/* 内容 */}
      </div>
      <div className="p-4 bg-slate-200/50 flex justify-end space-x-3 rounded-b-2xl">
        <button onClick={onClose}>{t('cancel')}</button>
        <button onClick={handleSubmit}>{t('feedbackModalSubmit')}</button>
      </div>
    </div>
  </div>
);
```

**迁移后**：
```tsx
import { BaseModal } from './ui/BaseModal';

return (
  <BaseModal open={true} onOpenChange={onClose} size="sm">
    <BaseModal.Header title={t('feedbackModalTitle')} />
    <BaseModal.Body className="text-center">
      {/* 评分和选项内容，保持原有逻辑 */}
      <div className="flex justify-center items-center mb-6 space-x-1">
        {/* 星星评分 */}
      </div>
      <h3 className="text-md font-medium mb-3">{t('feedbackModalQuestion')}</h3>
      {/* 选项 */}
    </BaseModal.Body>
    <BaseModal.Footer className="flex justify-end gap-3">
      <button
        onClick={onClose}
        className="h-9 px-4 text-xs font-medium rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      >
        {t('cancel')}
      </button>
      <button
        onClick={handleSubmit}
        disabled={rating === 0}
        className="h-9 px-5 text-xs font-medium rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {t('feedbackModalSubmit')}
      </button>
    </BaseModal.Footer>
  </BaseModal>
);
```

### 示例 2：SettingsModal

**迁移前**：
```tsx
return (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-md p-4">
    <div className="relative w-full max-w-xl overflow-hidden rounded-[32px] bg-white/95 backdrop-blur-xl shadow-[0_18px_80px_rgba(15,23,42,0.32)] border border-white/20">
      <button onClick={onClose} className="absolute right-5 top-5 ...">
        <X className="h-4 w-4" />
      </button>
      <div className="border-b border-slate-100 px-8 py-6">
        <h2>{t('settingsTitle')}</h2>
        <p>{t('settingsDescription')}</p>
      </div>
      <div className="px-8 py-6 max-h-[70vh] overflow-y-auto">
        {/* 表单内容 */}
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-8 py-4">
        {/* 按钮 */}
      </div>
    </div>
  </div>
);
```

**迁移后**：
```tsx
import { BaseModal } from './ui/BaseModal';
import { toast } from '../hooks/useToastStore';

return (
  <BaseModal open={true} onOpenChange={onClose} size="lg">
    <BaseModal.Header 
      title={t('settingsTitle')} 
      subtitle={t('settingsDescription')} 
    />
    <BaseModal.Body className="max-h-[70vh] overflow-y-auto custom-scrollbar space-y-6">
      {/* 表单内容，删除最外层的 px-8 py-6 */}
    </BaseModal.Body>
    <BaseModal.Footer>
      <div className="flex items-center gap-3">
        {/* 测试按钮 */}
      </div>
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="h-9 px-4 text-xs font-medium rounded-full text-slate-600 hover:bg-slate-100">
          {t('cancel')}
        </button>
        <button onClick={handleSave} className="h-9 px-5 text-xs font-medium rounded-full bg-slate-900 text-white hover:bg-slate-800">
          {t('saveChanges')}
        </button>
      </div>
    </BaseModal.Footer>
  </BaseModal>
);

// 测试连接时：
const handleTest = async () => {
  setTestState({ status: 'testing', message: '' });
  // ... 测试逻辑
  if (success) {
    toast.success({ title: t('testSuccess') });
  } else {
    toast.error({ title: t('testFailure'), description: errorMessage });
  }
};
```

---

## 关键改造点总结

### Toast 改造要点

1. **删除所有** `fixed top-` / `fixed bottom-` 错误提示 div
2. **删除所有** `setError` / `setSyncMessage` 状态（如果只用于显示）
3. **替换所有** `setError(...)` → `toast.error({ title, description })`
4. **替换所有** `setSyncMessage('✓ ...')` → `toast.success({ title })`
5. **替换所有** `setSyncMessage('✗ ...')` → `toast.error({ title, description })`

### Modal 改造要点

1. **删除** `fixed inset-0` 遮罩层
2. **删除** `bg-black/50` / `backdrop-blur-sm` 等遮罩样式
3. **删除** `relative w-full max-w-*` 容器
4. **删除** 自定义关闭按钮（BaseModal 已提供）
5. **使用** `BaseModal.Header`、`BaseModal.Body`、`BaseModal.Footer`
6. **统一** 按钮样式为 `rounded-full` + 统一颜色

---

## 搜索替换清单

### 需要搜索并替换的模式

1. `fixed inset-0.*bg-black` → 删除，使用 BaseModal
2. `fixed top-.*z-50` → 删除，使用 toast
3. `setError\(` → 改为 `toast.error({`
4. `setSyncMessage\(` → 改为 `toast.success({` 或 `toast.error({`
5. `rounded-2xl.*shadow-2xl` → 检查是否为 Modal，改为 BaseModal
6. `max-w-lg` / `max-w-md` / `max-w-xl` → 检查是否为 Modal，改为 BaseModal size prop

