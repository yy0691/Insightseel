# 🔧 视频 ID 迁移指南

## 问题说明

你遇到的错误是因为：

1. **视频 ID 格式不正确**：旧版本使用文件名作为 ID（如 `"video.mp4-123456"`），但 Supabase 数据库要求 UUID 格式（如 `"550e8400-e29b-41d4-a716-446655440000"`）

2. **Profile 不存在**：用户资料可能没有正确创建

---

## 🚀 快速解决方案

### 方案 1：删除旧视频，重新导入（推荐）

这是最简单的方法：

1. **备份重要数据**（如果有）
   - 导出笔记和分析结果

2. **清空本地数据**
   ```javascript
   // 在浏览器控制台（F12）运行
   indexedDB.deleteDatabase('InsightReelDB');
   ```

3. **刷新页面**
   ```javascript
   location.reload();
   ```

4. **重新导入视频**
   - 现在导入的视频会自动使用 UUID 格式

5. **重新同步到云端**
   - 登录账户
   - 点击"同步到云端"

---

### 方案 2：自动迁移现有数据

如果你有很多视频和分析结果不想丢失：

1. **打开浏览器控制台**（F12）

2. **运行迁移脚本**
   ```javascript
   // 检查是否需要迁移
   await checkMigrationNeeded()
   
   // 如果返回 true，执行迁移
   await migrateVideoIds()
   ```

3. **刷新页面**
   ```javascript
   location.reload();
   ```

4. **重新同步**
   - 登录账户
   - 点击"同步到云端"

---

## 🔍 修复 Profile 问题

如果同步时提示 profile 不存在：

### 方法 1：在 Supabase Dashboard 手动创建

1. 访问 https://supabase.com/dashboard
2. 选择你的项目
3. 点击 **Table Editor** → **profiles**
4. 点击 **Insert row**
5. 填写：
   - `id`: 你的用户 ID（从错误信息中复制）
   - `email`: 你的邮箱
   - `full_name`: 你的名字（可选）
   - 其他字段会自动填充

### 方法 2：重新注册

1. 登出当前账户
2. 注册一个新账户
3. 新账户的 profile 会自动创建

---

## 📋 详细步骤说明

### 清空数据库的完整步骤

```javascript
// 1. 打开浏览器控制台（F12）

// 2. 删除数据库
const deleteDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('InsightReelDB');
    request.onsuccess = () => {
      console.log('✅ 数据库已删除');
      resolve(true);
    };
    request.onerror = () => {
      console.error('❌ 删除失败');
      reject(false);
    };
  });
};

// 3. 执行删除
await deleteDB();

// 4. 刷新页面
location.reload();
```

### 迁移数据的完整步骤

```javascript
// 1. 检查是否需要迁移
const needsMigration = await checkMigrationNeeded();
console.log('需要迁移:', needsMigration);

// 2. 如果需要，执行迁移
if (needsMigration) {
  const result = await migrateVideoIds();
  console.log('迁移结果:', result);
  
  if (result.success) {
    console.log('✅ 迁移成功！');
    // 刷新页面
    location.reload();
  } else {
    console.error('❌ 迁移失败:', result.errors);
  }
}
```

---

## ⚠️ 注意事项

### 删除数据库前

- ✅ 确保没有重要的未同步数据
- ✅ 如果有重要笔记，先手动备份
- ✅ 视频文件本身不会丢失（它们在你的电脑上）

### 迁移数据时

- ✅ 确保没有其他标签页打开应用
- ✅ 迁移过程中不要关闭页面
- ✅ 迁移完成后刷新页面

---

## 🎯 推荐流程

对于大多数用户，推荐以下流程：

```
1. 备份重要笔记（如果有）
   ↓
2. 删除本地数据库
   ↓
3. 刷新页面
   ↓
4. 重新导入视频
   ↓
5. 登录并同步到云端
```

---

## 🐛 常见问题

### Q: 删除数据库后视频文件会丢失吗？
A: 不会！视频文件在你的电脑上，只是数据库记录被清空了。重新导入即可。

### Q: 迁移失败怎么办？
A: 使用方案 1（删除重新导入），这是最可靠的方法。

### Q: 已经同步到云端的数据怎么办？
A: 需要在 Supabase Dashboard 中手动删除旧数据，或者重新创建项目。

### Q: 为什么会出现这个问题？
A: 早期版本没有考虑云同步，使用了简单的文件名作为 ID。现在为了支持 Supabase，必须使用标准的 UUID 格式。

---

## 📞 需要帮助？

如果遇到问题：

1. 查看浏览器控制台的错误信息
2. 检查 Supabase Dashboard 的 Logs
3. 尝试方案 1（最简单可靠）

---

## 🔄 未来版本

下次导入视频时，会自动使用 UUID 格式，不会再出现这个问题。

---

**更新日期：** 2024-11-12  
**版本：** 1.0.0
