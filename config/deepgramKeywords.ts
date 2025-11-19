/**
 * Deepgram Keywords Configuration
 * 
 * 通过 keywords 参数可以提高特定词汇的识别准确度
 * 格式: keywords=word1:boost_value&keywords=word2:boost_value
 * 
 * boost_value 范围: -10 到 10
 * - 正值：增强该词被识别的可能性
 * - 负值：降低该词被识别的可能性
 * - 推荐值：1-3（轻微增强）、4-6（中度增强）、7-10（强烈增强）
 */

// AI 和机器学习相关术语
export const AI_ML_KEYWORDS = [
  // 深度学习
  { word: 'Diffusion Model', boost: 3 },
  { word: 'Transformer', boost: 3 },
  { word: 'GPT', boost: 3 },
  { word: 'BERT', boost: 3 },
  { word: 'CNN', boost: 2 },
  { word: 'RNN', boost: 2 },
  { word: 'LSTM', boost: 2 },
  
  // 扩散模型
  { word: 'DDPM', boost: 3 },
  { word: 'DDIM', boost: 3 },
  { word: 'Stable Diffusion', boost: 3 },
  { word: 'Latent Diffusion', boost: 3 },
  { word: 'Denoising', boost: 2 },
  
  // 大模型
  { word: 'LLM', boost: 3 },
  { word: 'ChatGPT', boost: 3 },
  { word: 'Claude', boost: 3 },
  { word: 'Gemini', boost: 3 },
  { word: 'Llama', boost: 3 },
  
  // 训练和优化
  { word: 'Fine-tuning', boost: 2 },
  { word: 'Prompt Engineering', boost: 2 },
  { word: 'RAG', boost: 2 },
  { word: 'LoRA', boost: 2 },
  { word: 'Adapter', boost: 2 },
  
  // 中文术语
  { word: '扩散模型', boost: 3 },
  { word: '大语言模型', boost: 3 },
  { word: '预训练', boost: 2 },
  { word: '微调', boost: 2 },
  { word: '提示词', boost: 2 },
  { word: '注意力机制', boost: 2 },
  { word: '卷积神经网络', boost: 2 },
  { word: '循环神经网络', boost: 2 },
];

// 编程和技术相关术语
export const PROGRAMMING_KEYWORDS = [
  // 前端
  { word: 'React', boost: 3 },
  { word: 'Vue', boost: 3 },
  { word: 'TypeScript', boost: 3 },
  { word: 'JavaScript', boost: 2 },
  { word: 'Next.js', boost: 2 },
  
  // 后端
  { word: 'Node.js', boost: 3 },
  { word: 'Python', boost: 3 },
  { word: 'Django', boost: 2 },
  { word: 'FastAPI', boost: 2 },
  
  // 数据库
  { word: 'MongoDB', boost: 2 },
  { word: 'PostgreSQL', boost: 2 },
  { word: 'Redis', boost: 2 },
  
  // 中文术语
  { word: '前端', boost: 2 },
  { word: '后端', boost: 2 },
  { word: '全栈', boost: 2 },
  { word: '微服务', boost: 2 },
  { word: '容器化', boost: 2 },
];

// 业务和产品相关术语
export const BUSINESS_KEYWORDS = [
  { word: 'SaaS', boost: 2 },
  { word: 'B2B', boost: 2 },
  { word: 'B2C', boost: 2 },
  { word: 'ROI', boost: 2 },
  { word: 'KPI', boost: 2 },
  { word: 'MVP', boost: 2 },
  
  // 中文术语
  { word: '产品经理', boost: 2 },
  { word: '用户体验', boost: 2 },
  { word: '商业模式', boost: 2 },
  { word: '增长黑客', boost: 2 },
];

// 通用技术术语（默认使用）
export const DEFAULT_KEYWORDS = [
  ...AI_ML_KEYWORDS,
  ...PROGRAMMING_KEYWORDS,
];

/**
 * 根据视频内容类型选择关键词列表
 */
export function getKeywordsByCategory(category?: 'ai' | 'programming' | 'business' | 'all'): Array<{ word: string; boost: number }> {
  switch (category) {
    case 'ai':
      return AI_ML_KEYWORDS;
    case 'programming':
      return PROGRAMMING_KEYWORDS;
    case 'business':
      return BUSINESS_KEYWORDS;
    case 'all':
      return [...AI_ML_KEYWORDS, ...PROGRAMMING_KEYWORDS, ...BUSINESS_KEYWORDS];
    default:
      return DEFAULT_KEYWORDS;
  }
}

/**
 * 将关键词列表转换为 Deepgram 的查询参数格式
 * 格式: keywords=word1:boost1&keywords=word2:boost2
 */
export function formatKeywordsForDeepgram(keywords: Array<{ word: string; boost: number }>): string {
  return keywords
    .map(({ word, boost }) => `keywords=${encodeURIComponent(word)}:${boost}`)
    .join('&');
}

/**
 * 智能检测视频标题/内容，自动选择合适的关键词
 */
export function detectKeywordsFromTitle(title: string): Array<{ word: string; boost: number }> {
  const lowerTitle = title.toLowerCase();
  
  // AI/ML 相关
  const isAI = /ai|ml|机器学习|深度学习|神经网络|diffusion|transformer|gpt|大模型/i.test(title);
  if (isAI) {
    return AI_ML_KEYWORDS;
  }
  
  // 编程相关
  const isProgramming = /编程|代码|开发|react|vue|python|javascript|前端|后端/i.test(title);
  if (isProgramming) {
    return PROGRAMMING_KEYWORDS;
  }
  
  // 业务相关
  const isBusiness = /产品|运营|商业|创业|增长|saas|b2b/i.test(title);
  if (isBusiness) {
    return BUSINESS_KEYWORDS;
  }
  
  // 默认使用通用术语
  return DEFAULT_KEYWORDS;
}

