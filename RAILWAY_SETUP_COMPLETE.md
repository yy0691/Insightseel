# Railway 部署完整清单

## ✅ 已准备的文件

- [x] `Dockerfile` - Docker 配置
- [x] `download-service.py` - 下载服务
- [x] `utils/videoDownloader.ts` - 前端调用更新
- [x] `services/batchProcessingService.ts` - 批量处理更新
- [x] `RAILWAY_DEPLOYMENT.md` - 部署文档

## 🚀 现在开始部署

### 1. 提交代码到 Git

```bash
cd /Users/luo/Documents/projects/Insightseel

# 查看更改
git status

# 添加所有新文件
git add Dockerfile download-service.py RAILWAY_DEPLOYMENT.md types/download.ts
git add utils/videoDownloader.ts services/batchProcessingService.ts

# 提交
git commit -m "Add Railway video download service

- Add Dockerfile for Railway deployment
- Add download-service.py (Flask API for yt-dlp)
- Update videoDownloader to use Railway service
- Update batchProcessingService for playlist support
- Add deployment documentation"

# 推送到 GitHub
git push origin main
```

### 2. 部署到 Railway（3 分钟）

#### 步骤 2.1：登录 Railway

1. 访问 https://railway.app
2. 点击右上角 **"Login"**
3. 选择 **"Login with GitHub"**
4. 授权 Railway 访问你的 GitHub

#### 步骤 2.2：创建项目

1. 点击 **"New Project"**
2. 选择 **"Deploy from GitHub repo"**
3. 找到并选择 **"Insightseel"** 仓库
4. 点击 **"Deploy Now"**

Railway 会自动：
- ✅ 检测到 Dockerfile
- ✅ 安装 Python、yt-dlp、ffmpeg
- ✅ 启动 Flask 服务
- ✅ 分配一个 URL

#### 步骤 2.3：获取部署 URL

部署完成后（约 2-3 分钟）：

1. 在项目页面，点击 **"Settings"**
2. 滚动到 **"Domains"** 部分
3. 点击 **"Generate Domain"**
4. 复制生成的 URL，例如：
   ```
   https://insightseel-production-abc123.up.railway.app
   ```

#### 步骤 2.4：验证部署

在浏览器访问：
```
https://your-app.railway.app/
```

应该看到：
```json
{
  "service": "video-download-service",
  "status": "running",
  "endpoints": ["/download", "/info", "/playlist"]
}
```

### 3. 配置环境变量

#### 本地开发环境

创建或更新 `.env.local`：

```bash
# 复制示例文件
cp .env.example .env.local

# 编辑 .env.local，添加：
VITE_DOWNLOAD_SERVICE_URL=https://your-app.railway.app
```

#### Vercel 生产环境

1. 登录 https://vercel.com
2. 进入你的项目
3. 点击 **"Settings"** → **"Environment Variables"**
4. 添加新变量：
   - **Name**: `VITE_DOWNLOAD_SERVICE_URL`
   - **Value**: `https://your-app.railway.app`
   - **Environment**: 选择 `Production`, `Preview`, `Development`
5. 点击 **"Save"**
6. 重新部署：
   ```bash
   vercel --prod
   ```

### 4. 测试功能

#### 测试下载服务

```bash
# 测试健康检查
curl https://your-app.railway.app/

# 测试视频信息获取
curl -X POST https://your-app.railway.app/info \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'

# 测试视频下载
curl -X POST https://your-app.railway.app/download \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'

# 测试播放列表
curl -X POST https://your-app.railway.app/playlist \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf"}'
```

#### 在应用中测试

1. 启动本地开发服务器：
   ```bash
   pnpm dev
   ```

2. 打开 http://localhost:5173

3. 测试功能：
   - 在批量处理界面输入 YouTube URL
   - 点击"添加播放列表"测试播放列表功能
   - 单个视频处理测试下载功能

### 5. 监控和日志

#### 查看日志

在 Railway 项目页面：
1. 点击 **"Deployments"**
2. 选择最新的部署
3. 点击 **"View Logs"**

#### 监控使用量

1. 点击 **"Usage"**
2. 查看：
   - CPU 使用率
   - 内存使用
   - 网络流量
   - 月度费用

#### 设置预算提醒

1. 点击 **"Settings"**
2. 滚动到 **"Usage Limits"**
3. 设置预算提醒（建议 $3）

### 6. 优化配置（可选）

#### 启用休眠模式（节省费用）

1. 在 Railway 项目设置中
2. 找到 **"Service"** → **"Sleep Mode"**
3. 启用 **"Sleep after 15 minutes of inactivity"**

**注意**：首次访问会有 10-30 秒冷启动时间

#### 添加自定义域名（可选）

1. 在 Railway 项目设置中
2. 点击 **"Custom Domain"**
3. 输入你的域名（如 `api.yourdomain.com`）
4. 按照提示配置 DNS

---

## 🎯 完成检查清单

- [ ] 代码已提交到 GitHub
- [ ] Railway 项目已创建
- [ ] 部署成功（访问 URL 看到服务信息）
- [ ] `.env.local` 已更新
- [ ] Vercel 环境变量已配置
- [ ] 测试视频下载功能
- [ ] 测试播放列表功能
- [ ] 设置预算提醒

---

## 💡 使用示例

### 在应用中使用

```typescript
// 下载 YouTube 视频
import { downloadVideo } from './utils/videoDownloader';

const result = await downloadVideo('https://youtube.com/watch?v=xxx');
if (result.success && result.file) {
  console.log('下载成功:', result.title);
  // result.file 是 File 对象，可以直接处理
  processVideo(result.file);
}

// 获取播放列表
import { extractPlaylistVideos } from './services/batchProcessingService';

const videos = await extractPlaylistVideos('https://youtube.com/playlist?list=xxx');
console.log(`播放列表包含 ${videos.length} 个视频`);
```

---

## 🆘 故障排除

### 问题 1：Railway 部署失败

**检查日志**：
1. Railway 项目页面 → Deployments → View Logs
2. 查找错误信息

**常见原因**：
- Dockerfile 语法错误
- Python 包安装失败

**解决**：
```bash
# 本地测试 Docker 构建
docker build -t test-download-service .
docker run -p 8080:8080 test-download-service

# 访问 http://localhost:8080 测试
```

### 问题 2：视频下载失败（403/404）

**原因**：YouTube 可能限制某些地区或 IP

**解决**：
1. 尝试其他视频
2. 检查 Railway 日志查看详细错误
3. 某些视频需要登录才能下载（暂不支持）

### 问题 3：CORS 错误

**原因**：前端域名未在 CORS 白名单中

**解决**：更新 `download-service.py`：

```python
CORS(app, resources={
    r"/*": {
        "origins": [
            "http://localhost:5173",
            "https://*.vercel.app",
            "https://yourdomain.com"  # 添加你的域名
        ]
    }
})
```

提交并推送，Railway 会自动重新部署。

### 问题 4：超过免费额度

**查看使用量**：Railway Dashboard → Usage

**优化方案**：
1. 启用休眠模式
2. 减少并发请求
3. 使用缓存（下次实现）

---

## 📊 费用估算

| 使用场景 | 月费用 | 说明 |
|---------|-------|------|
| 轻量（<10 视频/天） | $0 | 免费额度内 |
| 中等（50 视频/天） | $0-2 | 接近免费额度 |
| 重度（200 视频/天） | ~$5 | 超出免费额度 |

**节省技巧**：
- ✅ 启用休眠模式
- ✅ 限制并发下载数
- ✅ 使用 CDN 缓存视频信息

---

## 🎉 部署完成

现在你的 Insightseel 应用已经支持：

1. ✅ 在线视频下载（YouTube、Bilibili 等）
2. ✅ 播放列表批量处理
3. ✅ 完整的视频处理工作流
4. ✅ 浏览器端字幕烧录
5. ✅ 专业 AI 翻译

**开始使用吧！** 🚀
