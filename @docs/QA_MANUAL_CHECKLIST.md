# InsightReel 质量门禁与手动验证清单

更新日期：2026-06-02
适用阶段：Plan 阶段一（质量基线与发布门禁）

本清单分为两部分：

1. 自动化质量门禁（每次提交 / PR 前执行，CI 中自动运行）。
2. 关键错误场景的手动验证清单（自动化暂未覆盖、需人工在浏览器中确认的链路）。

---

## 1. 自动化质量门禁

| 命令 | 作用 | 通过标准 |
| --- | --- | --- |
| `pnpm run typecheck` | `tsc --noEmit` 全仓类型检查 | 0 error |
| `pnpm run lint` | ESLint 全仓检查 | 0 error（warning 允许） |
| `pnpm run test` | Vitest 运行核心单元测试 | 全部用例通过 |
| `pnpm run build` | Vite 生产构建 | 构建成功 |

CI 工作流：`.github/workflows/ci.yml`，在 push 到 `main` 与针对 `main` 的 PR 上依次执行
typecheck → lint → test → build。

### 当前自动化测试覆盖（`tests/`）

- `helpers.test.ts`：SRT/VTT 解析、`segmentsToSrt` 序列化与往返、时间戳格式化、`retryWithBackoff` 重试策略、确定性 UUID。
- `youtubeCaptions.test.ts`：YouTube 视频 ID 提取、字幕轨道命名、HTML 实体解码、json3/xml 字幕解析、平衡 JSON 提取。
- `videoSplitter.test.ts`：长视频分段时长计算 `calculateSegmentDuration`。
- `segmentedProcessor.test.ts`：分段处理耗时估算 `estimateProcessingTime`。
- `syncService.test.ts` / `syncServiceUnconfigured.test.ts`：云同步在已配置 / 未配置 Supabase 下的行为、最近同步时间持久化。

---

## 2. 关键错误场景手动验证清单

> 说明：以下场景依赖浏览器环境、外部 API 与真实视频文件，暂未纳入自动化测试，发布前需人工逐项确认。
> 勾选规范：通过填 `[x]`，失败保留 `[ ]` 并在备注中记录现象与复现步骤。

### 2.1 API Key 缺失
- [ ] 在未配置任何 Provider API Key 且未启用代理时触发字幕生成 / AI 分析。
- 预期：给出明确的"需要配置 API Key"提示，不出现未捕获异常或静默失败。

### 2.2 Provider 调用失败
- [ ] 配置错误的 API Key 或不可用的 baseUrl，触发分析。
- [ ] 触发可重试错误（超时 / 5xx / 网络错误）。
- 预期：错误信息可读；可重试错误按 `retryWithBackoff` 退避重试；非重试错误立即失败并提示。

### 2.3 FFmpeg 加载失败 / 不可用
- [ ] 不配置 `VITE_FFMPEG_BASE_URL`（默认无 CDN）导入并处理一个 > 3 分钟的视频。
- 预期：自动降级为不分段 / Deepgram 路径，给出可读日志，不阻塞字幕生成。

### 2.4 长视频分段处理
- [ ] 导入 ≥ 10 分钟视频并生成字幕。
- 预期：按 `calculateSegmentDuration` 分段并行处理；进度可见；合并后时间戳连续、无回退；部分片段失败时有提示。

### 2.5 网络中断 / 离线同步
- [ ] 登录后将网络切到离线，编辑数据触发同步。
- [ ] 恢复网络。
- 预期：离线时进入排队 / error 状态并提示"网络已断开"；恢复后自动续传，最终状态回到 idle。

### 2.6 云同步与冲突
- [ ] 未配置 Supabase 时触发同步。
- [ ] 已配置 Supabase 下从云端拉取仅有元数据、本地缺失原始视频文件的记录。
- [ ] 多端先后修改同一视频的字幕 / 笔记 / 分析后同步。
- 预期：未配置时返回"Supabase not configured"且不崩溃；仅同步元数据 / 字幕 / 分析 / 笔记 / 聊天记录，不上传原始视频文件；冲突有可预期的合并 / 覆盖行为（冲突 UI 为后续阶段项）。

### 2.7 YouTube 字幕导入
- [ ] 导入含字幕的 YouTube 视频（标准链接、`youtu.be`、`/shorts/`）。
- [ ] 导入无字幕 / 受限访问的视频。
- 预期：成功时正确选轨并解析片段；失败时给出明确原因（无字幕 / 无法获取页面 / 解析失败）与重试或手动上传字幕的兜底入口。

### 2.8 字幕文件导入与解析
- [ ] 导入 `.srt` 与 `.vtt` 字幕。
- [ ] 导入不支持的字幕格式。
- 预期：SRT/VTT 正确解析并对齐；不支持格式给出明确错误提示。

---

## 3. 已知后续项（Follow-ups）

- `plugin/popup/__tests__/App.test.tsx`：为未完成的测试存根，引用了未导出的 `VideoSelector` / `SettingsPanel` / `AnalysisPanel`，并依赖未安装的 `@testing-library/react`。当前已从 typecheck（`tsconfig.json` exclude）与测试运行（`vitest.config.ts` 排除 `plugin/**`）中排除，待 Phase 4（插件落地）补齐组件导出与测试依赖后修复。
- ESLint 当前保留约 80 条 warning（主要为未使用变量、`react-hooks/exhaustive-deps` 等），后续阶段逐步收敛。
- `api/youtube-captions.ts` 中 XML 字幕解析的 `dur` 属性在部分轨道下未被捕获（回退为默认 3 秒），列入 Phase 2 字幕增强处理。
