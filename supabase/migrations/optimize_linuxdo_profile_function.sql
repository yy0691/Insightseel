-- 优化 Linux.do Profile 创建函数
-- 添加更好的错误处理、验证和唯一性检查

-- 删除旧函数（如果存在）
DROP FUNCTION IF EXISTS create_linuxdo_profile(text, text, text, text, jsonb);

-- 创建优化后的函数
CREATE OR REPLACE FUNCTION create_linuxdo_profile(
  p_linuxdo_user_id text,
  p_email text,
  p_username text,
  p_avatar_url text DEFAULT NULL,
  p_user_data jsonb DEFAULT NULL
)
RETURNS profiles AS $$
DECLARE
  new_profile_id uuid;
  new_profile profiles;
  existing_profile profiles;
BEGIN
  -- 参数验证
  IF p_linuxdo_user_id IS NULL OR p_linuxdo_user_id = '' THEN
    RAISE EXCEPTION 'linuxdo_user_id 不能为空';
  END IF;

  IF p_email IS NULL OR p_email = '' THEN
    RAISE EXCEPTION 'email 不能为空';
  END IF;

  IF p_username IS NULL OR p_username = '' THEN
    RAISE EXCEPTION 'username 不能为空';
  END IF;

  -- 检查是否已存在相同 linuxdo_user_id 的 profile
  SELECT * INTO existing_profile
  FROM profiles
  WHERE linuxdo_user_id = p_linuxdo_user_id
  LIMIT 1;

  IF existing_profile IS NOT NULL THEN
    -- 如果已存在，更新并返回现有 profile
    UPDATE profiles
    SET
      email = p_email,
      full_name = p_username,
      avatar_url = COALESCE(p_avatar_url, avatar_url),
      linuxdo_username = p_username,
      linuxdo_avatar_url = COALESCE(p_avatar_url, linuxdo_avatar_url),
      linuxdo_user_data = COALESCE(p_user_data, linuxdo_user_data),
      updated_at = NOW()
    WHERE id = existing_profile.id
    RETURNING * INTO new_profile;
    
    RETURN new_profile;
  END IF;

  -- 生成新的 UUID
  new_profile_id := gen_random_uuid();

  -- 插入新 profile
  INSERT INTO profiles (
    id,
    email,
    full_name,
    avatar_url,
    linuxdo_user_id,
    linuxdo_username,
    linuxdo_avatar_url,
    linuxdo_user_data,
    auth_user_id,
    is_linuxdo_only,
    created_at,
    updated_at
  ) VALUES (
    new_profile_id,
    p_email,
    p_username,
    p_avatar_url,
    p_linuxdo_user_id,
    p_username,
    p_avatar_url,
    p_user_data,
    NULL, -- 没有 Supabase auth 用户
    true, -- 这是 Linux.do-only profile
    NOW(),
    NOW()
  )
  RETURNING * INTO new_profile;

  RETURN new_profile;
EXCEPTION
  WHEN unique_violation THEN
    -- 如果发生唯一性冲突，尝试查找并返回现有 profile
    SELECT * INTO existing_profile
    FROM profiles
    WHERE linuxdo_user_id = p_linuxdo_user_id
    LIMIT 1;
    
    IF existing_profile IS NOT NULL THEN
      RETURN existing_profile;
    END IF;
    
    RAISE;
  WHEN OTHERS THEN
    -- 记录错误并重新抛出
    RAISE EXCEPTION '创建 Linux.do profile 失败: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 添加函数注释
COMMENT ON FUNCTION create_linuxdo_profile IS 
  '创建或更新 Linux.do-only profile。如果已存在相同 linuxdo_user_id 的 profile，则更新并返回现有 profile。';

-- 添加唯一索引（如果不存在）以防止重复
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_linuxdo_user_id_unique 
  ON profiles(linuxdo_user_id) 
  WHERE linuxdo_user_id IS NOT NULL;

