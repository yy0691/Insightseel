# 部署到 Railway 指南

## 🚀 快速部署（5 分钟）

### 步骤 1：提交代码到 Git

```bash
# 添加新文件
git add Dockerfile download-service.py

# 提交
git commit -m "Add Railway download service"

# 推送到 GitHub
git push origin main
```

### 步骤 2：部署到 Railway

1. **访问 Railway**
   - 打开 https://railway.app
   - 点击 "Login" 使用 GitHub 账号登录

2. **创建新项目**
   - 点击 "New Project"
   - 选择 "Deploy from GitHub repo"
   - 选择 `Insightseel` 仓库
   - 点击 "Deploy Now"

3. **等待部署**
   - Railway 会自动检测 Dockerfile
   - 构建和部署大约需要 2-3 分钟
   - 查看日志确认部署成功

4. **获取部署 URL**
   - 进入项目设置（Settings）
   - 点击 "Generate Domain"
   - 复制生成的 URL（如 `https://insightseel-production.railway.app`）

### 步骤 3：配置前端环境变量

```bash
# 本地开发环境
# .env.local
VITE_DOWNLOAD_SERVICE_URL=https://your-app.railway.app

# Vercel 生产环境
# 登录 vercel.com
# 项目设置 → Environment Variables → 添加：
# VITE_DOWNLOAD_SERVICE_URL = https://your-app.railway.app
```

### 步骤 4：测试

```bash
# 测试下载服务
curl -X POST https://your-app.railway.app/download \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'

# 应该返回视频信息
```

---

## 📊 Railway 免费额度

- **免费额度**：$5/月（约 500 小时运行时间）
- **适用场景**：轻量使用（每天 < 50 个视频）
- **超额计费**：$0.000463/分钟

---

## 🔧 故障排除

### 问题 1：部署失败

**检查**：
```bash
# 在本地测试 Docker 构建
docker build -t test .
docker run -p 8080:8080 test
```

### 问题 2：CORS 错误

**原因**：下载服务已配置 CORS，如果还有问题：

```python
# download-service.py - 更新 CORS 配置
CORS(app, resources={
    r"/*": {
        "origins": [
            "http://localhost:5173",
            "https://*.vercel.app",
            "https://yourdomain.com"
        ]
    }
})
```

重新提交并部署。

### 问题 3：视频下载失败

**原因**：某些视频可能受地区限制

**解决**：
- 使用代理（Railway 支持配置环境变量）
- 或提示用户使用 VPN

---

## 💡 成本优化

### 方案 1：按需启动（推荐）

Railway 默认持续运行，可以配置为按需启动：

```
Settings → Service → Sleep after 5 minutes of inactivity
```

### 方案 2：设置预算提醒

```
Settings → Usage → Set Budget Alert at $3
```

---

## 🎯 验证部署成功

访问部署 URL 根路径，应该看到：

```json
{
  "service": "video-download-service",
  "status": "running",
  "endpoints": ["/download", "/info", "/playlist"]
}
```

---

## 下一步

部署成功后：

1. ✅ 更新 `.env.local` 添加 `VITE_DOWNLOAD_SERVICE_URL`
2. ✅ 更新 Vercel 环境变量
3. ✅ 测试视频下载功能
4. ✅ 测试播放列表功能

完成！🎉
