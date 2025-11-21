/**
 * Linux.do OAuth 回调处理服务
 * 将回调逻辑从 App.tsx 中提取出来，使代码更模块化
 */

import { authService, type Profile } from './authService';
import { 
  exchangeCodeForToken, 
  getLinuxDoUserInfo, 
  verifyState, 
  getStoredRedirectUri 
} from './linuxDoAuthService';
import { toast } from '../hooks/useToastStore';

interface OAuthCallbackParams {
  code: string;
  state: string;
  error?: string;
}

interface OAuthCallbackResult {
  success: boolean;
  profile?: Profile;
  error?: string;
}

/**
 * 处理 Linux.do OAuth 回调
 */
export async function handleLinuxDoCallback(
  params: OAuthCallbackParams,
  currentUser: any
): Promise<OAuthCallbackResult> {
  const { code, state, error } = params;

  // 处理 OAuth 错误
  if (error) {
    return handleOAuthError(error);
  }

  // 验证必需参数
  if (!code || !state) {
    return {
      success: false,
      error: 'OAuth 回调参数不完整：缺少 code 或 state',
    };
  }

  // 验证 state（防止 CSRF 攻击）
  if (!verifyState(state)) {
    return {
      success: false,
      error: '状态参数验证失败。请重新点击登录按钮，确保在同一窗口中完成授权。',
    };
  }

  try {
    // 交换授权码获取访问令牌
    const storedRedirectUri = getStoredRedirectUri();
    if (!storedRedirectUri) {
      return {
        success: false,
        error: '未找到存储的 redirect_uri。请清除浏览器 sessionStorage 后重新登录。',
      };
    }

    const tokenData = await exchangeCodeForToken(code, storedRedirectUri);

    // 获取用户信息
    const userInfo = await getLinuxDoUserInfo(tokenData.access_token);

    // 提取 Linux.do 用户 ID
    const linuxdoUserId = extractLinuxDoUserId(userInfo);
    if (!linuxdoUserId) {
      return {
        success: false,
        error: '无法从用户信息中提取 Linux.do 用户 ID',
      };
    }

    // 提取头像 URL
    const avatarUrl = extractAvatarUrl(userInfo);

    // 处理 profile（根据是否已登录 Supabase）
    let profile: Profile | null = null;

    if (currentUser) {
      // 用户已登录 Supabase，更新现有 profile
      profile = await updateSupabaseUserProfile(
        currentUser.id,
        linuxdoUserId,
        userInfo,
        avatarUrl,
        tokenData
      );
    } else {
      // 用户未登录 Supabase，查找或创建独立的 Linux.do profile
      profile = await findOrCreateLinuxDoProfile(
        linuxdoUserId,
        userInfo,
        avatarUrl,
        tokenData
      );
    }

    return {
      success: true,
      profile: profile || undefined,
    };
  } catch (error) {
    console.error('[Linux.do Callback] 处理失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

/**
 * 处理 OAuth 错误
 */
function handleOAuthError(error: string): OAuthCallbackResult {
  const errorMessages: Record<string, { title: string; description: string }> = {
    invalid_request: {
      title: '请求参数无效',
      description: '请检查 redirect_uri 是否与 Linux.do 应用中配置的回调 URL 完全匹配',
    },
    unauthorized_client: {
      title: '客户端未授权',
      description: '请检查 Client ID 是否正确，并确认 OAuth 应用状态为"已启用"',
    },
    access_denied: {
      title: '用户拒绝了授权请求',
      description: '请重新点击登录按钮并完成授权',
    },
    unsupported_response_type: {
      title: '不支持的响应类型',
      description: '请检查 OAuth 配置',
    },
    invalid_scope: {
      title: '无效的权限范围',
      description: '请检查 scope 参数配置',
    },
  };

  const errorInfo = errorMessages[error] || {
    title: 'OAuth 错误',
    description: error,
  };

  return {
    success: false,
    error: `${errorInfo.title}: ${errorInfo.description}`,
  };
}

/**
 * 从用户信息中提取 Linux.do 用户 ID
 */
function extractLinuxDoUserId(userInfo: any): string | null {
  if (userInfo?.id) return String(userInfo.id);
  if (userInfo?.user_id) return String(userInfo.user_id);
  return null;
}

/**
 * 从用户信息中提取头像 URL
 */
function extractAvatarUrl(userInfo: any): string | undefined {
  return (
    userInfo?.avatar_url ||
    userInfo?.avatar ||
    userInfo?.logo ||
    userInfo?.picture ||
    userInfo?.avatarUrl ||
    userInfo?.profile_image_url ||
    userInfo?.profile_picture ||
    userInfo?.image ||
    userInfo?.photo ||
    userInfo?.thumbnail ||
    undefined
  );
}

/**
 * 更新已登录 Supabase 用户的 profile
 */
async function updateSupabaseUserProfile(
  userId: string,
  linuxdoUserId: string,
  userInfo: any,
  avatarUrl: string | undefined,
  tokenData: { access_token: string; expires_in?: number }
): Promise<Profile | null> {
  try {
    const profileUpdates: Partial<Profile> = {
      linuxdo_user_id: linuxdoUserId,
      linuxdo_username: userInfo.username || userInfo.name || undefined,
      linuxdo_avatar_url: avatarUrl,
      linuxdo_access_token: tokenData.access_token,
      linuxdo_token_expires_at: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : undefined,
      linuxdo_user_data: userInfo,
    };

    // 移除 undefined 值
    Object.keys(profileUpdates).forEach(key => {
      if (profileUpdates[key as keyof typeof profileUpdates] === undefined) {
        delete profileUpdates[key as keyof typeof profileUpdates];
      }
    });

    await authService.updateProfile(userId, profileUpdates);
    const profile = await authService.getProfile(userId);
    
    console.log('[Linux.do Callback] 已更新 Supabase 用户的 Linux.do 信息');
    return profile;
  } catch (error) {
    console.error('[Linux.do Callback] 更新 Supabase 用户 profile 失败:', error);
    return null;
  }
}

/**
 * 查找或创建独立的 Linux.do profile
 */
async function findOrCreateLinuxDoProfile(
  linuxdoUserId: string,
  userInfo: any,
  avatarUrl: string | undefined,
  tokenData: { access_token: string; expires_in?: number }
): Promise<Profile | null> {
  try {
    // 查找或创建 profile
    let profile = await authService.findOrCreateProfileByLinuxDoId(linuxdoUserId, {
      ...userInfo,
      access_token: tokenData.access_token,
      token_expires_at: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : undefined,
    });

    if (profile) {
      // 更新 token 信息
      const profileUpdates: Partial<Profile> = {
        linuxdo_access_token: tokenData.access_token,
        linuxdo_token_expires_at: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
          : undefined,
      };

      await authService.updateProfile(profile.id, profileUpdates);
      console.log('[Linux.do Callback] 已更新 Linux.do profile 的 token 信息');
      
      return await authService.getProfile(profile.id);
    }

    // 如果创建失败，保存到 localStorage
    saveToLocalStorage(linuxdoUserId, userInfo, avatarUrl, tokenData);
    return null;
  } catch (error) {
    console.error('[Linux.do Callback] 处理 Linux.do profile 失败:', error);
    // 失败时保存到 localStorage
    saveToLocalStorage(linuxdoUserId, userInfo, avatarUrl, tokenData);
    return null;
  }
}

/**
 * 保存到 localStorage（作为备用方案）
 */
function saveToLocalStorage(
  linuxdoUserId: string,
  userInfo: any,
  avatarUrl: string | undefined,
  tokenData: { access_token: string; expires_in?: number }
): void {
  const linuxDoData = {
    user_id: linuxdoUserId,
    username: userInfo.username || userInfo.name,
    avatar_url: avatarUrl,
    access_token: tokenData.access_token,
    token_expires_at: tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : undefined,
    user_data: userInfo,
  };
  
  localStorage.setItem('linuxdo_oauth_data', JSON.stringify(linuxDoData));
  console.log('[Linux.do Callback] 已保存到 localStorage（等待后续迁移）');
}

