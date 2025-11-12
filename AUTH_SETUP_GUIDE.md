# Authentication & Cloud Sync Setup Guide

This guide explains how to configure authentication and cloud sync for InsightReel.

## ✅ What's Implemented

### 1. **Authentication Methods**
- ✅ Email/Password Sign Up & Sign In
- ✅ Google OAuth
- ✅ GitHub OAuth
- ✅ Password Reset

### 2. **Cloud Sync Features**
- ✅ Sync video metadata (name, duration, hash, etc.)- ✅ 同步视频元数据（名称、时长、哈希值等）
- ✅ Sync subtitles (SRT content and segments)- ✅ 同步字幕（SRT 内容和片段）
- ✅ Sync analyses (summary, key-info, topics)- ✅ 同步分析（摘要、关键信息、主题）
- ✅ Sync notes
- ✅ Sync chat history
- ⚠️ **Video files are NOT synced** (stay in local browser storage)

### 3. **Export Features**
- ✅ Export data only (JSON)
- ✅ Export with videos (ZIP file)
- ✅ Works without login

## 📋 Prerequisites

You already have Supabase configured with the credentials in `.env`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 🔧 Required Supabase Configuration

### Step 1: Enable Authentication Providers

Go to your Supabase Dashboard → Authentication → Providers

#### Email Provider
Already enabled by default. Users can sign up with email/password.

#### Google OAuth
1. Click on "Google" provider
2. Enable it
3. Add your Redirect URL: `https://your-domain.com/auth/callback`
4. Get Google OAuth credentials from [Google Cloud Console](https://console.cloud.google.com/)4. 从 [Google 云控制台](https://console.cloud.google.com/) 获取 Google OAuth 凭证
   - Create OAuth 2.0 Client ID创建 OAuth 2.0 客户端 ID
   - Add authorized redirect URI: `https://iydpsbrmxujwxvxqzdlr.supabase.co/auth/v1/callback`- 添加授权重定向 URI：`https://iydpsbrmxujwxvxqzdlr.supabase.co/auth/v1/callback`
5. Paste Client ID and Client Secret in Supabase5. 在 Supabase 中粘贴客户端 ID 和客户端密钥

#### GitHub OAuth
1. Click on "GitHub" provider
2. Enable it
3. Get GitHub OAuth App from [GitHub Settings](https://github.com/settings/developers)
   - Register a new OAuth application
   - Set Authorization callback URL: `https://iydpsbrmxujwxvxqzdlr.supabase.co/auth/v1/callback`
4. Paste Client ID and Client Secret in Supabase

### Step 2: Configure Site URL

Go to Authentication → URL Configuration:
- **Site URL**: `https://your-domain.com` (or `http://localhost:5173` for development)
- **Redirect URLs**: Add your application URLs

### Step 3: Email Templates (Optional)

Customize email templates in Authentication → Email Templates:
- Confirmation email
- Password reset email
- Magic link email

## 🗄️ Database Schema

The database schema has been automatically created with the following tables:

### Core Tables
1. **profiles** - User profile information
2. **video_metadata** - Video metadata (no video files)
3. **subtitles** - Subtitle content and segments
4. **analyses** - Analysis results (summary, key-info, topics)
5. **notes** - User notes per video
6. **chat_history** - Chat conversation history

### Security
- ✅ Row Level Security (RLS) enabled on all tables
- ✅ Users can only access their own data
- ✅ Authenticated users only

## 💾 Storage Limitations (Free Tier)

### What You Get
- **Database**: 500MB
- **File Storage**: 1GB (not used for videos)
- **Bandwidth**: 10GB/month

### File Size Limits
- **Free Tier**: Max 50MB per file
- **Paid Plan**: Up to 500GB per file

### Why Video Files Are NOT Synced
❌ Most video files exceed 50MB limit
❌ Would quickly exhaust 1GB storage
❌ Would consume bandwidth quota

✅ Video files stay in browser's IndexedDB
✅ Only metadata and analysis results are synced
✅ Users can export videos locally (ZIP format)

## 🎯 How It Works

### User Flow

1. **Without Login**
   - All data stored locally in browser
   - Can export data anytime
   - No sync between devices

2. **With Login**
   - Upload local data to cloud
   - Download data on other devices
   - Video files still local only
   - Metadata and analyses sync

### Sync Behavior

**Upload to Cloud:**
```
Local IndexedDB → Supabase Database
- Video metadata ✅
- Subtitles ✅
- Analyses ✅
- Notes ✅
- Chat history ✅
- Video files ❌ (too large)
```

**Download from Cloud:**
```
Supabase Database → Local IndexedDB
- Loads metadata for videos
- Restores subtitles, analyses, notes, chats
- Video files must be re-imported locally
```

## 🚀 Usage

### For Users

1. **First Time Setup**
   - Click "Sign In / Create Account" on welcome screen
   - Choose email, Google, or GitHub
   - Complete sign up

2. **Uploading Data**
   - After analyzing videos, click "Upload to Cloud"
   - Syncs all metadata and analyses

3. **Syncing to Another Device**
   - Sign in on new device
   - Click "Download from Cloud"
   - Re-import video files if needed

4. **Exporting Data**
   - Works without login
   - "Export Data Only" - JSON file (lightweight)
   - "Export with Videos" - ZIP file (complete backup)

### For Developers

#### Testing Authentication

```bash
# Local development
npm run dev

# The app will use credentials from .env
# Test with:
# - Email signup/signin
# - Google OAuth (requires configuration)
# - GitHub OAuth (requires configuration)
```

#### Sync Service API

```typescript
import { syncService } from './services/syncService';

// Upload to cloud
const result = await syncService.syncToCloud(userId);
console.log(result.synced); // { videos: 5, subtitles: 3, ... }

// Download from cloud
const result = await syncService.syncFromCloud(userId);
console.log(result.synced);
```

#### Export Service API

```typescript
import { exportService } from './services/exportService';

// Export data only
await exportService.exportAllDataAndDownload(false);

// Export with videos
await exportService.exportAllDataAndDownload(true);
```

## ⚠️ Important Notes

1. **Video files are never uploaded** to avoid storage/bandwidth limits
2. **Users must re-import videos** when syncing to a new device
3. **Analyses and subtitles are preserved** across devices
4. **Free tier limits** apply - monitor usage in Supabase Dashboard
5. **OAuth providers** require external configuration

## 🔐 Security Best Practices

1. **Never commit** `.env` file to git
2. **Rotate keys** if exposed
3. **Use HTTPS** in production
4. **Enable email verification** for signups
5. **Monitor** auth logs in Supabase Dashboard

## 📊 Monitoring

Track usage in Supabase Dashboard:
- Database size: Database → Usage
- Bandwidth: Settings → Usage
- Auth users: Authentication → Users
- API requests: Settings → API

## 🆘 Troubleshooting

### "Supabase not configured" error
- Check `.env` file exists
- Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Restart dev server after changing `.env`

### OAuth not working
- Verify OAuth app is configured in provider (Google/GitHub)
- Check redirect URLs match exactly
- Ensure provider is enabled in Supabase Dashboard

### Sync failing
- Check network connection
- Verify user is authenticated
- Check Supabase Dashboard for RLS policy errors
- Monitor browser console for errors

### "Row Level Security" errors
- User must be logged in
- Check that policies allow operation
- Verify user ID matches data ownership

## 📚 Additional Resources

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Supabase Storage Documentation](https://supabase.com/docs/guides/storage)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)

---

**Built with ❤️ using Supabase, React, and TypeScript**
