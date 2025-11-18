# 音频检测问题修复说明

## 问题描述

用户反馈视频的音频、音轨都检测不到，导致字幕转换失败。

### 症状
从控制台日志中可以看到：
```
[Audio Detection] ⚠️ All detection methods returned false. May be false negative.
[Audio Analysis] Initial hasAudioTrack detection: false
[Audio Analysis] {samples: 63, averageLoudness: '0.0000', peakLoudness: '0.0000', silenceRatio: '100.0%'}
```

虽然采集了63个样本，但所有的音量值都是0，这显然不正常。

## 根本原因分析

经过仔细检查 `services/videoMetadataService.ts` 中的代码，发现了三个关键问题：

### 1. 音频数据未加载就开始分析 ❌

**问题位置**：第102行
```typescript
video.preload = 'metadata';  // 只加载元数据
```

然后在第132行立即创建AudioContext并分析音频，但此时**音频数据还没有加载**！

**后果**：AudioContext尝试分析音频流，但实际上没有音频数据可用，导致所有采样都返回0。

### 2. 音频轨道检测时机过早 ❌

**问题位置**：第118行
```typescript
let hasAudioTrack = inferHasAudioTrack(video);  // 在音频数据加载前检测
```

在音频数据加载之前就调用检测API，导致所有浏览器API都返回false：
- `mozHasAudio` → false
- `webkitAudioDecodedByteCount` → 0
- `audioTracks.length` → 0

### 3. Seek后等待时间不足 ❌

**问题位置**：第238-245行
```typescript
video.currentTime = segmentStartTime;  // 跳转到采样位置
video.playbackRate = playbackRate;
await video.play();
await new Promise((resolve) => setTimeout(resolve, 200));  // 只等待200ms
```

对于大视频文件（679MB），200ms不足以：
- 完成seek操作
- 加载该位置的音频数据到缓冲区
- 准备好播放

## 修复方案

### 修复1：等待音频数据加载 ✅

**修改位置**：第131-179行

添加了完整的音频数据加载等待逻辑：

```typescript
// 🎯 关键修复：在分析音频前，确保视频数据已加载
console.log('[Audio Analysis] 🔄 Waiting for audio data to load... (readyState:', video.readyState, ')');

// 如果readyState < HAVE_FUTURE_DATA (3)，需要等待更多数据
if (video.readyState < 3) {
  // 临时改变preload以加载音频数据
  video.preload = 'auto';
  
  // 等待canplay事件（readyState >= HAVE_FUTURE_DATA）
  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      console.warn('[Audio Analysis] ⚠️ Timeout waiting for audio data. Proceeding anyway...');
      resolve();
    }, 5000); // 5秒超时
    
    const onCanPlay = () => {
      clearTimeout(timeoutId);
      console.log('[Audio Analysis] ✅ Audio data loaded (readyState:', video.readyState, ')');
      resolve();
    };
    
    // ... 事件监听逻辑
    
    video.addEventListener('canplay', onCanPlay, { once: true });
    
    // 如果已经可以播放了，立即resolve
    if (video.readyState >= 3) {
      // 立即resolve
    } else {
      // 触发加载
      video.load();
    }
  });
}
```

**效果**：确保音频数据真正加载后才开始分析，AudioContext能获取到实际的音频流数据。

### 修复2：调整音频轨道检测时机 ✅

**修改位置**：第118-125行 和 第181-183行

将 `inferHasAudioTrack` 的调用从音频数据加载**前**移到加载**后**：

```typescript
// 修改前（第118行）：
let hasAudioTrack = inferHasAudioTrack(video);  // ❌ 太早了

// 修改后（第125行）：
let hasAudioTrack = false;  // 先初始化为false

// ... 等待音频数据加载 ...

// 修改后（第181-183行）：
// 🎯 现在音频数据已加载，可以进行准确的音频轨道检测了
hasAudioTrack = inferHasAudioTrack(video);  // ✅ 时机正确
console.log('[Audio Analysis] Audio track detection after data loaded:', hasAudioTrack);
```

**效果**：浏览器API在音频数据加载后能正确返回音频轨道信息。

### 修复3：改进Seek等待逻辑 ✅

**修改位置**：第238-282行

不再使用固定的200ms超时，而是使用事件监听：

```typescript
// 修改前：
video.currentTime = segmentStartTime;
await video.play();
await new Promise((resolve) => setTimeout(resolve, 200));  // ❌ 固定超时

// 修改后：
video.currentTime = segmentStartTime;
video.playbackRate = playbackRate;

await audioContext.resume().catch(() => {});

// 🎯 关键修复：等待视频seek完成并真正开始播放
await new Promise<void>((resolve) => {
  let seeked = false;
  let playing = false;
  const timeoutId = setTimeout(() => {
    console.warn('[Audio Analysis] ⚠️ Timeout waiting for video to start playing');
    resolve();
  }, 3000);
  
  const checkReady = () => {
    if (seeked && playing) {
      clearTimeout(timeoutId);
      // 再等待一小段时间让音频缓冲区填充
      setTimeout(resolve, 300);  // ✅ 确保音频缓冲区准备好
    }
  };
  
  const onSeeked = () => {
    seeked = true;
    console.log('[Audio Analysis] ✅ Seeked to position', video.currentTime);
    checkReady();
  };
  
  const onPlaying = () => {
    playing = true;
    console.log('[Audio Analysis] ✅ Video playing at position', video.currentTime);
    checkReady();
  };
  
  video.addEventListener('seeked', onSeeked, { once: true });
  video.addEventListener('playing', onPlaying, { once: true });
  
  // 开始播放
  video.play().catch((err) => {
    console.warn('[Audio Analysis] ⚠️ Play failed:', err);
    clearTimeout(timeoutId);
    resolve();
  });
});
```

**效果**：
1. 等待 `seeked` 事件 - 确保跳转完成
2. 等待 `playing` 事件 - 确保真正开始播放
3. 再额外等待300ms - 让音频缓冲区填充
4. 有3秒超时保护 - 避免无限等待

## 预期效果

修复后，应该能看到以下日志：

```
[Audio Analysis] 🔄 Waiting for audio data to load... (readyState: 1)
[Audio Analysis] ✅ Audio data loaded (readyState: 4)
[Audio Analysis] Audio track detection after data loaded: true
[Audio Detection] ✅ Detected audio track via webkitAudioDecodedByteCount: 12345678
[Audio Analysis] ✅ Seeked to position 1124.56
[Audio Analysis] ✅ Video playing at position 1124.56
[Audio Analysis] {
  samples: 63,
  averageLoudness: '0.1234',  // ✅ 不再是0了！
  peakLoudness: '0.5678',     // ✅ 不再是0了！
  silenceRatio: '15.3%',      // ✅ 合理的值
  hasAudioTrack: true         // ✅ 正确检测到音频
}
```

## 技术要点

### readyState 的含义
- `0 HAVE_NOTHING` - 没有任何数据
- `1 HAVE_METADATA` - 有元数据（时长、尺寸等）
- `2 HAVE_CURRENT_DATA` - 有当前帧数据
- `3 HAVE_FUTURE_DATA` - 有足够数据可以播放 ✅
- `4 HAVE_ENOUGH_DATA` - 有足够数据可以流畅播放

### preload 的含义
- `none` - 不预加载任何数据
- `metadata` - 只加载元数据（时长、尺寸等）
- `auto` - 加载足够的数据以便播放 ✅

### AudioContext 的工作原理
`createMediaElementSource` 需要video元素已经有音频数据在内存中，否则无法创建有效的音频流连接。

## 测试建议

1. 测试不同大小的视频文件
2. 测试不同时长的视频（短、中、长）
3. 观察控制台日志，确认音频数据正确加载
4. 验证 `averageLoudness` 和 `peakLoudness` 不再全是0
5. 验证字幕生成成功

## 相关文件

- `services/videoMetadataService.ts` - 主要修复文件
- 涉及函数：`analyzeVideoMetadata()`, `inferHasAudioTrack()`

---

**修复完成时间**：2025-11-18
**修复者**：Luban (鲁班)

