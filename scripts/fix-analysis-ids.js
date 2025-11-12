/**
 * 修复 Analysis ID 格式 - 转换为 UUID
 * 在浏览器控制台运行
 */

(async function fixAnalysisIds() {
  console.log('🔧 修复 Analysis ID 格式...\n');

  // 使用 SHA-256 生成确定性 UUID
  async function generateDeterministicUUID(input) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    const uuid = [
      hashHex.slice(0, 8),
      hashHex.slice(8, 12),
      '4' + hashHex.slice(13, 16),
      ((parseInt(hashHex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') + hashHex.slice(18, 20),
      hashHex.slice(20, 32)
    ].join('-');
    
    return uuid;
  }

  // 验证 UUID 格式
  function isValidUUID(id) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }

  try {
    // 打开数据库
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('LocalVideoAnalyzerDB');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    console.log('✅ 数据库已打开\n');

    // 获取所有分析
    const getAllAnalyses = () => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('analyses', 'readonly');
        const store = tx.objectStore('analyses');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    };

    // 更新分析
    const updateAnalysis = (analysis) => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('analyses', 'readwrite');
        const store = tx.objectStore('analyses');
        const request = store.put(analysis);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    };

    // 删除分析
    const deleteAnalysis = (id) => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('analyses', 'readwrite');
        const store = tx.objectStore('analyses');
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    };

    const analyses = await getAllAnalyses();
    console.log(`📊 找到 ${analyses.length} 个分析\n`);

    let fixedCount = 0;
    let validCount = 0;

    for (const analysis of analyses) {
      const oldId = analysis.id;
      
      if (isValidUUID(oldId)) {
        console.log(`✅ 分析 ${oldId.slice(0, 20)}... 格式正确`);
        validCount++;
        continue;
      }

      console.log(`🔧 修复分析 ID...`);
      console.log(`   旧 ID: ${oldId.slice(0, 60)}...`);

      // 使用旧 ID 生成新的确定性 UUID
      const newId = await generateDeterministicUUID(oldId);
      
      console.log(`   新 ID: ${newId}`);

      if (!isValidUUID(newId)) {
        console.error(`   ❌ 新 ID 格式错误，跳过\n`);
        continue;
      }

      try {
        // 创建新记录
        const newAnalysis = { ...analysis, id: newId };
        await updateAnalysis(newAnalysis);
        
        // 删除旧记录
        await deleteAnalysis(oldId);
        
        fixedCount++;
        console.log(`   ✅ 修复完成\n`);

      } catch (error) {
        console.error(`   ❌ 修复失败:`, error, '\n');
      }
    }

    db.close();

    console.log('='.repeat(50));
    console.log('✨ 修复完成！');
    console.log('='.repeat(50));
    console.log(`📊 统计:`);
    console.log(`  - ✅ 已修复: ${fixedCount} 个`);
    console.log(`  - ✅ 已正确: ${validCount} 个`);
    console.log('='.repeat(50));

    if (fixedCount > 0) {
      console.log('\n🔄 请刷新页面:');
      console.log('   location.reload()');
      console.log('\n💡 刷新后可以尝试同步到云端');
    } else if (validCount === analyses.length) {
      console.log('\n✅ 所有 Analysis ID 格式都正确！');
      console.log('💡 现在可以尝试同步到云端');
    }

  } catch (error) {
    console.error('❌ 修复失败:', error);
  }
})();
