# InsightReel 浏览器插件

一款专业的AI驱动浏览器插件，可直接从浏览器分析视频。获取摘要、翻译字幕、关键片段以及提问——无需离开当前页面。

## 功能

✨ **智能视频检测**
- 自动检测YouTube、Vimeo和所有HTML5视频
- 支持每页多个视频
- 可与嵌入播放器配合使用

🎯 **核心分析**
- **摘要**：AI生成的视频内容关键点
- **关键片段**：识别重要亮点和场景
- **翻译**：多语言字幕支持
- **聊天**：根据上下文提问视频内容

🔧 **配置**
- 支持多个AI提供者（Gemini、OpenAI、Poe）
- 双语界面（英文 & 中文）
- 灵活的API密钥管理
- 代理API支持以实现CORS兼容

## 架构

### 目录结构

```
plugin/
├── manifest.json              # 插件配置
├── popup.html                 # 弹出界面入口
├── content/
│   └── index.ts              # 内容脚本（页面检测）
├── popup/
│   ├── index.tsx             # React入口
│   ├── App.tsx               # 主弹出组件
│   └── components/
│       ├── VideoSelector.tsx  # 视频检测界面
│       ├── AnalysisPanel.tsx  # 分析展示
│       └── SettingsPanel.tsx  # 配置界面
├── background/
│   └── index.ts              # 服务工作者（处理）
├── shared/
│   └── types.ts              # 共享类型定义
└── styles/
    └── popup.css             # 使用设计系统进行样式设置
```

### 关键组件

1. **内容脚本** (`content/index.ts`)
   - 在每个页面运行
   - 使用多种策略检测视频
   - 通过`chrome.runtime.sendMessage`与弹出界面通信
   - 支持：YouTube、Vimeo、HTML5视频、iframes

2. **弹出界面** (`popup/`)
   - 基于React的响应式界面
   - 多视频选择器
   - 带实时处理反馈的分析面板
   - 设置管理
   - 遵循专业设计系统

3. **后台服务工作者** (`background/index.ts`)
   - 处理视频分析请求
   - 与代理API通信
   - 管理异步处理与任务追踪
   - 使用结果更新弹出界面

## 设计系统

该插件遵循专业的InsightReel设计系统：

### 颜色
- **主色**：`#059669`（翡翠绿）
- **背景色**：`#F5F5F7`（浅灰）
- **表面色**：`#FFFFFF`（白）
- **文字色**：`#111827`（深色）

### 字体
- 字体：系统字体（-apple-system, system-ui, SF Pro Text）
- 字号：H3（18px），正文（14px），元数据（12px）

### 组件
- 圆角：`20px`（卡片风格）
- 阴影：柔和阴影，透明度`0.06`
- 图标：Lucide React（线图标）

### 动画
- 持续时间：150-220ms
- 缓动函数：`cubic-bezier(0.4, 0, 0.2, 1)`
- 属性：仅支持`transform`和`opacity`

## 构建插件

### 要求
- Node.js 18+
- npm 或 pnpm
- TypeScript 5.8+

### 构建步骤

```bash
# 安装依赖（从主项目）
npm install

# 使用Vite构建插件
npm run build:plugin

# 或者手动使用Vite构建
vite build --config plugin.vite.config.ts
```

### 输出
生成文件位于`dist/plugin/`：
- `manifest.json` - 与源文件相同
- `content.js` - 编译后的内容脚本
- `background.js` - 编译后的服务工作者
- `popup.html` - HTML入口
- `popup.js` - React弹出界面包
- `styles/popup.css` - 编译后的样式

## 安装

### 开发（本地测试）

1. 构建插件：
   ```bash
   npm run build:plugin
   ```

2. 打开Chrome扩展：
   - 进入`chrome://extensions/`
   - 启用“开发者模式”（右上角切换）

3. 加载未打包扩展：
   - 点击“加载未打包扩展”
   - 选择`dist/plugin/`文件夹

### 发布（Chrome应用商店）

1. 使用Chrome创建一个`.crx`文件
2. 提交至Chrome应用商店

## API集成

插件通过InsightReel代理API进行视频分析：

```
POST https://api.insightreel.app/api/analyze-video
```

### 请求体
```json
{
  "videoUrl": "https://youtube.com/watch?v=...",
  "analysisType": "summary|key-moments|translation|chat",
  "provider": "gemini|openai|poe",
  "model": "gemini-2.0-flash",
  "language": "en|zh"
}
```

### 请求头
```
X-API-Key: your-api-key（可选，未提供时使用代理）
Content-Type: application/json
```

## 配置

设置存储在`chrome.storage.local`中：

```typescript
interface PluginSettings {
  apiProvider: 'gemini' | 'openai' | 'poe' | 'custom';
  apiKey?: string;
  baseUrl?: string;
  model: string;
  language: 'en' | 'zh';
  useProxy?: boolean;
}
```

用户可以在插件设置面板中进行配置：
- 选择AI提供者
- 输入API密钥（或使用代理）
- 选择模型
- 设置界面语言

## 开发流程

### 新增分析类型

1. 更新`shared/types.ts`中的`AnalysisType`
2. 在`AnalysisPanel.tsx`的`analysisOptions`数组中添加分析选项
3. 在后台工作者处理逻辑中处理

### 扩展视频检测

1. 在`content/index.ts`中添加检测函数
2. 更新`getPageVideoInfo()`以包含新的提供者
3. 如有必要，在`VideoSelector.tsx`中添加图标

### 样式

- 使用`plugin/styles/popup.css`中的Tailwind CSS类
- 保持与设计系统颜色的一致性
- 遵循动画指南进行微交互

## 常见问题排查

### 视频未被检测
- 确保内容脚本有页面的权限
- 检查视频是否在iframe中（会应用跨域限制）
- 验证视频元素是否正确构建

### API错误
- 检查设置中的API密钥是否有效
- 确认代理API是否可访问
- 检查浏览器控制台获取详细错误信息

### CORS问题
- 在设置中启用“使用代理API”
- 确保代理服务器有正确的CORS头
- 直接测试API端点

## 未来改进

- [ ] 离线模式与IndexedDB缓存
- [ ] 多视频批量分析
- [ ] 视频时间戳书签
- [ ] 导出分析到多种格式
- [ ] 多语言字幕生成
- [ ] 自定义快捷键用于快速分析
- [ ] 暗色模式支持
- [ ] 视频字幕中的高级搜索

## 贡献

在贡献插件时：

1. 遵循现有的代码风格和结构
2. 使用TypeScript进行类型安全
3. 保持设计系统的一致性
4. 在多个浏览器上测试
5. 更新此文档

## 许可证

与主InsightReel项目相同。