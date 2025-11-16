# 🚀 Supabase 快速设置指南

## 第一步：在 Supabase Dashboard 创建表

### 1. 打开 SQL Editor
1. 访问 https://supabase.com/dashboard
2. 选择你的项目
3. 点击左侧菜单的 **SQL Editor** 图标 (看起来像 `</>`)
4. 点击右上角的 **New Query** 按钮

### 2. 复制并执行 SQL
1. 打开文件：`supabase/migrations/20251112021718_create_auth_and_sync_tables.sql`
2. 全选并复制所有内容（Ctrl+A, Ctrl+C）
3. 粘贴到 Supabase SQL Editor 中
4. 点击右下角的 **Run** 按钮（或按 Ctrl+Enter）

### 3. 验证表是否创建成功
1. 点击左侧菜单的 **Table Editor** 图标
2. 你应该看到以下 6 个表：
   - ✅ `profiles` - 用户资料
   - ✅ `video_metadata` - 视频元数据
   - ✅ `subtitles` - 字幕
   - ✅ `analyses` - AI 分析结果
   - ✅ `notes` - 用户笔记
   - ✅ `chat_history` - 聊天历史

如果看到这些表，说明设置成功！🎉

---

## 第二步：配置环境变量

### 1. 获取 Supabase 凭证
1. 在 Supabase Dashboard 中，点击左侧的 **Settings** (齿轮图标)
2. 点击 **API**
3. 你会看到两个重要的值：
   - **Project URL** (类似 `https://xxxxx.supabase.co`)
   - **anon public** key (一长串字符)

### 2. 创建 .env 文件
在项目根目录创建 `.env` 文件（如果还没有），添加：

```env
VITE_SUPABASE_URL=你的Project URL
VITE_SUPABASE_ANON_KEY=你的anon public key
```

**示例：**
```env
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. 重启开发服务器
```bash
# 停止当前服务器（Ctrl+C）
# 重新启动
npm run dev
```

---

## 第三步：测试连接

### 方法 1：在应用中测试
1. 打开应用
2. 点击右上角的登录按钮
3. 注册一个新账户或登录
4. 如果成功登录，说明连接正常！

### 方法 2：使用浏览器控制台测试
1. 打开应用
2. 按 F12 打开开发者工具
3. 切换到 **Console** 标签
4. 输入以下命令并回车：

```javascript
// 快速测试
quickTestSupabase()

// 或完整测试
testSupabase()
```

如果看到 ✅ 表示成功！

---

## 常见问题

### ❌ 执行 SQL 时报错
**可能原因：**
- 表已经存在（重复执行）
- 没有权限

**解决方法：**
1. 如果是重复执行，可以忽略错误
2. 如果是权限问题，确保你是项目的 Owner

### ❌ 应用无法连接 Supabase
**检查清单：**
- [ ] `.env` 文件是否在项目根目录
- [ ] 环境变量名称是否正确（`VITE_` 前缀）
- [ ] URL 和 Key 是否正确复制（没有多余空格）
- [ ] 是否重启了开发服务器

### ❌ 登录后看不到用户资料
**可能原因：**
- `profiles` 表的触发器没有正确创建

**解决方法：**
1. 在 SQL Editor 中执行：
```sql
-- 检查触发器是否存在
SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
```
2. 如果没有结果，重新执行整个迁移 SQL

---

## 数据库结构说明

### 🎯 设计理念
- **视频文件**：保存在浏览器本地（IndexedDB），不上传到云端
- **元数据和分析结果**：同步到 Supabase 云端
- **优点**：节省存储空间，支持大文件，数据可跨设备同步

### 📊 表关系
```
auth.users (Supabase 内置)
    ↓
profiles (用户资料)
    ↓
video_metadata (视频元数据)
    ↓
    ├── subtitles (字幕)
    ├── analyses (分析结果)
    ├── notes (笔记)
    └── chat_history (聊天记录)
```

### 🔒 安全性
- 所有表都启用了 Row Level Security (RLS)
- 用户只能访问自己的数据
- 自动验证用户身份

---

## 下一步

设置完成后，你可以：

1. **注册账户** - 在应用中注册并登录
2. **导入视频** - 添加视频并生成分析
3. **同步数据** - 使用账户面板的同步功能
4. **跨设备访问** - 在其他设备登录同一账户，数据自动同步

---

## 需要更多帮助？

- 📖 查看完整文档：`SUPABASE_SETUP.md`
- 🔧 查看代码：`services/authService.ts` 和 `services/syncService.ts`
- 💬 Supabase 官方文档：https://supabase.com/docs

---

**祝你使用愉快！** 🎉
