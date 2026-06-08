/**
 * 数据迁移脚本：将旧的文件名格式 ID 转换为 UUID 格式
 * 
 * 使用方法：
 * 1. 在浏览器控制台运行此脚本
 * 2. 或在应用启动时自动运行
 */

import { videoDB, subtitleDB, analysisDB, noteDB, chatDB } from '../services/dbService';
import { generateDeterministicUUID } from '../utils/helpers';

interface MigrationResult {
  success: boolean;
  migratedVideos: number;
  errors: string[];
}

/**
 * 检查 ID 是否为 UUID 格式
 */
function isUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * 迁移视频 ID 从文件名格式到 UUID 格式
 */
export async function migrateVideoIds(): Promise<MigrationResult> {
  console.log('🔄 开始迁移视频 ID...');
  
  const result: MigrationResult = {
    success: true,
    migratedVideos: 0,
    errors: [],
  };

  try {
    // 1. 获取所有视频
    const videos = await videoDB.getAll();
    console.log(`📹 找到 ${videos.length} 个视频`);

    for (const video of videos) {
      // 检查是否已经是 UUID 格式
      if (isUUID(video.id)) {
        console.log(`✅ 视频 "${video.name}" 已经是 UUID 格式，跳过`);
        continue;
      }

      console.log(`🔧 迁移视频 "${video.name}"...`);
      const oldId = video.id;
      
      // 生成新的 UUID（使用相同的逻辑确保一致性）
      const newId = await generateDeterministicUUID(oldId);
      
      try {
        // 2. 获取关联数据
        const [subtitle, analyses, note, chat] = await Promise.all([
          subtitleDB.get(oldId),
          analysisDB.getByVideoId(oldId),
          noteDB.get(oldId),
          chatDB.get(oldId),
        ]);

        // 3. 创建新的视频记录
        const newVideo = { ...video, id: newId };
        await videoDB.put(newVideo);

        // 4. 迁移字幕
        if (subtitle) {
          const newSubtitle = { ...subtitle, id: newId, videoId: newId };
          await subtitleDB.put(newSubtitle);
          await subtitleDB.delete(oldId);
          console.log(`  ✅ 字幕已迁移`);
        }

        // 5. 迁移分析结果
        if (analyses && analyses.length > 0) {
          for (const analysis of analyses) {
            const newAnalysis = { ...analysis, videoId: newId };
            await analysisDB.put(newAnalysis);
          }
          // 删除旧的分析记录
          for (const analysis of analyses) {
            await analysisDB.delete(analysis.id);
          }
          console.log(`  ✅ ${analyses.length} 个分析结果已迁移`);
        }

        // 6. 迁移笔记
        if (note) {
          const newNote = { ...note, id: newId, videoId: newId };
          await noteDB.put(newNote);
          await noteDB.delete(oldId);
          console.log(`  ✅ 笔记已迁移`);
        }

        // 7. 迁移聊天记录
        if (chat) {
          const newChat = { ...chat, id: newId, videoId: newId };
          await chatDB.put(newChat);
          await chatDB.delete(oldId);
          console.log(`  ✅ 聊天记录已迁移`);
        }

        // 8. 删除旧的视频记录
        await videoDB.delete(oldId);

        result.migratedVideos++;
        console.log(`✅ 视频 "${video.name}" 迁移完成 (${oldId} → ${newId})`);

      } catch (error) {
        const errorMsg = `迁移视频 "${video.name}" 失败: ${error}`;
        console.error(`❌ ${errorMsg}`);
        result.errors.push(errorMsg);
        result.success = false;
      }
    }

    console.log(`\n✨ 迁移完成！`);
    console.log(`  - 成功迁移: ${result.migratedVideos} 个视频`);
    console.log(`  - 错误数量: ${result.errors.length}`);
    
    if (result.errors.length > 0) {
      console.log(`\n❌ 错误列表:`);
      result.errors.forEach(err => console.log(`  - ${err}`));
    }

  } catch (error) {
    result.success = false;
    result.errors.push(`迁移过程出错: ${error}`);
    console.error('❌ 迁移失败:', error);
  }

  return result;
}

/**
 * 检查是否需要迁移
 */
export async function checkMigrationNeeded(): Promise<boolean> {
  try {
    const videos = await videoDB.getAll();
    return videos.some(video => !isUUID(video.id));
  } catch (error) {
    console.error('检查迁移状态失败:', error);
    return false;
  }
}

/**
 * 自动迁移（如果需要）
 */
export async function autoMigrate(): Promise<void> {
  const needsMigration = await checkMigrationNeeded();
  
  if (needsMigration) {
    console.log('🔍 检测到旧格式的视频 ID，开始自动迁移...');
    const result = await migrateVideoIds();
    
    if (result.success && result.migratedVideos > 0) {
      console.log('✅ 自动迁移成功！请刷新页面。');
      // 可以选择自动刷新页面
      // window.location.reload();
    }
  } else {
    console.log('✅ 所有视频 ID 已经是 UUID 格式');
  }
}

// 导出到全局，方便在控制台调用
if (typeof window !== 'undefined') {
  (window as any).migrateVideoIds = migrateVideoIds;
  (window as any).checkMigrationNeeded = checkMigrationNeeded;
  (window as any).autoMigrate = autoMigrate;
  
  console.log('💡 视频 ID 迁移工具已加载');
  console.log('   - migrateVideoIds() - 执行迁移');
  console.log('   - checkMigrationNeeded() - 检查是否需要迁移');
  console.log('   - autoMigrate() - 自动迁移（如果需要）');
}
