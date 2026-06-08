import { ClassifiedError, ErrorCategory } from '../services/errorClassifier';

export interface ErrorDisplay {
  title: string;
  description: string;
  retryable: boolean;
  toastDuration: number;
}

const MESSAGES_EN: Record<ErrorCategory, [string, string]> = {
  auth: [
    'Authentication Required',
    'Please log in to use the system API key, or configure your own key in Settings.',
  ],
  quota: [
    'Quota Exceeded',
    'API usage limit reached. Wait a moment or upgrade your plan.',
  ],
  timeout: [
    'Request Timed Out',
    'The operation took too long. Please retry.',
  ],
  network: [
    'Network Error',
    'Cannot reach the server. Check your internet connection and retry.',
  ],
  cors: [
    'Access Blocked (CORS)',
    'The API endpoint rejected the cross-origin request. Check proxy settings.',
  ],
  server: [
    'Server Error',
    'The server is temporarily unavailable. Please retry in a moment.',
  ],
  unsupported: [
    'Unsupported Format',
    'The file or format is not supported, or the file is too large.',
  ],
  noSpeech: [
    'No Speech Detected',
    'No clear speech was found. Check the video language selection and audio quality.',
  ],
  noCaptions: [
    'No Captions Available',
    'This video does not have available captions. Try the Record option to capture and transcribe it, or upload a subtitle file manually.',
  ],
  invalidInput: [
    'Invalid Input',
    'The URL or input is invalid, or the content could not be found.',
  ],
  cancelled: [
    'Cancelled',
    'The operation was cancelled.',
  ],
  unknown: [
    'An Error Occurred',
    'Something went wrong. Check the browser console for details.',
  ],
};

const MESSAGES_ZH: Record<ErrorCategory, [string, string]> = {
  auth: [
    '需要登录',
    '请登录后使用系统 API Key，或在设置中配置您自己的 API Key。',
  ],
  quota: [
    '配额已用尽',
    'API 使用量达到上限，请稍后重试或升级套餐。',
  ],
  timeout: [
    '请求超时',
    '操作耗时过长，请重试。',
  ],
  network: [
    '网络错误',
    '无法连接服务器，请检查网络连接后重试。',
  ],
  cors: [
    '跨域访问被阻止',
    'API 端点拒绝了跨域请求，请检查代理设置。',
  ],
  server: [
    '服务器错误',
    '服务器暂时不可用，请稍后重试。',
  ],
  unsupported: [
    '格式不支持',
    '文件格式不受支持或文件过大。',
  ],
  noSpeech: [
    '未检测到语音',
    '音频中未找到清晰的语音，请检查视频语言选择和音频质量。',
  ],
  noCaptions: [
    '暂无字幕',
    '该视频没有可用字幕，可使用"录音 / 录屏"功能录制并转写，或手动上传字幕文件。',
  ],
  invalidInput: [
    '输入无效',
    '提供的链接或内容无法识别或找到。',
  ],
  cancelled: [
    '已取消',
    '操作已取消。',
  ],
  unknown: [
    '发生错误',
    '出现了未知错误，请查看浏览器控制台了解详情。',
  ],
};

export function getErrorDisplay(classified: ClassifiedError, language: string): ErrorDisplay {
  const messages = language === 'zh' ? MESSAGES_ZH : MESSAGES_EN;
  const [title, description] = messages[classified.category] ?? messages.unknown;
  return {
    title,
    description,
    retryable: classified.retryable,
    toastDuration: classified.retryable ? 7000 : 5000,
  };
}
