# InsightReel 长视频字幕基准测量指南

更新日期：2026-06-02

本文档说明如何采集、记录和分析长视频字幕生成的性能基准数据。

---

## 1. 基准指标说明

| 指标 | 说明 | 来源 |
| --- | --- | --- |
| **处理耗时（ms）** | 从点击"生成字幕"到完成所用毫秒数 | benchmarkService（startedAt → completedAt） |
| **内存峰值（MB）** | 生成期间 JS Heap 使用峰值（Chrome-only） | `performance.memory.usedJSHeapSize`（readPeakMemoryMB） |
| **字幕完整度** | 字幕最后片段 endTime / 视频总时长，0–1 | computeCompleteness(coveredSeconds, durationSeconds) |
| **失败率** | 失败次数 / 总运行次数 | summarizeBenchmarks.failureRate |
| **Provider 分布** | 各 Provider 使用次数 | summarizeBenchmarks.providers |
| **失败类型分布** | 按 errorClassifier 分类的失败类型 | summarizeBenchmarks.failureCategories |

---

## 2. 数据采集方式

基准记录由 `VideoDetail.tsx` 的字幕生成流程**自动写入** localStorage：

```
Key: insightreel:benchmarks
Format: JSON array (最多保留最近 100 条)
```

每次字幕生成（无论成功或失败）都会自动记录一条 `BenchmarkRecord`。

---

## 3. 导出与查看数据

在浏览器控制台（F12）运行：

```js
// 查看所有基准记录
JSON.parse(localStorage.getItem('insightreel:benchmarks') ?? '[]')

// 使用 benchmarkService API 查看摘要
// （先在 DevTools Sources 断点或 vite dev 控制台中导入）
import { summarizeBenchmarks, getBenchmarkRecords } from './services/benchmarkService';
const summary = summarizeBenchmarks(getBenchmarkRecords());
console.table(summary);

// 导出为 JSON 文件（在控制台运行）
const data = localStorage.getItem('insightreel:benchmarks');
const blob = new Blob([data], { type: 'application/json' });
const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
a.download = 'insightreel-benchmarks.json'; a.click();
```

---

## 4. 推荐测试样本集

| 编号 | 文件描述 | 时长 | 大小 | 语言 | Provider | 预期场景 |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | 短视频（教程/讲座） | 3 min | ~50 MB | zh/en | Gemini | 基准 baseline |
| S2 | 中长视频（会议录音） | 15 min | ~200 MB | zh | Deepgram | 分段处理 |
| S3 | 长视频（课程）| 45 min | ~600 MB | en | Deepgram | 多段+恢复 |
| S4 | 背景噪音为主视频 | 5 min | ~80 MB | auto | Gemini | noSpeech 路径 |
| S5 | 4K 视频（大文件） | 10 min | ~1.5 GB | zh | Deepgram | 大文件路径 |

---

## 5. 基准结果记录模板

在完成一轮测试后，更新本节。

### 测试环境

- 日期：
- 浏览器：
- OS / CPU：
- Provider 配置：
- 网络状况：

### 摘要结果

| 样本 | 耗时（s）| 内存峰值（MB）| 完整度 | 失败率 | 备注 |
| --- | --- | --- | --- | --- | --- |
| S1 | — | — | — | — | |
| S2 | — | — | — | — | |
| S3 | — | — | — | — | |
| S4 | — | — | — | noCaptions/noSpeech | |
| S5 | — | — | — | — | |

---

## 6. BenchmarkService API 参考

```typescript
import {
  getBenchmarkRecords,   // → BenchmarkRecord[]
  saveBenchmarkRecord,   // (record) → void （由 VideoDetail 自动调用）
  summarizeBenchmarks,   // (records) → BenchmarkSummary
  computeCompleteness,   // (coveredSeconds, totalDuration) → 0–1
  exportBenchmarks,      // () → JSON string
  readPeakMemoryMB,      // () → number | null (Chrome only)
} from './services/benchmarkService';
```
