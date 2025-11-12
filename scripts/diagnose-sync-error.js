/**
 * 诊断同步错误 - 查看详细的错误信息
 * 在浏览器控制台运行
 */

(async function diagnoseSyncError() {
  console.log('🔍 诊断同步错误...\n');

  try {
    // 打开数据库
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('LocalVideoAnalyzerDB');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    console.log('✅ 数据库已打开\n');

    // 获取所有记录
    const getAllRecords = (storeName) => {
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(storeName, 'readonly');
          const store = tx.objectStore(storeName);
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => resolve([]);
        } catch (error) {
          resolve([]);
        }
      });
    };

    // 获取数据
    const [videos, subtitles, analyses, notes, chats] = await Promise.all([
      getAllRecords('videos'),
      getAllRecords('subtitles'),
      getAllRecords('analyses'),
      getAllRecords('notes'),
      getAllRecords('chatHistory')
    ]);

    console.log('📊 数据统计:');
    console.log(`  - 视频: ${videos.length} 个`);
    console.log(`  - 字幕: ${subtitles.length} 个`);
    console.log(`  - 分析: ${analyses.length} 个`);
    console.log(`  - 笔记: ${notes.length} 个`);
    console.log(`  - 聊天: ${chats.length} 个\n`);

    // 检查视频数据
    console.log('🔍 检查视频数据结构:\n');
    if (videos.length > 0) {
      const video = videos[0];
      console.log('示例视频:', video.name);
      console.log('  - id:', video.id, '(类型:', typeof video.id, ')');
      console.log('  - size:', video.size, '(类型:', typeof video.size, ')');
      console.log('  - hash:', video.hash, '(类型:', typeof video.hash, ')');
      console.log('  - duration:', video.duration, '(类型:', typeof video.duration, ')');
      console.log('  - language:', video.language, '(类型:', typeof video.language, ')');
      console.log('');
    }

    // 检查字幕数据
    console.log('🔍 检查字幕数据结构:\n');
    if (subtitles.length > 0) {
      const subtitle = subtitles[0];
      console.log('示例字幕:');
      console.log('  - id:', subtitle.id, '(类型:', typeof subtitle.id, ')');
      console.log('  - videoId:', subtitle.videoId, '(类型:', typeof subtitle.videoId, ')');
      console.log('  - content:', subtitle.content ? '有内容' : '无内容');
      console.log('  - language:', subtitle.language, '(类型:', typeof subtitle.language, ')');
      console.log('  - segments:', Array.isArray(subtitle.segments) ? `${subtitle.segments.length} 个片段` : '不是数组');
      console.log('');
    }

    // 检查分析数据
    console.log('🔍 检查分析数据结构:\n');
    if (analyses.length > 0) {
      const analysis = analyses[0];
      console.log('示例分析:');
      console.log('  - id:', analysis.id, '(类型:', typeof analysis.id, ')');
      console.log('  - videoId:', analysis.videoId, '(类型:', typeof analysis.videoId, ')');
      console.log('  - type:', analysis.type, '(类型:', typeof analysis.type, ')');
      console.log('  - title:', analysis.title, '(类型:', typeof analysis.title, ')');
      console.log('  - content:', analysis.content ? '有内容' : '无内容');
      console.log('  - result:', analysis.result ? '有结果' : '无结果');
      console.log('  - prompt:', analysis.prompt ? '有提示' : '无提示');
      console.log('');
    }

    // 检查 UUID 格式
    console.log('🔍 检查 UUID 格式:\n');
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    let invalidUUIDs = 0;
    videos.forEach(video => {
      if (!uuidRegex.test(video.id)) {
        console.log(`❌ 视频 "${video.name}" ID 格式错误: ${video.id}`);
        invalidUUIDs++;
      }
    });

    if (invalidUUIDs === 0) {
      console.log('✅ 所有视频 ID 格式正确\n');
    } else {
      console.log(`\n⚠️ 发现 ${invalidUUIDs} 个格式错误的 UUID\n`);
    }

    // 检查必需字段
    console.log('🔍 检查必需字段:\n');
    
    videos.forEach(video => {
      const missing = [];
      if (!video.id) missing.push('id');
      if (!video.name) missing.push('name');
      if (video.size === undefined || video.size === null) missing.push('size');
      if (!video.duration) missing.push('duration');
      
      if (missing.length > 0) {
        console.log(`❌ 视频 "${video.name}" 缺少字段:`, missing.join(', '));
      }
    });

    analyses.forEach(analysis => {
      const missing = [];
      if (!analysis.id) missing.push('id');
      if (!analysis.videoId) missing.push('videoId');
      if (!analysis.type) missing.push('type');
      
      // 检查是否有 title 和 content（新格式）或 result 和 prompt（旧格式）
      const hasNewFormat = analysis.title && analysis.content;
      const hasOldFormat = analysis.result && analysis.prompt;
      
      if (!hasNewFormat && !hasOldFormat) {
        console.log(`❌ 分析 ${analysis.id} 格式错误:`, {
          hasTitle: !!analysis.title,
          hasContent: !!analysis.content,
          hasResult: !!analysis.result,
          hasPrompt: !!analysis.prompt
        });
      }
    });

    db.close();

    console.log('\n' + '='.repeat(50));
    console.log('✨ 诊断完成！');
    console.log('='.repeat(50));
    console.log('\n💡 建议:');
    console.log('1. 如果有 UUID 格式错误，运行 scripts/final-fix.js');
    console.log('2. 如果缺少 size 字段，运行 scripts/add-video-size.js');
    console.log('3. 如果分析格式错误，可能需要数据迁移');

  } catch (error) {
    console.error('❌ 诊断失败:', error);
  }
})();
