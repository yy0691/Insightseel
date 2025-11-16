# Supabase 数据库设置指南

## 快速开始

### 方法 1：通过 Supabase Dashboard（推荐）

1. **登录 Supabase**
   - 访问：https://supabase.com/dashboard
   - 选择你的项目

2. **执行数据库迁移**
   - 点击左侧菜单的 **SQL Editor**
   - 点击 **New Query**
   - 复制 `supabase/migrations/20251112021718_create_auth_and_sync_tables.sql` 文件的全部内容
   - 粘贴到 SQL 编辑器
   - 点击 **Run** 按钮执行

3. **验证表是否创建成功**
   - 点击左侧菜单的 **Table Editor**
   - 你应该能看到以下表：
     - ✅ profiles
     - ✅ video_metadata
     - ✅ subtitles
     - ✅ analyses
     - ✅ notes
     - ✅ chat_history

### 方法 2：使用 Supabase CLI（高级用户）

如果你安装了 Supabase CLI，可以使用命令行：

```bash
# 安装 Supabase CLI（如果还没安装）
npm install -g supabase

# 登录
supabase login

# 链接到你的项目
supabase link --project-ref your-project-ref

# 推送迁移
supabase db push
```

## 数据库结构说明

### 1. profiles（用户资料表）
- 存储用户基本信息
- 与 auth.users 关联
- 自动在用户注册时创建

### 2. video_metadata（视频元数据表）
- 存储视频的基本信息（名称、时长、大小等）
- **注意**：视频文件本身不上传，只存储元数据
- 每个用户只能访问自己的数据

### 3. subtitles（字幕表）
- 存储视频字幕内容
- 支持多语言
- 包含结构化的字幕片段

### 4. analyses（分析结果表）
- 存储 AI 分析结果
- 类型包括：summary（摘要）、key-info（关键信息）、topics（主题）

### 5. notes（笔记表）
- 存储用户对视频的笔记

### 6. chat_history（聊天历史表）
- 存储与 AI 的对话历史
- 以 JSON 格式存储消息数组

## 安全性

所有表都启用了 **Row Level Security (RLS)**：
- ✅ 用户只能访问自己的数据
- ✅ 所有操作都需要认证
- ✅ 自动验证用户权限

## 环境变量配置

确保你的 `.env` 文件包含：

```env
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

可以在 Supabase Dashboard 的 **Settings** > **API** 中找到这些值。

## 测试连接

创建表后，你可以：

1. **测试登录功能**
   - 注册一个新账户
   - 检查 `profiles` 表是否自动创建了用户资料

2. **测试数据同步**
   - 在应用中添加视频并分析
   - 使用同步功能上传到云端
   - 在 Supabase Dashboard 的 Table Editor 中查看数据

## 常见问题

### Q: 执行 SQL 时出错怎么办？
A: 确保：
- 你有项目的管理员权限
- SQL 语法正确（直接复制迁移文件内容）
- 没有重复执行（表已存在会报错）

### Q: 如何删除所有表重新开始？
A: 在 SQL Editor 中执行：
```sql
DROP TABLE IF EXISTS chat_history CASCADE;
DROP TABLE IF EXISTS notes CASCADE;
DROP TABLE IF EXISTS analyses CASCADE;
DROP TABLE IF EXISTS subtitles CASCADE;
DROP TABLE IF EXISTS video_metadata CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at() CASCADE;
```

### Q: 数据同步失败？
A: 检查：
- 用户是否已登录
- 环境变量是否正确配置
- 浏览器控制台是否有错误信息
- Supabase Dashboard 的 Logs 中是否有错误

## 下一步

表创建成功后，你可以：
1. ✅ 使用应用的登录功能
2. ✅ 上传和分析视频
3. ✅ 使用云同步功能备份数据
4. ✅ 在不同设备间同步数据

## 需要帮助？

如果遇到问题，可以：
- 查看 Supabase Dashboard 的 Logs
- 检查浏览器控制台的错误信息
- 查看 `services/authService.ts` 和 `services/syncService.ts` 的代码
