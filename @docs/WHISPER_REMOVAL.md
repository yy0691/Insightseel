# Whisper 服务移除说明

## 改动概述

为了便于推广和降低使用成本，已完全移除 Whisper API 依赖，改为使用 Gemini API 进行所有字幕生成。

## 改动原因

1. **成本考虑**: Whisper API 需要付费（$0.006/分钟），不利于产品推广
2. **简化架构**: 统一使用 Gemini API，减少外部依赖
3. **用户体验**: 避免用户需要配置多个 API 密钥
4. **维护成本**: 减少代码复杂度，降低维护成本

## 改动文件

### 1. `components/VideoDetail.tsx`
- ✅ 移除 `isWhisperAvailable` 和 `generateSubtitlesWithWhisper` 导入
- ✅ 移除 `whisperEnabled` 状态
- ✅ 移除 Whisper 可用性检查
- ✅ 移除 Whisper API 调用逻辑
- ✅ 简化字幕生成流程，统一使用 Gemini

### 2. `services/segmentedProcessor.ts`
- ✅ 移除 `generateSubtitlesWithWhisper` 和 `whisperToSrt` 导入
- ✅ 移除 `useWhisper` 参数
- ✅ 移除 Whisper 相关的条件分支
- ✅ 更新 `estimateProcessingTime` 函数，移除 Whisper 参数

### 3. `SUBTITLE_OPTIMIZATION.md`
- ✅ 更新文档，移除 Whisper 相关说明
- ✅ 更新最佳实践建议
- ✅ 更新 API 限制说明

## 功能影响

### 保持不变
- ✅ 支持最大 2GB 视频文件
- ✅ 优化的音频提取（16kHz 采样率，动态比特率）
- ✅ 实时进度显示
- ✅ 流式字幕生成
- ✅ 自动重试机制
- ✅ 缓存功能

### 改变
- ⚠️ 所有视频统一使用 Gemini API 处理
- ⚠️ 不再有 25MB 以下视频的 Whisper 快速通道
- ⚠️ 处理时间可能略有增加（但仍在可接受范围内）

## 性能对比

### 之前（使用 Whisper）
- **小文件 (<25MB)**: Whisper API 处理，约 0.1秒/视频秒
- **大文件 (>25MB)**: Gemini API 处理，约 0.5秒/视频秒

### 现在（仅 Gemini）
- **所有文件**: Gemini API 处理，约 0.5秒/视频秒
- **优化**: 通过音频压缩和提取优化，实际处理时间可接受

## 用户体验

### 优势
1. **无需额外配置**: 只需配置 Gemini API 密钥
2. **统一体验**: 所有视频使用相同的处理流程
3. **免费使用**: Gemini 提供免费额度，适合推广

### 注意事项
1. **处理时间**: 小视频处理时间可能略有增加
2. **API 配额**: 需要注意 Gemini API 的使用配额
3. **音频质量**: 已优化音频提取，确保字幕质量

## 技术细节

### 音频提取优化
```typescript
// 动态调整比特率
if (fileSizeMB < 100) {
  audioBitsPerSecond = 32000;  // 32kbps
} else if (fileSizeMB < 500) {
  audioBitsPerSecond = 24000;  // 24kbps
} else {
  audioBitsPerSecond = 16000;  // 16kbps (最大压缩)
}
```

### 处理流程
```
1. 验证文件大小 (< 2GB)
2. 检查缓存
3. 提取音频 (优化压缩)
4. 发送到 Gemini API
5. 流式接收字幕
6. 保存结果和缓存
```

## 迁移指南

### 对于开发者
- 无需修改 API 配置（如果已配置 Gemini）
- 移除任何 Whisper API 密钥配置
- 代码会自动使用 Gemini 处理所有视频

### 对于用户
- 只需配置 Gemini API 密钥
- 使用体验基本不变
- 可能会注意到小视频处理时间略有增加

## 测试建议

### 测试场景
1. **小视频 (<100MB)**: 验证处理速度和质量
2. **中等视频 (100-500MB)**: 验证音频压缩效果
3. **大视频 (500MB-2GB)**: 验证稳定性和进度显示
4. **多语言**: 测试中英文字幕生成

### 预期结果
- ✅ 所有视频都能成功生成字幕
- ✅ 进度条正常显示
- ✅ 音频提取大小合理（< 50MB）
- ✅ 字幕质量良好

## 回滚方案

如果需要恢复 Whisper 支持，可以：
1. 恢复 `services/whisperService.ts` 的导入
2. 恢复 `VideoDetail.tsx` 中的 Whisper 逻辑
3. 恢复 `segmentedProcessor.ts` 中的 `useWhisper` 参数

相关代码已通过 Git 保存，可以随时回滚。

## 总结

这次改动简化了系统架构，降低了使用成本，更有利于产品推广。虽然小视频的处理速度可能略有下降，但通过音频优化，整体用户体验仍然良好。

### 优势
- ✅ 无需付费 API
- ✅ 配置更简单
- ✅ 维护成本更低
- ✅ 更易推广

### 权衡
- ⚠️ 小视频处理速度略慢
- ⚠️ 依赖单一 API 提供商

总体来说，这是一个有利于产品推广的正确决策。
