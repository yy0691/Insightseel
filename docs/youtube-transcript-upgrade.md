# YouTube 字幕下载功能升级

## 更新内容

已将 [baoyu-skills](https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-youtube-transcript) 仓库中更强大的 YouTube 字幕下载方法集成到项目中。

## 主要改进

### 1. 多客户端重试机制
新方法会尝试多个 YouTube InnerTube 客户端：
- **Android 客户端**（最稳定）
- **Web 客户端**
- **iOS 客户端**

当一个客户端被 YouTube 阻止时，自动切换到下一个客户端重试。

### 2. 更好的错误处理
- 识别并友好提示各种错误场景：
  - 视频不可用
  - 无字幕
  - IP 被阻止（429 错误）
  - Bot 检测
  - 年龄限制

### 3. 更强的解析能力
- 支持多种字幕格式（JSON3、XML/SRV3）
- 自动处理 GDPR 同意弹窗
- 更好的 HTML 实体解码

### 4. 智能语言选择
优先级顺序：用户指定语言 → 中文 → 英文 → 第一个可用字幕

## 技术实现

### 新增文件
- `utils/youtubeTranscript.ts` - 核心字幕获取逻辑

### 更新文件
- `api/youtube-captions.ts` - API 路由简化，使用新方法
- `tests/youtubeCaptions.test.ts` - 更新测试用例

## 使用方式

用户使用方式**完全不变**，在导入在线视频时粘贴 YouTube URL 即可，但内部会使用更强大的方法获取字幕。

## 优势对比

| 特性 | 旧方法 | 新方法 |
|------|--------|--------|
| 客户端数量 | 3 个（Android/TV/Web） | 3 个（Android/Web/iOS） |
| 重试机制 | 简单重试 | 多客户端智能重试 |
| 错误分类 | 基础 | 详细分类 |
| 格式支持 | JSON3 + XML | JSON3 + 多种 XML |
| 绕过限制 | CONSENT cookie | CONSENT + 多客户端 |

## 测试

```bash
# 运行测试
npm test -- tests/youtubeCaptions.test.ts

# 类型检查
npm run typecheck

# 构建验证
npm run build
```

所有测试通过 ✓
