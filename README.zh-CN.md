<div align="center">
<img width="1200" height="475" alt="Insightseel Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# Insightseel

**将任何视频转化为可操作的见解** — AI 驱动的字幕生成、翻译、摘要和视频对话，支持任何视频源。

[English](./README.md) | 简体中文

</div>

---

## 功能特性

- **字幕生成** — 使用 Deepgram 语音转文字或 Gemini/OpenAI 视觉识别，支持任何语言
- **字幕翻译** — 将字幕翻译为简体中文、繁体中文或英语，自然流畅的表达
- **AI 见解** — 一键生成摘要、关键信息提取、话题分析
- **视频对话** — 针对视频内容提问，AI 基于转录文本和见解回答
- **字幕浮层** — 可拖拽、可自定义的视频播放器字幕浮层，支持全屏显示
- **画中画模式** — 浮动视频窗口显示在其他应用之上，带字幕浮层（文档画中画，Chrome 116+）
- **录制功能** — 捕获屏幕音频、麦克风或两者，并自动转录
- **YouTube / Bilibili 导入** — 粘贴 URL 直接导入字幕
- **云端同步** — 可选的 Supabase 后端，支持多设备同步

---

## 快速开始（本地开发）

**前置要求：** Node.js 18+、pnpm（或 npm）

```bash
# 1. 安装依赖
pnpm install

# 2. 复制示例环境变量文件
cp .env.example .env.local

# 3. 至少填写以下配置：
#   LLM_API_KEY=你的_gemini_或_openai_密钥
#   VITE_DEEPGRAM_API_KEY=你的_deepgram_密钥

# 4. 启动开发服务器
pnpm dev
```

打开 http://localhost:5173，将视频文件拖放到页面上即可。

---

## 环境变量

所有变量在 `.env.local`（本地开发）或 **Vercel → 项目设置 → 环境变量**（生产环境）中设置。

### LLM — AI 文本生成（摘要、见解、翻译、对话）

| 变量 | 必需 | 说明 |
|---|---|---|
| `LLM_API_KEY` | **是** | LLM 提供商的 API 密钥（Gemini、OpenAI 或兼容服务） |
| `LLM_BASE_URL` | 否 | LLM API 的基础 URL。省略时默认为 Gemini。 |
| `LLM_MODEL` | 否 | 模型名称。默认为 `gemini-2.5-flash`。 |
| `VITE_USE_PROXY` | **是**（Vercel） | 设置为 `true` 以通过 `/api/proxy` 路由所有 LLM 调用（将密钥保存在服务器端） |

**如何获取 API 密钥：**

- **Gemini（推荐）：** https://aistudio.google.com/app/apikey — 提供免费额度，无需信用卡
- **OpenAI：** https://platform.openai.com/api-keys — 按使用付费
- **OpenRouter（多模型网关）：** https://openrouter.ai/keys — 设置 `LLM_BASE_URL=https://openrouter.ai/api/v1`

**常见 `LLM_BASE_URL` 值：**

```
# Gemini（默认 — 省略 LLM_BASE_URL 或设置为）：
https://generativelanguage.googleapis.com

# OpenAI：
https://api.openai.com/v1

# OpenRouter：
https://openrouter.ai/api/v1

# 本地 Ollama：
http://localhost:11434/v1
```

---

### 语音转文字 — 字幕生成

| 变量 | 必需 | 说明 |
|---|---|---|
| `VITE_DEEPGRAM_API_KEY` | **是** | Deepgram 音频转录 API 密钥 |

**如何获取 Deepgram 密钥：**  
1. 在 https://deepgram.com 注册 — **注册即送 $200 免费额度**，初期无需信用卡  
2. 前往 **控制台 → API Keys → Create Key**  
3. 复制密钥并设置 `VITE_DEEPGRAM_API_KEY`

Deepgram 自动处理大型音频文件。对于超长视频（>60 分钟），音频会分割为 ≤3.5 MB 的块并行转录。

---

### 云端同步 — Supabase（可选）

启用跨设备同步字幕、分析和聊天历史。

| 变量 | 必需 | 说明 |
|---|---|---|
| `VITE_SUPABASE_URL` | 否 | Supabase 项目 URL（`https://xxxxx.supabase.co`） |
| `VITE_SUPABASE_ANON_KEY` | 否 | Supabase 匿名/公共密钥 |
| `SUPABASE_SERVICE_ROLE_KEY` | 否 | 服务角色密钥 — 如果设置，会在 `/api/proxy` 上强制执行 JWT 认证（推荐用于共享部署） |

**如何设置 Supabase：**  
1. 在 https://supabase.com 创建免费项目  
2. 前往 **项目设置 → API**，复制 **项目 URL** 和 **anon/public 密钥**  
3. 若需认证保护，还需复制 **service_role 密钥**（仅保存在服务器端 — 切勿暴露给浏览器）  
4. 运行 `/supabase/migrations/` 中的数据库迁移（如有）

当设置 `SUPABASE_SERVICE_ROLE_KEY` 时，代理需要有效的 Supabase JWT。用户必须登录才能使用系统 API 密钥；否则需在设置中配置自己的密钥。

---

### 高级 / 可选

| 变量 | 说明 |
|---|---|
| `VITE_MODEL` | 设置 UI 中显示的模型名称（仅用于展示） |
| `VITE_FFMPEG_BASE_URL` | FFmpeg WASM 的 CDN URL（用于视频分割）。默认通过 `postinstall` 脚本自托管在 `/ffmpeg`。 |
| `GEMINI_API_KEY` | 旧版 — 从 `LLM_API_KEY` 回退 |
| `OPENAI_API_KEY` | 旧版 — 从 `LLM_API_KEY` 回退；也用于 OpenAI Whisper 转录 |
| `CUSTOM_API_KEY` | 旧版 — 从 `LLM_API_KEY` 回退 |

---

## 部署到 Vercel

1. 将仓库推送到 GitHub  
2. 导入到 Vercel：https://vercel.com/new  
3. 在 **项目设置 → 环境变量** 中设置环境变量：

```
LLM_API_KEY          = 你的_gemini_或_openai_密钥
LLM_BASE_URL         = https://generativelanguage.googleapis.com   # 或你的提供商
LLM_MODEL            = gemini-2.5-flash
VITE_USE_PROXY       = true
VITE_DEEPGRAM_API_KEY = 你的_deepgram_密钥

# 可选（云端同步）：
VITE_SUPABASE_URL       = https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY  = eyJ...
SUPABASE_SERVICE_ROLE_KEY = eyJ...  # 启用认证保护
```

4. 部署 — Vercel 会自动检测 Vite 并部署 `/api/` 中的无服务器函数

---

## 多提供商 LLM

应用根据 `LLM_BASE_URL` 自动路由请求：

| URL 包含 | 使用的格式 |
|---|---|
| `generativelanguage.googleapis.com` | Gemini API |
| 其他任何 URL | OpenAI 兼容 API |

这意味着你可以通过设置 `LLM_BASE_URL` 来使用 **OpenRouter、Azure OpenAI、Ollama、Together AI、Groq** 或任何 OpenAI 兼容的 API。

---

## 架构

```
浏览器（React + Vite）
  ├── IndexedDB — 视频、字幕、分析、笔记、聊天历史
  ├── /api/proxy（Vercel 无服务器）— LLM 调用（Gemini / OpenAI 格式）
  ├── /api/deepgram-proxy — Deepgram 转录
  ├── /api/youtube-captions — YouTube 字幕导入（InnerTube API）
  └── Supabase（可选）— 认证 + 云端同步
```

---

## 开发

```bash
pnpm dev          # 启动带 API 代理的开发服务器
pnpm build        # 生产构建
pnpm typecheck    # TypeScript 检查
pnpm lint         # ESLint
pnpm test         # Vitest 单元测试
```

---

## 许可证

本项目使用 MIT 许可证。详见 [LICENSE](./LICENSE) 文件。

---

## 贡献

欢迎提交 Issue 和 Pull Request！

---

## 支持

如遇问题，请在 [GitHub Issues](https://github.com/yourusername/insightseel/issues) 中提问。
