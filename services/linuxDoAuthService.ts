/**
 * Linux.do OAuth Service
 * 重写版本：更清晰、模块化的 OAuth 2.0 认证服务
 */

import { supabase } from './authService';

// ==================== 常量配置 ====================
const LINUXDO_AUTHORIZE_URL = 'https://connect.linux.do/oauth2/authorize';
const LINUXDO_TOKEN_URL = 'https://connect.linux.do/oauth2/token';
const LINUXDO_USER_INFO_URL = 'https://connect.linux.do/api/user';
const OAUTH_SCOPE = 'read';

// SessionStorage 键名
const STORAGE_KEYS = {
  CODE_VERIFIER: 'linuxdo_code_verifier',
  STATE: 'linuxdo_state',
  REDIRECT_URI: 'linuxdo_redirect_uri',
} as const;

// ==================== 类型定义 ====================
interface OAuthConfig {
  clientId: string;
  clientSecret?: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

interface UserInfo {
  id?: string | number;
  user_id?: string | number;
  username?: string;
  name?: string;
  email?: string;
  avatar_url?: string;
  avatar?: string;
  logo?: string;
  picture?: string;
  [key: string]: any;
}

// ==================== 配置管理 ====================
let cachedConfig: OAuthConfig | null = null;

/**
 * 获取 Linux.do OAuth 配置
 * 优先级：环境变量 > oauth_config 表 > app_config 表
 */
async function getLinuxDoConfig(): Promise<OAuthConfig | null> {
  if (cachedConfig) return cachedConfig;

  // 1. 优先从环境变量读取
  const envClientId = import.meta.env.VITE_LINUXDO_CLIENT_ID;
  const envClientSecret = import.meta.env.VITE_LINUXDO_CLIENT_SECRET;
  if (envClientId) {
    cachedConfig = { clientId: envClientId, clientSecret: envClientSecret };
    return cachedConfig;
  }

  // 2. 从数据库读取
  if (!supabase) {
    console.warn('[Linux.do] Supabase 未配置，无法从数据库读取配置');
    return null;
  }

  try {
    // 方法1: oauth_config 表
    const { data: oauthConfig } = await supabase
      .from('oauth_config')
      .select('key, value')
      .eq('provider', 'linuxdo');

    if (oauthConfig && oauthConfig.length > 0) {
      const config: Partial<OAuthConfig> = {};
      oauthConfig.forEach((item: { key: string; value: string }) => {
        if (item.key === 'client_id') config.clientId = item.value;
        if (item.key === 'client_secret') config.clientSecret = item.value;
      });
      if (config.clientId) {
        cachedConfig = { clientId: config.clientId, clientSecret: config.clientSecret };
        return cachedConfig;
      }
    }

    // 方法2: app_config 表
    const { data: appConfig } = await supabase
      .from('app_config')
      .select('key, value')
      .in('key', ['linuxdo_client_id', 'linuxdo_client_secret']);

    if (appConfig && appConfig.length > 0) {
      const config: Partial<OAuthConfig> = {};
      appConfig.forEach((item: { key: string; value: string }) => {
        if (item.key === 'linuxdo_client_id') config.clientId = item.value;
        if (item.key === 'linuxdo_client_secret') config.clientSecret = item.value;
      });
      if (config.clientId) {
        cachedConfig = { clientId: config.clientId, clientSecret: config.clientSecret };
        return cachedConfig;
      }
    }
  } catch (error) {
    console.error('[Linux.do] 读取配置失败:', error);
  }

  return null;
}

/**
 * 清除配置缓存（用于测试或重新加载配置）
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

// ==================== 工具函数 ====================
/**
 * 生成随机字符串（用于 state 和 code_verifier）
 */
function generateRandomString(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * 生成 PKCE code verifier 和 challenge
 */
async function generatePKCE(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  const codeVerifier = generateRandomString(64);
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return { codeVerifier, codeChallenge };
}

/**
 * 规范化 redirect_uri（移除尾部斜杠，确保一致性）
 */
function normalizeRedirectUri(uri: string): string {
  let normalized = uri.trim();
  // 根路径时移除尾部斜杠
  if (normalized.endsWith('/') && normalized.split('/').length === 4) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * 自动构建 redirect_uri（从 window.location）
 */
function buildRedirectUri(): string {
  if (typeof window === 'undefined') {
    throw new Error('无法构建 redirect_uri：请在浏览器环境中调用');
  }
  return normalizeRedirectUri(`${window.location.origin}${window.location.pathname}`);
}

// ==================== OAuth 流程 ====================
/**
 * 构建 OAuth 授权 URL
 * @param redirectUri - 可选，未提供时自动从 window.location 构建
 */
export async function buildLinuxDoAuthUrl(redirectUri?: string): Promise<string> {
  const config = await getLinuxDoConfig();
  if (!config?.clientId) {
    throw new Error('Linux.do Client ID 未配置。请在 Supabase 数据库的 oauth_config 或 app_config 表中添加配置，或设置环境变量 VITE_LINUXDO_CLIENT_ID。');
  }

  // 自动构建 redirect_uri（如果未提供）
  const finalRedirectUri = redirectUri ? normalizeRedirectUri(redirectUri) : buildRedirectUri();

  // 清除之前的 OAuth 状态
  Object.values(STORAGE_KEYS).forEach(key => sessionStorage.removeItem(key));

  // 生成 PKCE 和 state
  const state = generateRandomString();
  const { codeVerifier, codeChallenge } = await generatePKCE();

  // 存储到 sessionStorage
  sessionStorage.setItem(STORAGE_KEYS.CODE_VERIFIER, codeVerifier);
  sessionStorage.setItem(STORAGE_KEYS.STATE, state);
  sessionStorage.setItem(STORAGE_KEYS.REDIRECT_URI, finalRedirectUri);

  // 构建授权 URL
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: finalRedirectUri,
    response_type: 'code',
    scope: OAUTH_SCOPE,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `${LINUXDO_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * 交换授权码获取访问令牌
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri?: string
): Promise<TokenResponse> {
  const config = await getLinuxDoConfig();
  if (!config?.clientId) {
    throw new Error('Linux.do Client ID 未配置');
  }

  // 获取存储的 code_verifier 和 redirect_uri
  const codeVerifier = sessionStorage.getItem(STORAGE_KEYS.CODE_VERIFIER);
  const storedRedirectUri = sessionStorage.getItem(STORAGE_KEYS.REDIRECT_URI);

  if (!codeVerifier) {
    throw new Error('授权验证码已过期。请重新点击登录按钮，不要在新标签页中打开授权页面。');
  }

  // 使用存储的 redirect_uri 或提供的 redirect_uri
  const finalRedirectUri = redirectUri 
    ? normalizeRedirectUri(redirectUri) 
    : storedRedirectUri || buildRedirectUri();

  // 构建请求体
  const bodyParams: Record<string, string> = {
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code,
    redirect_uri: finalRedirectUri,
    code_verifier: codeVerifier,
  };

  if (config.clientSecret) {
    bodyParams.client_secret = config.clientSecret;
  }

  // 发送请求
  try {
    const response = await fetch(LINUXDO_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(bodyParams),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token 交换失败 (${response.status}): ${errorText}`);
    }

    // 清除已使用的状态
    sessionStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER);
    sessionStorage.removeItem(STORAGE_KEYS.STATE);

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('fetch')) {
        throw new Error('网络请求失败：无法连接到 Linux.do 服务器。请检查网络连接后重试。');
      }
      throw error;
    }
    throw new Error('Token 交换失败：未知错误');
  }
}

/**
 * 获取 Linux.do 用户信息
 */
export async function getLinuxDoUserInfo(accessToken: string): Promise<UserInfo> {
  try {
    const response = await fetch(LINUXDO_USER_INFO_URL, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`获取用户信息失败 (${response.status}): ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('fetch')) {
        throw new Error('网络请求失败：无法连接到 Linux.do 服务器。请检查网络连接后重试。');
      }
      throw error;
    }
    throw new Error('获取用户信息失败：未知错误');
  }
}

/**
 * 验证 state 参数（防止 CSRF 攻击）
 */
export function verifyState(state: string): boolean {
  const storedState = sessionStorage.getItem(STORAGE_KEYS.STATE);
  if (!storedState) {
    console.error('[Linux.do] State 验证失败：未找到存储的 state');
    return false;
  }

  const isValid = storedState === state;
  if (isValid) {
    sessionStorage.removeItem(STORAGE_KEYS.STATE);
  } else {
    console.error('[Linux.do] State 验证失败：state 不匹配');
  }

  return isValid;
}

/**
 * 获取存储的 redirect_uri（用于回调处理）
 */
export function getStoredRedirectUri(): string | null {
  return sessionStorage.getItem(STORAGE_KEYS.REDIRECT_URI);
}

/**
 * 清除所有 OAuth 相关状态
 */
export function clearOAuthState(): void {
  Object.values(STORAGE_KEYS).forEach(key => sessionStorage.removeItem(key));
}

// ==================== 诊断工具 ====================
/**
 * 诊断 Linux.do OAuth 配置
 */
export async function diagnoseLinuxDoConfig(): Promise<{
  hasClientId: boolean;
  clientIdSource: 'env' | 'database' | 'none';
  hasClientSecret: boolean;
  supabaseConfigured: boolean;
  sessionStorageState: {
    hasCodeVerifier: boolean;
    hasState: boolean;
    hasRedirectUri: boolean;
  };
  recommendations: string[];
}> {
  const config = await getLinuxDoConfig();
  const hasClientId = !!config?.clientId;
  const hasClientSecret = !!config?.clientSecret;

  let clientIdSource: 'env' | 'database' | 'none' = 'none';
  if (import.meta.env.VITE_LINUXDO_CLIENT_ID) {
    clientIdSource = 'env';
  } else if (config?.clientId) {
    clientIdSource = 'database';
  }

  const sessionStorageState = {
    hasCodeVerifier: !!sessionStorage.getItem(STORAGE_KEYS.CODE_VERIFIER),
    hasState: !!sessionStorage.getItem(STORAGE_KEYS.STATE),
    hasRedirectUri: !!sessionStorage.getItem(STORAGE_KEYS.REDIRECT_URI),
  };

  const recommendations: string[] = [];
  if (!hasClientId) {
    recommendations.push('配置 Linux.do Client ID：在 Supabase 数据库的 oauth_config 或 app_config 表中添加配置，或设置环境变量 VITE_LINUXDO_CLIENT_ID');
  }
  if (!supabase) {
    recommendations.push('配置 Supabase：确保 Supabase 客户端已正确初始化');
  }
  if (sessionStorageState.hasCodeVerifier || sessionStorageState.hasState) {
    recommendations.push('检测到未完成的登录流程：请清除浏览器 sessionStorage 或重新开始登录流程');
  }

  return {
    hasClientId,
    clientIdSource,
    hasClientSecret,
    supabaseConfigured: !!supabase,
    sessionStorageState,
    recommendations,
  };
}
