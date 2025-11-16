# 多 API 提供商支持指南

## 🎯 概述

现在支持多个 AI API 提供商，包括：
- ✅ **Google Gemini** (默认)
- ✅ **OpenAI** (GPT-4, GPT-4o)
- ✅ **Poe API**
- ✅ **自定义 API**

## 🚀 快速开始

### 1. 打开设置

点击应用右上角的设置图标 ⚙️

### 2. 选择 API 提供商

在 "API Provider" 下拉菜单中选择你想使用的提供商。

### 3. 配置相应的设置

根据不同的提供商，配置相应的参数。

## 📋 各提供商配置指南

### Google Gemini (推荐)

**优点**:
- ✅ 原生支持，无需代理
- ✅ 支持视频、音频、图片
- ✅ 支持流式输出
- ✅ 性价比高

**配置**:
```
API Provider: Google Gemini
Model: gemini-2.5-flash (推荐) 或 gemini-2.0-flash-exp
Base URL: (留空使用默认)
API Key: 你的 Gemini API Key
Use Proxy: ❌ 不需要
```

**获取 API Key**:
1. 访问 https://aistudio.google.com/apikey
2. 创建新的 API Key
3. 复制并粘贴到设置中

---

### OpenAI

**优点**:
- ✅ GPT-4o 强大的理解能力
- ✅ 支持视觉分析
- ✅ 支持流式输出

**配置**:
```
API Provider: OpenAI
Model: gpt-4o (推荐) 或 gpt-4-turbo
Base URL: (留空使用默认 https://api.openai.com/v1)
API Key: 你的 OpenAI API Key
Use Proxy: ❌ 不需要
```

**获取 API Key**:
1. 访问 https://platform.openai.com/api-keys
2. 创建新的 API Key
3. 复制并粘贴到设置中

**注意**: OpenAI API 需要付费，确保账户有余额。

---

### Poe API

**优点**:
- ✅ 访问多个模型（GPT-4, Claude, Gemini 等）
- ✅ 统一接口
- ✅ 可能更稳定

**配置**:
```
API Provider: Poe API
Model: GPT-4o 或 Gemini-2.5-Flash-Lite
Base URL: https://api.poe.com/v1
API Key: 你的 Poe API Key
Use Proxy: ✅ 必须启用！
```

**⚠️ 重要**: Poe API 由于 CORS 限制，**必须启用代理模式**。

**获取 API Key**:
1. 访问 https://poe.com/api_key
2. 创建新的 API Key
3. 复制并粘贴到设置中

**配置代理**:

由于 Poe API 不允许浏览器直接访问，你需要：

1. **启用 "Use Proxy" 选项**
2. **配置后端代理**（见下方"代理模式配置"）

---

### 自定义 API

**适用场景**:
- 使用兼容 Gemini 格式的第三方 API
- 使用自己部署的 API 服务
- 使用反向代理

**配置**:
```
API Provider: Custom API
Model: 根据你的 API 填写
Base URL: 你的 API 端点
API Key: 你的 API Key
Use Proxy: 根据需要
```

## 🔧 代理模式配置

### 什么时候需要代理？

- ✅ 使用 Poe API（必须）
- ✅ 想要隐藏 API Key（推荐）
- ✅ 遇到 CORS 错误
- ❌ 使用 Gemini/OpenAI 官方 API（不需要）

### 如何配置代理？

#### 方法 1: 使用 Vercel 部署（推荐）

1. 部署到 Vercel
2. 在 Vercel 环境变量中设置：
   ```
   GEMINI_API_KEY=your_api_key_here
   VITE_USE_PROXY=true
   ```
3. 在应用设置中启用 "Use Proxy"

#### 方法 2: 本地开发

1. 创建 `.env.local` 文件：
   ```bash
   VITE_USE_PROXY=true
   ```

2. 修改 `/api/proxy.ts` 支持你的 API 提供商

3. 在应用设置中启用 "Use Proxy"

## 🐛 常见问题

### Q: 为什么 Poe API 报 CORS 错误？

**A**: Poe API 不允许浏览器直接访问。解决方案：
1. 启用 "Use Proxy" 选项
2. 确保后端代理已配置

### Q: OpenAI API 返回 401 错误？

**A**: 检查：
1. API Key 是否正确
2. 账户是否有余额
3. API Key 是否有权限

### Q: Gemini API 返回 400 错误？

**A**: 检查：
1. Model 名称是否正确（如 `gemini-2.5-flash`）
2. Base URL 是否正确（留空使用默认）
3. API Key 是否有效

### Q: 如何测试配置是否正确？

**A**: 
1. 配置完成后点击 "Test Connection"
2. 查看测试结果
3. 如果失败，查看错误信息

### Q: 可以同时使用多个提供商吗？

**A**: 可以，但需要在设置中切换。每次只能使用一个提供商。

## 📊 提供商对比

| 特性 | Gemini | OpenAI | Poe | Custom |
|-----|--------|--------|-----|--------|
| 视频分析 | ✅ | ✅ | ❌ | ❓ |
| 音频分析 | ✅ | ✅ | ❌ | ❓ |
| 图片分析 | ✅ | ✅ | ❌ | ❓ |
| 流式输出 | ✅ | ✅ | ✅ | ❓ |
| 需要代理 | ❌ | ❌ | ✅ | ❓ |
| 价格 | 💰 | 💰💰 | 💰 | ❓ |
| 速度 | ⚡⚡⚡ | ⚡⚡ | ⚡⚡ | ❓ |

## 🎯 推荐配置

### 场景 1: 视频字幕生成
**推荐**: Google Gemini
- 原生支持音频
- 速度快
- 成本低

### 场景 2: 复杂分析
**推荐**: OpenAI GPT-4o
- 理解能力强
- 分析深入

### 场景 3: 多模型切换
**推荐**: Poe API
- 一个 Key 访问多个模型
- 灵活切换

### 场景 4: 预算有限
**推荐**: Google Gemini
- 免费额度充足
- 性价比高

## 🔐 安全建议

1. **不要在代码中硬编码 API Key**
2. **使用环境变量存储敏感信息**
3. **生产环境使用代理模式**
4. **定期轮换 API Key**
5. **监控 API 使用量**

## 📝 配置示例

### Gemini 配置
```json
{
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "apiKey": "AIzaSy...",
  "useProxy": false
}
```

### OpenAI 配置
```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "apiKey": "sk-...",
  "useProxy": false
}
```

### Poe 配置（需要代理）
```json
{
  "provider": "poe",
  "model": "GPT-4o",
  "baseUrl": "https://api.poe.com/v1",
  "apiKey": "aPPJU-...",
  "useProxy": true
}
```

## 🚀 下一步

1. 选择适合你的 API 提供商
2. 获取 API Key
3. 在设置中配置
4. 测试连接
5. 开始使用！

## 💡 提示

- 首次使用建议选择 **Google Gemini**（最简单）
- 如果需要更强的分析能力，可以尝试 **OpenAI**
- 如果想要多模型切换，可以使用 **Poe API**（需要配置代理）

有问题？查看完整文档：[API_KEY_SETUP.md](./API_KEY_SETUP.md)
