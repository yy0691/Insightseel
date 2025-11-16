# ⚙️ Vercel 环境变量配置指南

## 快速配置

在 Vercel Dashboard 中配置以下环境变量，让所有用户都能直接使用完整功能。

## 必需的环境变量

### 1. Deepgram（字幕生成）

```
Name: VITE_DEEPGRAM_API_KEY
Value: 你的 Deepgram API Key
```

**获取方式：**
1. 访问 https://deepgram.com
2. 注册账户（$200 免费额度）
3. 创建 API Key

**用途：** 系统默认的语音转文字服务，用户无需配置即可生成字幕

---

### 2. Supabase（云同步）

```
Name: VITE_SUPABASE_URL
Value: https://your-project.supabase.co

Name: VITE_SUPABASE_ANON_KEY
Value: 你的 Supabase Anonymous Key
```

**获取方式：**
1. 访问 https://supabase.com
2. 创建项目
3. 在 Settings → API 中找到 URL 和 anon key

**用途：** 用户数据云同步、账户管理

---

## 可选的环境变量

### 3. 代理模式

```
Name: VITE_USE_PROXY
Value: true
```

**用途：** 启用后端代理，解决 CORS 问题

---

## 配置步骤

### 方法 1：Vercel Dashboard（推荐）

1. 登录 Vercel
2. 选择项目
3. 进入 **Settings** → **Environment Variables**
4. 逐个添加上述变量
5. 选择环境：`Production`, `Preview`, `Development`
6. 点击 **Save**
7. 重新部署

### 方法 2：Vercel CLI

```bash
# Deepgram
vercel env add VITE_DEEPGRAM_API_KEY

# Supabase
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY

# 代理模式（可选）
vercel env add VITE_USE_PROXY
```

---

## 配置验证

### 1. 检查部署日志

部署时应该看到：

```
✓ Environment variables loaded
  - VITE_DEEPGRAM_API_KEY
  - VITE_SUPABASE_URL
  - VITE_SUPABASE_ANON_KEY
```

### 2. 浏览器控制台检查

打开应用，按 F12，查看控制台：

```javascript
// Deepgram 可用性
[Deepgram] Availability check: {
  available: true,
  hasSystemKey: true,
  usingKey: 'system'
}

// Supabase 连接
✅ Supabase client initialized
```

### 3. 功能测试

- ✅ 导入视频
- ✅ 生成字幕（使用 Deepgram）
- ✅ 注册/登录账户
- ✅ 同步到云端

---

## 安全最佳实践

### ✅ 推荐

1. **使用环境变量**
   - 所有敏感信息都通过环境变量配置
   - 不要硬编码在代码中

2. **定期轮换密钥**
   - Deepgram Key：每 3-6 个月
   - Supabase Keys：根据需要

3. **监控使用量**
   - Deepgram Dashboard：查看 API 调用量
   - Supabase Dashboard：查看数据库使用量

4. **设置使用限制**
   - 在 Deepgram 中设置月度预算
   - 在 Supabase 中启用 RLS（Row Level Security）

### ❌ 避免

1. ❌ 不要提交 `.env` 文件到 Git
2. ❌ 不要在客户端代码中暴露密钥
3. ❌ 不要分享密钥给他人
4. ❌ 不要使用生产密钥进行测试

---

## 成本估算

### Deepgram

- **免费额度**: $200（约 46,500 分钟）
- **定价**: $0.0043/分钟
- **示例**: 100 个 10 分钟视频 = $4.30

### Supabase

- **免费计划**:
  - 500MB 数据库
  - 1GB 文件存储
  - 10GB 带宽/月
- **Pro 计划**: $25/月（更多资源）

---

## 故障排除

### 问题 1：环境变量未生效

**解决方案：**
1. 确认变量名称正确（区分大小写）
2. 重新部署项目
3. 清除浏览器缓存

### 问题 2：Deepgram 调用失败

**检查：**
1. API Key 是否有效
2. 账户余额是否充足
3. 网络连接是否正常

### 问题 3：Supabase 连接失败

**检查：**
1. URL 格式是否正确
2. Anon Key 是否正确
3. 项目是否已暂停（免费计划闲置会暂停）

---

## 本地开发配置

创建 `.env` 文件：

```env
# Deepgram
VITE_DEEPGRAM_API_KEY=your_deepgram_key

# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key

# 代理模式
VITE_USE_PROXY=true
```

**⚠️ 不要提交 `.env` 到 Git！**

---

## 相关文档

- [Deepgram 配置详解](./docs/DEEPGRAM_SETUP.md)
- [Supabase 设置指南](./SUPABASE_SETUP.md)
- [Vercel 部署指南](./VERCEL_DEPLOYMENT.md)

---

## 配置检查清单

- [ ] Deepgram API Key 已配置
- [ ] Supabase URL 已配置
- [ ] Supabase Anon Key 已配置
- [ ] 环境变量已保存
- [ ] 项目已重新部署
- [ ] 浏览器控制台无错误
- [ ] 字幕生成功能正常
- [ ] 云同步功能正常

---

**配置完成后，用户无需任何设置即可使用完整功能！** 🎉
