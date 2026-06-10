export interface DownloadResult {
  success: boolean;
  filePath?: string;
  title?: string;
  duration?: number;
  error?: string;
  file?: File; // 下载到浏览器的文件对象
}
