# API Key 配置指南

## 问题：404 Proxy Error

如果您看到这个错误：
```
POST http://localhost:5000/api/proxy 404 (Not Found)
```

这说明系统没有找到 Gemini API Key，尝试使用代理模式，但代理服务器未运行。

## 解决方案

### 方法 1：在应用界面配置（最简单）✅

1. 打开应用
2. 点击右上角的 **设置图标** ⚙️
3. 在 "Gemini API Key" 输入框中输入您的 API Key
4. 点击 "Save Settings"
5. 刷新页面

### 方法 2：使用本地存储

打开浏览器控制台（F12），执行：

```javascript
// 存储 API Key
localStorage.setItem('gemini-api-key', 'YOUR_API_KEY_HERE');

// 刷新页面
location.reload();
```

### 方法 3：使用代理模式（高级用户）

如果您想使用代理模式（隐藏 API Key），需要：

1. 创建 `.env.local` 文件：
```bash
VITE_USE_PROXY=true
```

2. 创建代理服务器（需要后端支持）

**注意**：这个项目是纯前端应用，默认不包含代理服务器。

## 如何获取 Gemini API Key

1. 访问 [Google AI Studio](https://aistudio.google.com/app/apikey)
2. 登录您的 Google 账号
3. 点击 "Create API Key"
4. 复制生成的 API Key

## 验证配置

配置完成后，打开设置页面，您应该看到：

```
Debug Info:
VITE_USE_PROXY: undefined
Has API Key: Yes
Using Proxy: No
```

如果 "Has API Key" 显示 "Yes"，说明配置成功！

## 常见问题

### Q: API Key 会被泄露吗？
A: API Key 存储在浏览器的 IndexedDB 中，只在本地使用，不会上传到服务器。但请注意：
- ✅ 本地开发使用是安全的
- ⚠️ 部署到公网时建议使用代理模式
- ❌ 不要将 API Key 提交到 Git

### Q: 为什么不默认使用代理？
A: 这是一个纯前端应用，不包含后端服务器。代理模式需要额外的后端支持。

### Q: 如何切换到代理模式？
A: 需要：
1. 搭建后端代理服务器（参考 `VERCEL_DEPLOYMENT.md`）
2. 设置 `VITE_USE_PROXY=true`
3. 在后端配置 `GEMINI_API_KEY`

## 推荐配置（本地开发）

**最简单的方式**：直接在应用设置中输入 API Key

- ✅ 无需配置文件
- ✅ 无需重启服务
- ✅ 立即生效
- ✅ 可以随时更改

## 安全建议

1. **本地开发**：直接使用 API Key（在设置中配置）
2. **部署到 Vercel/Netlify**：使用代理模式 + 环境变量
3. **分享代码**：不要包含 `.env.local` 文件
4. **公开演示**：使用代理模式保护 API Key

## 下一步

配置完 API Key 后：
1. 刷新页面
2. 重新上传视频
3. 开始生成字幕

现在应该不会再看到 404 错误了！🎉
