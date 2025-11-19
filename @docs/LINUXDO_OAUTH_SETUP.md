# Linux.do OAuth 登录配置指南

## 📋 概述

本应用已集成 Linux.do OAuth 2.0 登录功能，使用 PKCE（Proof Key for Code Exchange）流程确保安全性。

## 🔧 配置步骤

### 1. 在 Linux.do 注册 OAuth 应用

1. 访问 Linux.do 开发者控制台（需要确认具体地址）
2. 创建新的 OAuth 应用
3. 配置以下信息：
   - **应用名称**：你的应用名称
   - **回调 URL（Redirect URI）**：必须与你的应用实际 URL 完全匹配
     - 示例：`https://insight.luoyuanai.cn/` 或 `https://insight.luoyuanai.cn`
     - ⚠️ **重要**：必须包括尾部斜杠（如果有的话）
     - ⚠️ **重要**：必须与代码中使用的 redirect_uri 完全一致
     - 开发环境可以使用：`http://localhost:5173/` 或 `http://localhost:5173`
   - **权限范围（Scope）**：`read`（根据实际需求调整）
   
   **⚠️ redirect_uri 匹配规则**：
   - Linux.do OAuth 对 redirect_uri 的匹配非常严格
   - 必须完全匹配，包括：
     - 协议（http/https）
     - 域名（包括子域名）
     - 路径（包括尾部斜杠）
   - 例如：如果应用中配置的是 `https://insight.luoyuanai.cn/`（有斜杠），代码中也必须使用 `https://insight.luoyuanai.cn/`
   - 如果配置的是 `https://insight.luoyuanai.cn`（无斜杠），代码中也必须使用 `https://insight.luoyuanai.cn`

### 2. 获取 Client ID 和 Client Secret

注册完成后，你会获得：
- **Client ID**：用于标识你的应用
- **Client Secret**：用于安全验证（如果 Linux.do 提供）

### 3. 在 Supabase 数据库中配置（推荐方式）

#### 方法 1：使用 oauth_config 表（推荐）

1. **创建配置表**（如果还没有）：
   - 在 Supabase Dashboard 中打开 **SQL Editor**
   - 执行 `supabase/migrations/create_oauth_config_table.sql` 中的 SQL 语句

2. **插入配置数据**：
   ```sql
   INSERT INTO oauth_config (provider, key, value) VALUES
     ('linuxdo', 'client_id', 'your_client_id_here'),
     ('linuxdo', 'client_secret', 'your_client_secret_here')
   ON CONFLICT (provider, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
   ```
   - 将 `your_client_id_here` 和 `your_client_secret_here` 替换为实际值
   - 如果没有 client_secret，可以只插入 client_id

#### 方法 2：使用 app_config 表（如果已存在）

如果你的数据库中已有 `app_config` 表，可以使用以下结构：

```sql
INSERT INTO app_config (key, value) VALUES
  ('linuxdo_client_id', 'your_client_id_here'),
  ('linuxdo_client_secret', 'your_client_secret_here')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

### 4. 配置环境变量（备选方式）

如果不想使用数据库，也可以使用环境变量：

#### 开发环境（`.env` 文件）

在项目根目录创建或编辑 `.env` 文件：

```bash
VITE_LINUXDO_CLIENT_ID=your_client_id_here
```

#### 生产环境（Vercel）

1. 登录 Vercel Dashboard
2. 选择你的项目
3. 进入 **Settings** → **Environment Variables**
4. 添加以下变量：
   - **Name**: `VITE_LINUXDO_CLIENT_ID`
   - **Value**: 你的 Client ID
   - **Environment**: `Production`, `Preview`, `Development`
5. 点击 **Save**
6. 重新部署应用

**注意**：系统会优先从数据库读取配置，如果数据库中没有找到，才会使用环境变量。

## 🎯 OAuth 端点

系统使用以下 Linux.do OAuth 端点：

- **授权端点**：`https://connect.linux.do/oauth2/authorize`
- **令牌端点**：`https://connect.linux.do/oauth2/token`
- **用户信息端点**：`https://connect.linux.do/api/user`

## 🔐 安全特性

1. **PKCE 流程**：使用 `S256` 方法生成 code challenge，防止授权码拦截攻击
2. **State 验证**：每次授权请求生成随机 state，回调时验证防止 CSRF 攻击
3. **安全存储**：使用 `sessionStorage` 临时存储敏感信息，页面关闭后自动清除

## 📝 使用流程

1. 用户点击 "Linux.do 登录" 按钮
2. 系统生成 state 和 code_verifier
3. 跳转到 Linux.do 授权页面
4. 用户在 Linux.do 完成授权
5. Linux.do 重定向回应用，携带 `code` 和 `state` 参数
6. 应用验证 state，交换 code 获取 access_token
7. 使用 access_token 获取用户信息
8. 保存用户信息（TODO：需要实现保存逻辑）

## ⚠️ 注意事项

1. **回调 URL 必须完全匹配**：在 Linux.do 配置的回调 URL 必须与应用中使用的完全一致
2. **HTTPS 要求**：生产环境必须使用 HTTPS
3. **Token 存储**：当前实现中，获取到的 token 和用户信息需要手动保存到用户 profile 或本地存储（代码中有 TODO 标记）
4. **错误处理**：如果配置不正确，会在控制台和 UI 中显示错误信息

## 🐛 故障排除

### 问题：显示 "Linux.do Client ID not configured"

**解决方案**：
- 检查环境变量 `VITE_LINUXDO_CLIENT_ID` 是否已设置
- 确认变量名拼写正确（区分大小写）
- 重新部署应用（Vercel）或重启开发服务器（本地）

### 问题：OAuth 回调失败

**检查项**：
1. 回调 URL 是否在 Linux.do 应用中正确配置
2. Client ID 是否正确
3. 浏览器控制台是否有错误信息
4. 网络连接是否正常

### 问题：State 验证失败

**原因**：可能是：
- 用户在新标签页打开了授权页面
- SessionStorage 被清除
- 跨域问题

**解决方案**：重新发起登录流程

## 📚 相关文件

- `services/linuxDoAuthService.ts` - Linux.do OAuth 服务实现
- `components/AuthModal.tsx` - 登录模态框中的 Linux.do 登录按钮
- `components/AccountPanel.tsx` - 账户面板中的 Linux.do 绑定功能
- `App.tsx` - OAuth 回调处理逻辑和用户信息保存

## 🗄️ 数据库迁移

### 添加 Linux.do 字段到 profiles 表

在 Supabase SQL Editor 中执行以下迁移：

1. **打开 SQL Editor**
   - 在 Supabase Dashboard 中点击 **SQL Editor**
   - 点击 **New Query**

2. **执行迁移文件**
   - 打开文件：`supabase/migrations/add_linuxdo_fields_to_profiles.sql`
   - 复制全部内容
   - 粘贴到 SQL Editor
   - 点击 **Run** 执行

3. **验证迁移**
   - 在 **Table Editor** 中打开 `profiles` 表
   - 应该能看到新增的字段：
     - `linuxdo_user_id`
     - `linuxdo_username`
     - `linuxdo_access_token`
     - `linuxdo_token_expires_at`
     - `linuxdo_user_data`

## 💾 数据保存机制

### 已登录用户
- Linux.do 登录成功后，用户信息会自动保存到 `profiles` 表
- 包括：用户 ID、用户名、访问令牌、过期时间、完整用户数据

### 未登录用户
- Linux.do 信息会暂时保存在 `localStorage` 中
- 当用户登录 Supabase 后，系统会自动将数据迁移到 `profiles` 表
- 迁移完成后，`localStorage` 中的数据会被清除

## 🔄 后续开发建议

1. **Token 刷新机制**：如果 Linux.do 支持 refresh token，可以实现自动刷新
2. **登出功能**：实现清除保存的 token 和用户信息
3. **数据同步**：利用 Linux.do 用户信息实现跨平台数据同步
4. **安全增强**：在生产环境中加密存储 access_token

