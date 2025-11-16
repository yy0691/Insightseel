# 字幕生成故障排查指南

## 常见错误：无法生成有效字幕

### 错误信息
```
The model was unable to generate valid subtitles. 
The video might not contain clear speech, or the language was incorrect.
```

## 可能的原因和解决方案

### 1. 音频提取问题 🎵

#### 症状
- 音频提取卡住不动
- 提取的音频文件过大（>20MB）
- 提取的音频文件过小（<100KB）

#### 检查方法
打开浏览器控制台（F12），查看日志：
```
Video size: 300.0MB, using audio bitrate: 16000bps
Using 4x playback speed for 50.0min video (extraction time: ~7.5min)
Audio extracted: 18432KB (18.00MB) from 300.0MB video
```

#### 解决方案
- **音频过大**：系统会自动停止在20MB，如果没有停止，可能是浏览器兼容性问题
- **音频过小**：视频可能损坏或没有音轨，尝试重新编码视频
- **提取卡住**：刷新页面重试，或尝试更短的视频片段

### 2. 语言选择错误 🌍

#### 症状
- Gemini 返回空内容或错误格式
- 字幕内容不匹配视频

#### 检查方法
确认选择的语言与视频实际语言一致：
- 视频是中文 → 选择 "Chinese" 或 "Auto-Detect"
- 视频是英文 → 选择 "English" 或 "Auto-Detect"

#### 解决方案
1. 使用 "Auto-Detect" 让 Gemini 自动检测
2. 确保选择正确的源语言
3. 如果视频是多语言，选择主要语言

### 3. Gemini API 问题 🔌

#### 症状
- API 返回错误
- 长时间无响应
- 返回的不是 SRT 格式

#### 检查方法
查看控制台日志：
```javascript
// 正常情况
Received 150 chunks, total length: 5234 characters
Final cleaned text length: 5234 characters
First 200 chars: 1
00:00:00,000 --> 00:00:03,500
Hello and welcome...

// 异常情况
Received 0 chunks, total length: 0 characters
// 或
Gemini API streaming error: quota exceeded
```

#### 解决方案

**A. API 配额问题**
- 检查 Gemini API 配额是否用完
- 等待配额重置（通常每天重置）
- 升级到付费计划

**B. 网络问题**
- 检查网络连接
- 尝试使用 VPN
- 检查防火墙设置

**C. API 密钥问题**
- 确认 API 密钥正确
- 检查 API 密钥权限
- 重新生成 API 密钥

### 4. 视频内容问题 🎬

#### 症状
- Gemini 返回内容但无法解析为 SRT
- 返回的是描述而不是字幕

#### 可能原因
- 视频主要是音乐/背景音，没有清晰的语音
- 视频质量太差，音频不清晰
- 视频是静音的

#### 检查方法
1. 手动播放视频，确认有清晰的语音
2. 检查音频音量是否正常
3. 尝试用其他工具测试音频

#### 解决方案
- 使用有清晰语音的视频
- 提高视频音频质量
- 如果是音乐视频，考虑使用专门的音乐转录工具

### 5. 浏览器兼容性问题 🌐

#### 症状
- 音频提取失败
- MediaRecorder 错误
- AudioContext 错误

#### 支持的浏览器
- ✅ Chrome 90+
- ✅ Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14.1+

#### 解决方案
- 更新浏览器到最新版本
- 尝试使用 Chrome 或 Edge
- 检查浏览器权限设置

## 调试步骤

### 第一步：检查控制台日志

打开浏览器控制台（F12），查找关键信息：

```javascript
// 1. 音频提取阶段
Video size: XXX.XMB, using audio bitrate: XXXXXbps
Using Xx playback speed for XX.Xmin video
Audio extracted: XXXXKB (XX.XXMB) from XXX.XMB video

// 2. API 调用阶段
Processing video: XXX.XMB
Generating subtitles...

// 3. 返回内容阶段
Received XX chunks, total length: XXXX characters
Final cleaned text length: XXXX characters
First 200 chars: [SRT content preview]

// 4. 解析阶段
Parsed XX subtitle segments from XXXX characters
```

### 第二步：检查返回内容

如果看到 "Failed to parse SRT"，检查返回的内容：

```javascript
// 控制台会显示
Failed to parse SRT. Content received: [前500个字符]
```

**正常的 SRT 格式**：
```
1
00:00:00,000 --> 00:00:03,500
Hello and welcome to this video

2
00:00:03,500 --> 00:00:07,000
Today we're going to talk about...
```

**异常格式**：
```
Here's a summary of the video...
[不是 SRT 格式]
```

### 第三步：测试简化场景

1. **测试短视频**（1-2分钟）
   - 如果成功 → 问题可能是视频太长
   - 如果失败 → 继续排查

2. **测试清晰语音**
   - 使用有明确对话的视频
   - 避免背景音乐过大的视频

3. **测试不同语言**
   - 尝试 "Auto-Detect"
   - 尝试明确指定语言

## 常见场景解决方案

### 场景1：50分钟视频失败

**问题**：视频太长，音频文件过大

**解决方案**：
1. 系统会自动限制在30分钟
2. 如果仍然失败，手动分段：
   - 使用视频编辑工具分割成多个10-15分钟的片段
   - 分别生成字幕
   - 手动合并字幕文件

### 场景2：API 配额用完

**问题**：Gemini API 免费配额耗尽

**解决方案**：
1. 等待配额重置（通常每天重置）
2. 升级到付费计划
3. 使用多个 API 密钥轮换

### 场景3：返回内容不是 SRT

**问题**：Gemini 返回描述性文本而不是字幕

**解决方案**：
1. 检查 prompt 是否正确（应该明确要求 SRT 格式）
2. 视频可能没有清晰的语音内容
3. 尝试更换视频或改进音频质量

### 场景4：部分字幕保存了

**问题**：流式生成过程中保存了部分结果

**解决方案**：
1. 刷新页面查看是否有部分字幕
2. 如果有，可以手动补充缺失部分
3. 或者删除后重新生成

## 性能优化建议

### 推荐的视频规格

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| 时长 | < 30分钟 | 超过会自动截断 |
| 文件大小 | < 500MB | 更快的处理速度 |
| 编码格式 | H.264/AAC | 最佳兼容性 |
| 分辨率 | 720p | 字幕生成不需要高分辨率 |
| 音频质量 | 清晰语音 | 避免背景噪音过大 |

### 最佳实践

1. **预处理视频**
   - 使用 FFmpeg 压缩：`ffmpeg -i input.mp4 -c:v libx264 -crf 28 -c:a aac -b:a 128k output.mp4`
   - 提取音频：`ffmpeg -i input.mp4 -vn -acodec copy audio.m4a`

2. **分段处理**
   - 长视频分成多个短片段
   - 每段 10-15 分钟最佳
   - 使用脚本自动合并字幕

3. **使用缓存**
   - 系统会自动缓存结果
   - 相同视频不会重复处理
   - 清除缓存：浏览器开发工具 → Application → IndexedDB

## 获取帮助

### 查看详细日志

1. 打开浏览器控制台（F12）
2. 切换到 Console 标签
3. 复制所有相关日志
4. 提供给技术支持

### 报告问题时提供

1. **视频信息**
   - 文件大小
   - 时长
   - 格式（编码）

2. **错误信息**
   - 完整的错误消息
   - 控制台日志
   - 截图

3. **环境信息**
   - 浏览器版本
   - 操作系统
   - 网络状况

4. **重现步骤**
   - 详细的操作步骤
   - 选择的设置（语言等）

## 总结

大多数问题都是由以下原因引起的：

1. ✅ **视频太长** → 使用 < 30分钟的视频或分段处理
2. ✅ **语言选择错误** → 使用 Auto-Detect 或正确的语言
3. ✅ **API 配额** → 检查配额或等待重置
4. ✅ **音频质量** → 确保有清晰的语音内容
5. ✅ **网络问题** → 检查网络连接

通过查看控制台日志，您可以快速定位问题所在！
