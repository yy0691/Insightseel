import { syncToCloud } from './syncService';

// 自动同步队列
let syncQueue: string[] = [];
let isSyncing = false;

/**
 * 添加视频到同步队列
 */
export function queueVideoForSync(videoId: string) {
  if (!syncQueue.includes(videoId)) {
    syncQueue.push(videoId);
    console.log(`📥 视频 ${videoId} 已加入同步队列`);
    processSyncQueue();
  }
}

/**
 * 处理同步队列
 */
async function processSyncQueue() {
  // 如果已经在同步中，直接返回
  if (isSyncing || syncQueue.length === 0) {
    return;
  }

  isSyncing = true;
  
  try {
    while (syncQueue.length > 0) {
      const videoId = syncQueue[0];
      console.log(`🔄 开始同步视频 ${videoId}...`);
      
      try {
        await syncToCloud(videoId);
        console.log(`✅ 视频 ${videoId} 同步成功`);
      } catch (error) {
        console.error(`❌ 视频 ${videoId} 同步失败:`, error);
        // 如果同步失败，保留在队列中稍后重试
        break;
      }
      
      // 从队列中移除已同步的视频
      syncQueue.shift();
    }
  } finally {
    isSyncing = false;
    
    // 如果队列中还有未同步的项目，5秒后重试
    if (syncQueue.length > 0) {
      console.log(`⏳ ${syncQueue.length} 个视频等待同步，5秒后重试...`);
      setTimeout(processSyncQueue, 5000);
    }
  }
}

/**
 * 初始化自动同步
 */
export function initAutoSync() {
  console.log('🔁 自动同步服务已启动');
  
  // 监听网络状态变化
  window.addEventListener('online', () => {
    console.log('🌐 网络已连接，恢复同步');
    processSyncQueue();
  });
  
  // 每5分钟同步一次，确保数据一致性
  setInterval(() => {
    console.log('⏰ 定时同步检查...');
    processSyncQueue();
  }, 5 * 60 * 1000);
}

export default {
  queueVideoForSync,
  initAutoSync
};
