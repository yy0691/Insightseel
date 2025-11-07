# Vercel 部署指南 | Vercel Deployment Guide

## 中文说明

### 安全的环境变量配置

本项目已实现安全的API密钥保护机制。当您在Vercel上部署时，可以提供系统默认的API配置，让用户无需配置即可试用，同时完全保护您的API密钥不被泄露。

### 工作原理

1. **后端代理**: 创建了 `/api/proxy` 端点作为安全的API代理
2. **密钥隔离**: API密钥只存储在后端环境变量中，前端无法访问
3. **智能路由**: 
   - 用户未配置自己的密钥时 → 自动使用代理模式（调用您的后端API）
   - 用户配置了自己的密钥时 → 直接调用Gemini API（不占用您的配额）

### Vercel环境变量配置步骤

在Vercel项目设置中，配置以下环境变量：

#### 后端环境变量（保护API密钥）

```bash
# 必需：Gemini API密钥（后端安全存储，前端无法访问）
GEMINI_API_KEY=your_actual_api_key_here

# 可选：自定义模型（默认：gemini-2.5-flash）
GEMINI_MODEL=gemini-2.5-flash

# 可选：自定义API基础URL（默认：https://generativelanguage.googleapis.com）
GEMINI_BASE_URL=https://generativelanguage.googleapis.com
```

#### 前端环境变量（安全信号）

```bash
# 必需：启用代理模式（告诉前端代理可用，但不暴露密钥）
VITE_USE_PROXY=true

# 可选：前端显示的默认模型（仅用于UI显示）
VITE_MODEL=gemini-2.5-flash
```

### 重要安全提示 ⚠️

❌ **绝对不要使用** `VITE_API_KEY` 或 `VITE_GEMINI_API_KEY` - 这会将密钥暴露在前端代码中！  
✅ **使用** `GEMINI_API_KEY`（后端） + `VITE_USE_PROXY=true`（前端）

**工作原理：**
- `GEMINI_API_KEY`：仅后端可见，用于实际API调用
- `VITE_USE_PROXY=true`：前端只知道代理可用，永远不会看到真实密钥

前端的 `VITE_` 环境变量会被编译到JavaScript代码中。我们只用它传递一个布尔标志，而不是敏感数据。

### 配置示例

**Vercel Dashboard → Settings → Environment Variables:**

| Key | Value | Environment |
|-----|-------|-------------|
| `GEMINI_API_KEY` | `AIza...` | Production, Preview, Development |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Production, Preview, Development |
| `VITE_USE_PROXY` | `true` | Production, Preview, Development |
| `VITE_MODEL` | `gemini-2.5-flash` | Production, Preview, Development |

### 用户体验

- **无密钥用户**: 自动使用您提供的系统配置，通过代理调用API（计入您的配额）
- **有密钥用户**: 可在设置中配置自己的API密钥，直接调用Gemini API（不占用您的配额）

### ⚙️ 部署步骤

1. **在 Vercel 中配置环境变量**
   - 登录 Vercel Dashboard
   - 进入项目 → Settings → Environment Variables
   - 添加上述所有环境变量（GEMINI_* 和 VITE_*）
   - 确保所有环境都勾选（Production、Preview、Development）

2. **重新部署（重要！）**
   - 进入 Deployments 标签
   - 点击最新部署的 "..." → Redeploy
   - **关闭** "Use existing Build Cache"（重要！）
   - 点击 Redeploy 确认

3. **验证部署**
   - 等待部署完成
   - 访问部署的网站
   - 在欢迎页面底部查看"环境配置状态"调试面板
   - 确认 `VITE_USE_PROXY` 显示为 `true`（绿色）

### 🔧 故障排除

#### 调试面板显示 "undefined"

如果部署后调试面板显示环境变量为 `undefined`：

**检查清单：**

1. ✅ **确认环境变量值格式正确**
   - 必须是 `true`（小写，无引号，无空格）
   - ❌ 错误: `"true"`, `True`, `TRUE`, `true `

2. ✅ **确认已重新部署**
   - 仅修改环境变量不够，必须触发新的构建
   - 关闭 "Use existing Build Cache" 选项

3. ✅ **确认环境选择正确**
   - Production、Preview、Development 都要勾选
   - 确保部署类型与环境变量匹配

4. ✅ **查看构建日志**
   - Deployments → 最新部署 → View Build Logs
   - 搜索 "VITE_USE_PROXY" 确认变量被读取

**技术说明：**

本项目在 `vite.config.ts` 中使用了 `define` 选项来显式声明环境变量，确保 Vercel 构建时能正确嵌入这些变量到前端代码中。如果您修改了环境变量配置，务必完全重新构建（不使用缓存）。

### 可选：添加使用限制

您可以在 `api/proxy.ts` 中添加额外的安全措施：

- 速率限制（rate limiting）
- 使用量追踪
- IP白名单/黑名单
- 请求验证

---

## English Instructions

### Secure Environment Variable Configuration

This project implements a secure API key protection mechanism. When deploying on Vercel, you can provide system default API configuration for users to try without setup, while completely protecting your API key from exposure.

### How It Works

1. **Backend Proxy**: Created `/api/proxy` endpoint as a secure API proxy
2. **Key Isolation**: API keys are only stored in backend environment variables, inaccessible from frontend
3. **Smart Routing**: 
   - Users without their own keys → Automatically use proxy mode (calls your backend API)
   - Users with their own keys → Directly call Gemini API (doesn't use your quota)

### Vercel Environment Variable Setup

In your Vercel project settings, configure the following environment variables:

#### Backend Environment Variables (Protect API Key)

```bash
# Required: Gemini API key (backend secure storage, frontend cannot access)
GEMINI_API_KEY=your_actual_api_key_here

# Optional: Custom model (default: gemini-2.5-flash)
GEMINI_MODEL=gemini-2.5-flash

# Optional: Custom API base URL (default: https://generativelanguage.googleapis.com)
GEMINI_BASE_URL=https://generativelanguage.googleapis.com
```

#### Frontend Environment Variables (Safe Signal)

```bash
# Required: Enable proxy mode (tells frontend proxy is available without exposing key)
VITE_USE_PROXY=true

# Optional: Default model for UI display
VITE_MODEL=gemini-2.5-flash
```

### Important Security Notice ⚠️

❌ **NEVER use** `VITE_API_KEY` or `VITE_GEMINI_API_KEY` - This exposes your key in frontend code!  
✅ **USE** `GEMINI_API_KEY` (backend) + `VITE_USE_PROXY=true` (frontend)

**How it works:**
- `GEMINI_API_KEY`: Backend only, used for actual API calls
- `VITE_USE_PROXY=true`: Frontend only knows proxy is available, never sees the real key

Frontend `VITE_` environment variables are compiled into JavaScript code. We only use it to pass a boolean flag, not sensitive data.

### Configuration Example

**Vercel Dashboard → Settings → Environment Variables:**

| Key | Value | Environment |
|-----|-------|-------------|
| `GEMINI_API_KEY` | `AIza...` | Production, Preview, Development |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Production, Preview, Development |
| `VITE_USE_PROXY` | `true` | Production, Preview, Development |
| `VITE_MODEL` | `gemini-2.5-flash` | Production, Preview, Development |

### User Experience

- **Users without keys**: Automatically use your system configuration via proxy (counts toward your quota)
- **Users with keys**: Can configure their own API key in settings, directly call Gemini API (doesn't use your quota)

### ⚙️ Deployment Steps

1. **Configure Environment Variables in Vercel**
   - Log in to Vercel Dashboard
   - Go to your project → Settings → Environment Variables
   - Add all the variables above (both GEMINI_* and VITE_*)
   - Ensure all environments are checked (Production, Preview, Development)

2. **Redeploy (Important!)**
   - Go to Deployments tab
   - Click "..." on the latest deployment → Redeploy
   - **Uncheck** "Use existing Build Cache" (Important!)
   - Confirm redeploy

3. **Verify Deployment**
   - Wait for deployment to complete
   - Visit your deployed site
   - Check the "Environment Status" debug panel at the bottom of the welcome page
   - Confirm `VITE_USE_PROXY` shows `true` (green)

### 🔧 Troubleshooting

#### Debug Panel Shows "undefined"

If the debug panel shows environment variables as `undefined` after deployment:

**Checklist:**

1. ✅ **Confirm environment variable value format**
   - Must be `true` (lowercase, no quotes, no spaces)
   - ❌ Wrong: `"true"`, `True`, `TRUE`, `true `

2. ✅ **Confirm redeployment**
   - Just changing environment variables isn't enough, you must trigger a new build
   - Uncheck "Use existing Build Cache" option

3. ✅ **Confirm environment selection**
   - Production, Preview, Development should all be checked
   - Ensure deployment type matches environment variables

4. ✅ **Check build logs**
   - Deployments → Latest deployment → View Build Logs
   - Search for "VITE_USE_PROXY" to confirm the variable is being read

**Technical Note:**

This project uses the `define` option in `vite.config.ts` to explicitly declare environment variables, ensuring Vercel can properly embed these variables into the frontend code during build time. If you modify environment variable configuration, you must do a complete rebuild (without cache).

### Optional: Add Usage Limits

You can add additional security measures in `api/proxy.ts`:

- Rate limiting
- Usage tracking
- IP whitelist/blacklist
- Request validation
