-- 修复 oauth_config 表的 RLS 策略，允许匿名用户读取
-- 这是必需的，因为 Linux.do 登录流程在用户未登录时就需要读取配置

-- 删除旧的策略（如果存在）
DROP POLICY IF EXISTS "Allow authenticated users to read oauth config" ON oauth_config;

-- 创建新策略：允许匿名用户和已认证用户读取
-- OAuth 配置（client_id、redirect_uri）是公开信息，在登录流程中需要读取
CREATE POLICY "Allow anonymous users to read oauth config"
  ON oauth_config FOR SELECT
  TO anon, authenticated
  USING (true);

-- 注意：写入操作仍然只允许已认证用户（通过之前的策略）

