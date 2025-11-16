# 🔧 修复同步问题 - 保留所有数据

## 问题说明

你遇到两个问题：
1. **视频 ID 格式错误** - 需要从文件名格式转换为 UUID
2. **Profile 不存在** - 用户资料没有自动创建

**好消息：可以修复这两个问题而不丢失任何数据！** ✅

---

## 🎯 完整修复步骤（保留所有数据）

### 第一步：修复 Profile

1. **访问 Supabase Dashboard**
   - 打开 https://supabase.com/dashboard
   - 选择你的项目
   - 点击 **SQL Editor**

2. **运行以下 SQL**

```sql
-- 为现有用户自动创建 profile
INSERT INTO public.profiles (id, email, full_name, avatar_url)
SELECT 
  id,
  email,
  raw_user_meta_data->>'full_name',
  raw_user_meta_data->>'avatar_url'
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles);
```

3. **验证是否成功**

```sql
-- 检查你的 profile 是否已创建
SELECT * FROM public.profiles 
WHERE id = '6ce0d1aa-5191-4e05-b470-0badeba05ec0';
```

如果返回一行数据，说明成功！✅

---

### 第二步：迁移视频 ID（保留数据）

1. **打开应用**
   - 在浏览器中打开你的应用

2. **打开浏览器控制台**
   - 按 **F12** 键
   - 切换到 **Console** 标签

3. **复制并运行修复脚本**
   - 打开文件：`scripts/quick-fix.js`
   - 复制全部内容
   - 粘贴到控制台
   - 按 **Enter** 运行

4. **等待完成**
   - 脚本会显示进度
   - 看到 "✨ 迁移完成！" 表示成功

5. **刷新页面**
   ```javascript
   location.reload();
   ```

---

### 第三步：同步到云端

1. **登录账户**
   - 点击右上角登录按钮
   - 输入邮箱和密码

2. **点击同步**
   - 点击用户头像
   - 点击 "同步到云端"
   - 等待同步完成

3. **验证**
   - 在 Supabase Dashboard 的 **Table Editor** 中
   - 查看 `video_metadata` 表
   - 应该能看到你的视频数据

---

## 📋 快速命令参考

### 修复 Profile（在 Supabase SQL Editor）

```sql
-- 一键创建缺失的 profiles
INSERT INTO public.profiles (id, email)
SELECT id, email FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles);
```

### 迁移视频 ID（在浏览器控制台）

```javascript
// 方法 1: 使用快速修复脚本
// 复制 scripts/quick-fix.js 的全部内容并运行

// 方法 2: 简单版本（如果上面的不工作）
// 只需刷新页面，新导入的视频会自动使用 UUID
location.reload();
```

---

## ✅ 验证修复是否成功

### 检查 Profile

在 Supabase SQL Editor 运行：

```sql
SELECT 
  u.id,
  u.email,
  CASE 
    WHEN p.id IS NOT NULL THEN '✅ 已创建'
    ELSE '❌ 缺失'
  END as profile_status
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id;
```

### 检查视频 ID

在浏览器控制台运行：

```javascript
// 打开数据库并检查
const request = indexedDB.open('InsightReelDB');
request.onsuccess = async (e) => {
  const db = e.target.result;
  const tx = db.transaction('videos', 'readonly');
  const store = tx.objectStore('videos');
  const videos = await store.getAll();
  
  videos.onsuccess = () => {
    const allVideos = videos.result;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    allVideos.forEach(v => {
      const isValid = uuidRegex.test(v.id);
      console.log(`${isValid ? '✅' : '❌'} ${v.name}: ${v.id}`);
    });
  };
};
```

---

## 🚨 如果修复脚本不工作

### 备选方案：手动导出/导入

1. **导出笔记和分析**
   - 在每个视频页面，复制重要的笔记和分析结果
   - 保存到文本文件

2. **清空数据库**
   ```javascript
   indexedDB.deleteDatabase('InsightReelDB');
   location.reload();
   ```

3. **重新导入视频**
   - 视频文件还在你的电脑上
   - 重新拖入应用即可

4. **手动粘贴笔记**
   - 将之前保存的内容粘贴回去

---

## 💡 预防未来问题

### 定期备份

```javascript
// 在控制台运行，导出所有数据
async function exportAllData() {
  const request = indexedDB.open('InsightReelDB');
  request.onsuccess = async (e) => {
    const db = e.target.result;
    const stores = ['videos', 'subtitles', 'analyses', 'notes', 'chatHistory'];
    const data = {};
    
    for (const storeName of stores) {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const all = await new Promise(resolve => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
      });
      data[storeName] = all;
    }
    
    // 下载为 JSON
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-${new Date().toISOString()}.json`;
    a.click();
    
    console.log('✅ 备份已下载');
  };
}

exportAllData();
```

### 定期同步到云端

- 每次做了重要工作后，点击"同步到云端"
- 这样数据就安全地保存在 Supabase 中

---

## 📞 常见问题

### Q: 修复脚本运行后没有变化？
A: 
1. 确保控制台没有错误信息
2. 刷新页面：`location.reload()`
3. 检查是否真的需要迁移（可能已经是 UUID 格式）

### Q: Profile 创建后还是报错？
A: 
1. 检查 SQL 是否成功执行
2. 确认用户 ID 是否正确
3. 尝试登出再登录

### Q: 同步时还是报 UUID 错误？
A: 
1. 确认迁移脚本已成功运行
2. 在控制台检查视频 ID 格式
3. 如果还是旧格式，重新运行修复脚本

### Q: 我的视频文件会丢失吗？
A: **不会！** 视频文件在你的电脑上，只是数据库记录需要更新。

---

## 🎯 推荐流程总结

```
1. 修复 Profile（Supabase SQL Editor）
   ↓
2. 运行迁移脚本（浏览器控制台）
   ↓
3. 刷新页面
   ↓
4. 登录并同步到云端
   ↓
5. 验证数据是否正确
```

**整个过程不会丢失任何数据！** ✅

---

## 📝 相关文件

- **修复脚本**: `scripts/quick-fix.js`
- **迁移指南**: `MIGRATION_GUIDE.md`
- **数据库迁移**: `supabase/migrations/20251112021718_create_auth_and_sync_tables.sql`

---

**更新时间**: 2024-11-12  
**状态**: ✅ 可以保留所有数据
