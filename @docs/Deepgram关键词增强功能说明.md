# Deepgram 关键词增强功能说明

## 功能介绍

Deepgram 提供了 **Keywords（关键词增强）** 功能，可以显著提高对专业术语的识别准确度。

### 工作原理

通过在 API 请求中添加 `keywords` 参数，告诉 Deepgram 应该更加关注哪些词汇：

```
keywords=Diffusion Model:3&keywords=Transformer:3&keywords=扩散模型:3
```

每个关键词后面的数字是 **boost 值**（增强程度）：
- **范围**: -10 到 10
- **推荐值**:
  - 1-3：轻微增强（常用术语）
  - 4-6：中度增强（重要术语）
  - 7-10：强烈增强（极其重要的术语）

## 已实现的功能

### 1. 系统内置词汇表

在 `config/deepgramKeywords.ts` 中定义了多个专业领域的词汇表：

#### AI/ML 词汇表 (`AI_ML_KEYWORDS`)
包含 30+ 个 AI 和机器学习相关术语：
- 深度学习：Diffusion Model, Transformer, GPT, BERT, CNN, RNN, LSTM
- 扩散模型：DDPM, DDIM, Stable Diffusion, Latent Diffusion, Denoising
- 大模型：LLM, ChatGPT, Claude, Gemini, Llama
- 训练和优化：Fine-tuning, Prompt Engineering, RAG, LoRA, Adapter
- 中文术语：扩散模型、大语言模型、预训练、微调、提示词、注意力机制等

#### 编程词汇表 (`PROGRAMMING_KEYWORDS`)
包含前端、后端、数据库相关术语：
- 前端：React, Vue, TypeScript, JavaScript, Next.js
- 后端：Node.js, Python, Django, FastAPI
- 数据库：MongoDB, PostgreSQL, Redis
- 中文术语：前端、后端、全栈、微服务、容器化

#### 业务词汇表 (`BUSINESS_KEYWORDS`)
包含产品和运营相关术语：
- 英文：SaaS, B2B, B2C, ROI, KPI, MVP
- 中文：产品经理、用户体验、商业模式、增长黑客

### 2. 默认配置

**默认启用**：系统会自动为所有字幕生成请求添加 AI/ML 和编程术语的关键词（`DEFAULT_KEYWORDS`）。

这意味着你无需任何配置，系统就会自动提高对常见技术术语的识别准确度！

### 3. 智能分类（未来功能）

`detectKeywordsFromTitle()` 函数可以根据视频标题自动选择合适的词汇表：
- 标题包含 "AI"、"机器学习"、"Diffusion" → 使用 AI/ML 词汇表
- 标题包含 "编程"、"React"、"Python" → 使用编程词汇表
- 标题包含 "产品"、"运营"、"创业" → 使用业务词汇表

## 使用方法

### 方法 1: 使用默认配置（推荐）

无需任何修改，系统已自动启用！生成字幕时会自动添加专业术语增强。

### 方法 2: 禁用关键词增强

如果你不希望使用关键词增强（例如，处理非技术类视频），可以在调用时传递 `enableKeywords: false`：

```typescript
const response = await generateSubtitlesWithDeepgram(
  file,
  language,
  onProgress,
  abortSignal,
  false  // 禁用关键词增强
);
```

### 方法 3: 自定义词汇表

在 `config/deepgramKeywords.ts` 中添加你的专业领域词汇：

```typescript
// 添加医学术语
export const MEDICAL_KEYWORDS = [
  { word: 'MRI', boost: 3 },
  { word: 'CT扫描', boost: 3 },
  { word: '核磁共振', boost: 3 },
  // ... 更多术语
];

// 修改 DEFAULT_KEYWORDS
export const DEFAULT_KEYWORDS = [
  ...AI_ML_KEYWORDS,
  ...PROGRAMMING_KEYWORDS,
  ...MEDICAL_KEYWORDS,  // 添加新的词汇表
];
```

## 效果对比

### 示例 1: AI/ML 术语

**不使用关键词增强**:
```
散式模型 diffusions model 是生成模型
```

**使用关键词增强后**:
```
扩散模型 Diffusion Model 是生成模型
```

### 示例 2: 英文专业术语

**不使用关键词增强**:
```
transform 和 G P T 模型
```

**使用关键词增强后**:
```
Transformer 和 GPT 模型
```

### 示例 3: 中英混合术语

**不使用关键词增强**:
```
我们使用了 fine tunning 来优化模型
```

**使用关键词增强后**:
```
我们使用了 Fine-tuning 来优化模型
```

## 技术实现

### 1. 参数格式

Deepgram 的 keywords 参数格式：
```
keywords=word1:boost1&keywords=word2:boost2&keywords=word3:boost3
```

### 2. 添加位置

在 `services/deepgramService.ts` 的 5 个不同位置添加了 keywords 支持：
1. 小文件直接上传模式
2. 压缩后直接上传模式
3. URL 模式（通过 proxy）
4. 大文件压缩上传模式
5. 通过 Vercel proxy 上传模式

所有模式都自动支持关键词增强！

### 3. 代码位置

```typescript
// 添加关键词的辅助函数
function addKeywordsToParams(params: URLSearchParams, enableKeywords: boolean) {
  if (!enableKeywords) return;
  
  const keywords = DEFAULT_KEYWORDS;
  console.log(`[Deepgram] 🎯 Adding ${keywords.length} keywords to boost professional terms recognition`);
  
  keywords.forEach(({ word, boost }) => {
    params.append('keywords', `${word}:${boost}`);
  });
}

// 在每个 API 调用前添加
addKeywordsToParams(params, enableKeywords);
```

## 日志输出

启用关键词增强后，控制台会显示：
```
[Deepgram] 🎯 Adding 65 keywords to boost professional terms recognition
```

这表示已成功添加 65 个专业术语到识别请求中。

## 性能影响

✅ **无性能损失**：关键词参数只是 URL 查询参数，不会增加请求体大小或处理时间

✅ **准确度提升**：根据 Deepgram 官方文档，可以显著提高关键词的识别准确度（10-30%）

✅ **成本不变**：使用 keywords 参数不会增加 API 费用

## 注意事项

1. **不要过度增强**：boost 值不要设置太高（避免 > 8），否则可能导致过度匹配

2. **关键词数量限制**：虽然 Deepgram 没有明确限制，但建议保持在 100 个以内以保持性能

3. **中英文混合**：系统同时支持中文和英文关键词，无需分开处理

4. **大小写敏感**：关键词是大小写敏感的，建议使用正确的大小写（如 "GPT" 而非 "gpt"）

## 常见问题

### Q1: 如何知道关键词是否生效？

查看控制台日志，应该会看到：
```
[Deepgram] 🎯 Adding XX keywords to boost professional terms recognition
```

### Q2: 为什么有些术语还是识别错误？

可能原因：
1. 该术语不在词汇表中 → 添加到 `config/deepgramKeywords.ts`
2. boost 值太低 → 增加 boost 值（2-4）
3. 音频质量太差 → 关键词无法完全解决音频质量问题

### Q3: 可以为不同视频使用不同的词汇表吗？

可以！修改 `DEFAULT_KEYWORDS` 或实现智能检测逻辑。

未来可以考虑在 UI 中添加"词汇表选择"功能，让用户选择视频类型。

## 下一步优化

1. **UI 集成**：在字幕生成界面添加"专业领域"选择器
2. **自定义词汇**：允许用户在 UI 中添加自定义关键词
3. **智能检测**：根据视频标题/内容自动选择词汇表
4. **统计反馈**：显示哪些关键词被成功识别

## 相关资源

- [Deepgram Keywords Documentation](https://developers.deepgram.com/docs/keywords)
- [Deepgram API Reference](https://developers.deepgram.com/reference/listen-file)
- 配置文件：`config/deepgramKeywords.ts`
- 服务文件：`services/deepgramService.ts`

---

**🎉 现在你的字幕识别系统已经支持专业术语增强了！**

默认已启用，无需任何配置即可享受更准确的字幕识别效果。



