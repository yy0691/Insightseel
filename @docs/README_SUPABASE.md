# 🗄️ Supabase 数据库连接指南

欢迎！这个指南将帮助你在 Supabase 中创建数据库表，实现用户认证和数据云同步功能。

---

## 📚 文档导航

根据你的需求选择合适的文档：

### 🚀 快速开始（推荐新手）
**文件：** [`QUICK_START_SUPABASE.md`](./QUICK_START_SUPABASE.md)

适合：第一次使用 Supabase 的用户

包含：
- ✅ 简单的 3 步设置流程
- ✅ 清晰的操作说明
- ✅ 常见问题解答

**预计时间：** 5-10 分钟

---

### 📖 详细图文教程
**文件：** [`docs/supabase-setup-steps.md`](./docs/supabase-setup-steps.md)

适合：需要详细步骤的用户

包含：
- ✅ 每一步的详细说明
- ✅ 可视化的界面指引
- ✅ 完整的故障排除指南

**预计时间：** 10-15 分钟

---

### 🔧 完整技术文档
**文件：** [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md)

适合：开发者和高级用户

包含：
- ✅ 数据库架构说明
- ✅ 安全策略详解
- ✅ CLI 使用方法
- ✅ 高级配置选项

**预计时间：** 15-20 分钟

---

## 🎯 快速开始（3 步）

如果你只想快速开始，按照以下步骤操作：

### 1️⃣ 在 Supabase 创建表

1. 访问 https://supabase.com/dashboard
2. 选择你的项目
3. 点击 **SQL Editor** → **New Query**
4. 复制 `supabase/migrations/20251112021718_create_auth_and_sync_tables.sql` 的全部内容
5. 粘贴并点击 **Run**

### 2️⃣ 配置环境变量

在项目根目录创建 `.env` 文件：

```env
VITE_SUPABASE_URL=你的项目URL
VITE_SUPABASE_ANON_KEY=你的anon密钥
```

在 Supabase Dashboard 的 **Settings** → **API** 中找到这些值。

### 3️⃣ 重启并测试

```bash
# 重启开发服务器
npm run dev

# 在浏览器控制台测试（F12）
quickTestSupabase()
```

看到 ✅ 就成功了！

---

## 🗂️ 数据库结构概览

创建成功后，你将拥有以下表：

| 表名 | 用途 | 说明 |
|------|------|------|
| `profiles` | 用户资料 | 存储用户基本信息 |
| `video_metadata` | 视频元数据 | 存储视频信息（不含文件） |
| `subtitles` | 字幕 | 存储视频字幕内容 |
| `analyses` | AI 分析 | 存储分析结果 |
| `notes` | 笔记 | 存储用户笔记 |
| `chat_history` | 聊天记录 | 存储 AI 对话历史 |

**重要说明：**
- 📹 视频文件保存在本地（浏览器 IndexedDB）
- ☁️ 只有元数据和分析结果同步到云端
- 🔒 所有数据都有用户级别的访问控制

---

## 🧪 测试工具

项目包含了测试脚本帮助你验证连接：

### 在浏览器控制台使用

```javascript
// 快速测试（检查表是否存在）
quickTestSupabase()

// 完整测试（包含用户认证、数据读写）
testSupabase()
```

### 测试脚本位置

**文件：** [`scripts/test-supabase-connection.ts`](./scripts/test-supabase-connection.ts)

---

## ✅ 功能清单

设置完成后，你可以使用：

- ✅ **用户认证**
  - 邮箱密码注册/登录
  - Google OAuth（需配置）
  - GitHub OAuth（需配置）
  - 密码重置

- ✅ **数据同步**
  - 上传本地数据到云端
  - 从云端下载数据
  - 跨设备数据同步
  - 自动冲突解决

- ✅ **安全保护**
  - Row Level Security (RLS)
  - 用户数据隔离
  - 自动权限验证

---

## 🔍 常见问题

### Q: 为什么不上传视频文件？
A: Supabase 免费版有 50MB 文件大小限制，视频通常很大。我们只同步元数据和分析结果，这样既节省空间又能实现跨设备访问。

### Q: 数据安全吗？
A: 是的！所有表都启用了 Row Level Security (RLS)，用户只能访问自己的数据。

### Q: 可以在多个设备使用吗？
A: 可以！登录同一账户后，数据会自动同步。

### Q: 免费版够用吗？
A: 对于个人使用完全够用。Supabase 免费版提供：
- 500MB 数据库存储
- 1GB 文件存储
- 10GB 带宽/月

---

## 📞 获取帮助

遇到问题？可以：

1. **查看文档**
   - [快速开始](./QUICK_START_SUPABASE.md)
   - [详细教程](./docs/supabase-setup-steps.md)
   - [完整文档](./SUPABASE_SETUP.md)

2. **检查代码**
   - 认证服务：[`services/authService.ts`](./services/authService.ts)
   - 同步服务：[`services/syncService.ts`](./services/syncService.ts)
   - 测试脚本：[`scripts/test-supabase-connection.ts`](./scripts/test-supabase-connection.ts)

3. **查看官方文档**
   - [Supabase 文档](https://supabase.com/docs)
   - [Supabase Auth](https://supabase.com/docs/guides/auth)
   - [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

---

## 🎉 开始使用

选择一个文档开始吧：

- 🚀 **新手？** → [`QUICK_START_SUPABASE.md`](./QUICK_START_SUPABASE.md)
- 📖 **需要详细步骤？** → [`docs/supabase-setup-steps.md`](./docs/supabase-setup-steps.md)
- 🔧 **开发者？** → [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md)

**祝你使用愉快！** 🎊

---

## 📝 更新日志

### 2024-11-12
- ✅ 创建初始数据库迁移
- ✅ 添加用户认证支持
- ✅ 实现数据云同步功能
- ✅ 添加测试工具和文档

---

**项目：** AI-Videos-Play  
**数据库：** Supabase PostgreSQL  
**版本：** 1.0.0
