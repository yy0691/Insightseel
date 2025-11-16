# Vercel 部署 - 邮件登录系统配置指南

## 🎯 概述

本指南帮助你在 Vercel 部署后配置 Supabase 邮件登录系统。

## 📋 前提条件

- ✅ 已在 Vercel 部署应用
- ✅ 有 Supabase 项目（免费版即可）
- ✅ `.env` 文件中已配置 Supabase 凭据

## 🔧 配置步骤

### 1️⃣ 获取 Vercel 部署 URL

部署完成后，Vercel 会分配一个 URL，例如：
```
https://your-app-name.vercel.app
```

或者如果你绑定了自定义域名：
```
https://your-domain.com
```

### 2️⃣ 在 Supabase Dashboard 配置认证

#### Step 1: 登录 Supabase Dashboard
访问：https://supabase.com/dashboard

选择你的项目（Project: `iydpsbrmxujwxvxqzdlr`）

#### Step 2: 配置 Site URL

1. 导航到 **Authentication** → **URL Configuration**

2. 设置 **Site URL**：
   ```
   https://your-app-name.vercel.app
   ```
   或你的自定义域名

3. 添加 **Redirect URLs**（允许的重定向地址）：
   ```
   https://your-app-name.vercel.app/**
   https://your-app-name.vercel.app/auth/callback
   ```

   如果有自定义域名也添加：
   ```
   https://your-domain.com/**
   https://your-domain.com/auth/callback
   ```

4. 点击 **Save**

#### Step 3: 配置 Email Provider

1. 导航到 **Authentication** → **Providers**

2. 找到 **Email** provider（默认已启用）

3. 确认以下设置：
   - ✅ **Enable Email Provider** - 已开启
   - ✅ **Confirm email** - 建议开启（需要用户验证邮箱）
   - ⚠️ **Secure email change** - 可选

4. 如果 **Confirm email** 是开启的：
   - 用户注册后会收到确认邮件
   - 点击邮件中的链接后才能登录
   - 更安全，但体验略有影响

5. 如果 **Confirm email** 是关闭的：
   - 用户注册后立即可登录
   - 不需要验证邮箱
   - 快速但安全性稍低

**推荐设置：开启 Confirm email** ✅

### 3️⃣ 在 Vercel 配置环境变量

#### Step 1: 进入 Vercel 项目设置

1. 登录 Vercel Dashboard
2. 选择你的项目
3. 进入 **Settings** → **Environment Variables**

#### Step 2: 添加 Supabase 环境变量

添加以下变量（如果还没有）：

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | `https://iydpsbrmxujwxvxqzdlr.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (你的完整 key) |

**重要：** 确保变量名以 `VITE_` 开头，这样 Vite 才能在前端访问。

#### Step 3: 重新部署

添加环境变量后，需要重新部署：
1. 进入 **Deployments** 标签
2. 点击最新部署右侧的 **⋯** 菜单
3. 选择 **Redeploy**
4. 勾选 **Use existing Build Cache**（可选）
5. 点击 **Redeploy**

### 4️⃣ 自定义邮件模板（可选但推荐）

#### Step 1: 访问邮件模板设置

导航到 **Authentication** → **Email Templates**

#### Step 2: 自定义模板

Supabase 提供以下邮件模板：

##### 1. Confirm Signup（确认注册）
```html
<h2>确认您的邮箱</h2>
<p>感谢注册 InsightReel！</p>
<p>请点击下面的按钮确认您的邮箱地址：</p>
<p><a href="{{ .ConfirmationURL }}">确认邮箱</a></p>
<p>如果您没有注册此账号，请忽略此邮件。</p>
```

使用的变量：
- `{{ .ConfirmationURL }}` - 确认链接
- `{{ .Token }}` - 确认令牌
- `{{ .Email }}` - 用户邮箱

##### 2. Invite User（邀请用户）
如果你需要邀请功能，可以自定义此模板。

##### 3. Magic Link（魔法链接）
如果启用了 Magic Link 登录：
```html
<h2>登录链接</h2>
<p>点击下面的链接登录 InsightReel：</p>
<p><a href="{{ .ConfirmationURL }}">登录</a></p>
<p>此链接将在 1 小时后失效。</p>
```

##### 4. Change Email Address（更改邮箱）
```html
<h2>确认邮箱地址更改</h2>
<p>您请求将邮箱地址更改为：{{ .Email }}</p>
<p>点击下面的链接确认更改：</p>
<p><a href="{{ .ConfirmationURL }}">确认更改</a></p>
```

##### 5. Reset Password（重置密码）
```html
<h2>重置密码</h2>
<p>您请求重置 InsightReel 账号的密码。</p>
<p>点击下面的链接重置密码：</p>
<p><a href="{{ .ConfirmationURL }}">重置密码</a></p>
<p>如果您没有请求重置密码，请忽略此邮件。</p>
<p>此链接将在 1 小时后失效。</p>
```

#### Step 3: 测试邮件

1. 保存模板后
2. 在你的应用中测试注册
3. 检查邮件是否正常接收
4. 点击链接测试是否正常跳转

### 5️⃣ 配置 SMTP（可选 - 使用自定义邮件服务器）

默认情况下，Supabase 使用自己的邮件服务发送邮件。如果你想使用自己的邮件服务器：

#### Step 1: 进入 SMTP 设置

导航到 **Project Settings** → **Auth** → **SMTP Settings**

#### Step 2: 启用自定义 SMTP

1. 切换 **Enable Custom SMTP** 为开启

2. 填写 SMTP 信息：

##### 使用 Gmail（示例）
```
Sender name: InsightReel
Sender email: your-email@gmail.com
Host: smtp.gmail.com
Port: 587
Username: your-email@gmail.com
Password: your-app-specific-password
```

**注意：** Gmail 需要使用"应用专用密码"，不能使用账号密码。

##### 使用其他邮件服务

| 服务 | SMTP Host | Port |
|------|-----------|------|
| Gmail | smtp.gmail.com | 587 |
| Outlook | smtp-mail.outlook.com | 587 |
| QQ Mail | smtp.qq.com | 587 |
| 163 Mail | smtp.163.com | 465 |
| SendGrid | smtp.sendgrid.net | 587 |
| Mailgun | smtp.mailgun.org | 587 |

3. 点击 **Save**

#### Step 3: 测试 SMTP

Supabase 提供测试功能：
1. 填写完 SMTP 信息后
2. 点击 **Send Test Email**
3. 输入测试邮箱
4. 检查是否收到邮件

## ✅ 测试登录系统

### 1. 注册新账号

1. 访问你的 Vercel URL
2. 点击 **Sign In / Create Account**
3. 选择 **Create account** 标签
4. 输入邮箱和密码（至少 6 位）
5. 点击 **Sign Up**

#### 如果启用了 Email Confirmation：
- 检查邮箱，应该收到确认邮件
- 点击邮件中的确认链接
- 跳转回应用，显示"Email confirmed"
- 现在可以登录了

#### 如果没有启用 Email Confirmation：
- 立即显示"Account created!"
- 可以直接登录

### 2. 登录测试

1. 在登录界面输入邮箱和密码
2. 点击 **Sign In**
3. 如果成功，会显示同步面板
4. 可以看到用户邮箱和同步选项

### 3. 测试同步功能

1. 导入一个视频
2. 生成字幕和分析
3. 登录后点击 **Upload to Cloud**
4. 查看是否显示"Synced successfully"
5. 打开新的浏览器窗口
6. 登录同一账号
7. 点击 **Download from Cloud**
8. 检查数据是否恢复

### 4. 测试密码重置

1. 在登录界面点击 **Forgot password?**
2. 输入邮箱
3. 点击 **Send Reset Email**
4. 检查邮箱，应该收到重置邮件
5. 点击邮件中的链接
6. 输入新密码
7. 测试新密码登录

## 🔍 常见问题排查

### 问题 1: 收不到邮件

**可能原因：**
- 邮件进了垃圾邮件文件夹
- Supabase 邮件服务延迟（通常 1-2 分钟）
- SMTP 配置错误（如果使用自定义 SMTP）

**解决方法：**
1. 检查垃圾邮件文件夹
2. 等待 2-3 分钟后重试
3. 在 Supabase Dashboard → Authentication → Logs 查看邮件发送状态
4. 如果使用自定义 SMTP，测试 SMTP 连接

### 问题 2: 点击确认链接后显示错误

**可能原因：**
- Redirect URL 配置不正确
- 链接已过期（默认 1 小时）
- Site URL 配置错误

**解决方法：**
1. 检查 Site URL 和 Redirect URLs 配置
2. 确保 URL 末尾没有多余的斜杠
3. 重新请求发送邮件
4. 检查浏览器控制台的错误信息

### 问题 3: "Supabase not configured" 错误

**可能原因：**
- 环境变量没有配置
- 环境变量名称错误
- 部署时环境变量没有生效

**解决方法：**
1. 检查 Vercel 环境变量是否正确
2. 确认变量名以 `VITE_` 开头
3. 重新部署应用
4. 清除浏览器缓存

### 问题 4: 登录后立即退出

**可能原因：**
- Session 存储问题
- Redirect URL 不匹配
- 浏览器阻止第三方 Cookie

**解决方法：**
1. 检查浏览器是否允许 Cookie
2. 尝试在隐私模式下测试
3. 检查 Site URL 配置
4. 查看浏览器控制台错误

### 问题 5: OAuth (Google/GitHub) 不工作

**原因：**
需要额外配置 OAuth 应用

**解决方法：**
查看主配置文档 `AUTH_SETUP_GUIDE.md` 中的 OAuth 配置部分

## 📊 监控和日志

### 查看认证日志

1. 进入 Supabase Dashboard
2. 导航到 **Authentication** → **Logs**
3. 可以看到：
   - 登录尝试
   - 注册请求
   - 邮件发送状态
   - 错误信息

### 查看用户列表

1. 导航到 **Authentication** → **Users**
2. 可以看到：
   - 所有注册用户
   - 邮箱确认状态
   - 最后登录时间
   - 可以手动确认用户邮箱
   - 可以重置用户密码

### 查看 Vercel 日志

1. 进入 Vercel Dashboard
2. 选择项目
3. 进入 **Deployments** → 选择部署
4. 点击 **View Function Logs**
5. 查看运行时错误

## 🎯 生产环境建议

### 安全设置

1. ✅ **启用邮箱确认** - 防止恶意注册
2. ✅ **设置密码强度** - 最少 8 位，包含字母数字
3. ✅ **启用速率限制** - 防止暴力破解
4. ✅ **使用 HTTPS** - Vercel 自动提供

### 邮件设置

1. ✅ **自定义邮件模板** - 体现品牌形象
2. ✅ **设置发件人名称** - "InsightReel" 而不是 "noreply"
3. ⚠️ **考虑自定义 SMTP** - 更可靠的邮件送达率
4. ✅ **添加品牌 Logo** - 提升专业度

### 监控设置

1. 定期检查认证日志
2. 监控失败登录尝试
3. 关注用户增长趋势
4. 检查邮件发送成功率

## 🔗 相关链接

- [Supabase Auth 文档](https://supabase.com/docs/guides/auth)
- [Vercel 环境变量](https://vercel.com/docs/concepts/projects/environment-variables)
- [Supabase Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)

## 📞 需要帮助？

如果遇到问题：
1. 检查 Supabase Dashboard 的认证日志
2. 查看 Vercel 部署日志
3. 检查浏览器控制台错误
4. 参考 `AUTH_SETUP_GUIDE.md` 详细文档

---

**配置完成后，你的用户就可以：**
- ✅ 使用邮箱注册和登录
- ✅ 重置密码
- ✅ 跨设备同步数据
- ✅ 导出本地备份

**祝你部署顺利！** 🚀
