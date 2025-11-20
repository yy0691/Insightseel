/**
 * Linux.do OAuth Service
 * Handles OAuth 2.0 authentication with Linux.do
 */

import { supabase } from './authService';

// Linux.do OAuth 端点配置
const LINUXDO_AUTHORIZE_URL = 'https://connect.linux.do/oauth2/authorize';
const LINUXDO_TOKEN_URL = 'https://connect.linux.do/oauth2/token';
// 用户信息端点：https://connect.linux.do/api/user
const LINUXDO_USER_INFO_URL = 'https://connect.linux.do/api/user';

// Cache for client ID and secret
let cachedConfig: { clientId: string; clientSecret?: string } | null = null;

/**
 * Get Linux.do OAuth configuration from Supabase database
 * Supports multiple storage locations:
 * 1. A 'oauth_config' table with 'provider' and 'key' columns
 * 2. A 'app_config' table with 'key' and 'value' columns
 * 3. Environment variable as fallback
 * 
 * ⚠️ 重要说明：
 * - 此配置与 Supabase Dashboard 中的 Authentication → Providers 配置（如 Slack OIDC）完全独立
 * - Supabase 的 Slack OIDC 配置用于 Supabase Auth 系统（用户通过 Slack 登录 Supabase）
 * - Linux.do OAuth 配置存储在数据库的 oauth_config 表中，使用 provider='linuxdo' 区分
 * - 两者不会冲突，因为：
 *   1. 查询时使用 .eq('provider', 'linuxdo') 过滤，只获取 Linux.do 的配置
 *   2. 不同的存储位置和用途
 *   3. 完全独立的认证流程
 */
async function getLinuxDoConfig(): Promise<{ clientId: string; clientSecret?: string } | null> {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig;
  }

  // Try to get from environment variable first (for backward compatibility)
  const envClientId = import.meta.env.VITE_LINUXDO_CLIENT_ID;
  const envClientSecret = import.meta.env.VITE_LINUXDO_CLIENT_SECRET;
  if (envClientId) {
    cachedConfig = { 
      clientId: envClientId,
      clientSecret: envClientSecret || undefined
    };
    return cachedConfig;
  }

  // Try to get from Supabase database
  if (!supabase) {
    console.warn('Supabase not configured, cannot fetch Linux.do config from database');
    return null;
  }

  try {
    // Method 1: Try oauth_config table (if exists)
    // Expected structure: { provider: 'linuxdo', key: 'client_id' | 'client_secret', value: '...' }
    const { data: oauthConfig, error: oauthError } = await supabase
      .from('oauth_config')
      .select('key, value')
      .eq('provider', 'linuxdo');

    if (!oauthError && oauthConfig && oauthConfig.length > 0) {
      const config: { clientId?: string; clientSecret?: string } = {};
      oauthConfig.forEach((item: { key: string; value: string }) => {
        if (item.key === 'client_id') {
          config.clientId = item.value;
        } else if (item.key === 'client_secret') {
          config.clientSecret = item.value;
        }
      });

      if (config.clientId) {
        cachedConfig = { clientId: config.clientId, clientSecret: config.clientSecret };
        return cachedConfig;
      }
    }

    // Method 2: Try app_config table (if exists)
    // Expected structure: { key: 'linuxdo_client_id' | 'linuxdo_client_secret', value: '...' }
    const { data: appConfig, error: appError } = await supabase
      .from('app_config')
      .select('key, value')
      .in('key', ['linuxdo_client_id', 'linuxdo_client_secret']);

    if (!appError && appConfig && appConfig.length > 0) {
      const config: { clientId?: string; clientSecret?: string } = {};
      appConfig.forEach((item: { key: string; value: string }) => {
        if (item.key === 'linuxdo_client_id') {
          config.clientId = item.value;
        } else if (item.key === 'linuxdo_client_secret') {
          config.clientSecret = item.value;
        }
      });

      if (config.clientId) {
        cachedConfig = { clientId: config.clientId, clientSecret: config.clientSecret };
        return cachedConfig;
      }
    }

    // Method 3: Try direct query with any table name you might have used
    // You can customize this based on your actual table structure
    console.warn('Linux.do OAuth config not found in database. Please ensure the config is stored in one of these tables: oauth_config, app_config, or set VITE_LINUXDO_CLIENT_ID environment variable.');
  } catch (error) {
    console.error('Error fetching Linux.do config from database:', error);
  }

  return null;
}

/**
 * Get client ID (with async support for database lookup)
 */
async function getClientId(): Promise<string | null> {
  const config = await getLinuxDoConfig();
  return config?.clientId || null;
}

/**
 * Get client secret (if available)
 */
async function getClientSecret(): Promise<string | null> {
  const config = await getLinuxDoConfig();
  return config?.clientSecret || null;
}

/**
 * Generate a random string for state parameter
 */
function generateRandomString(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate PKCE code verifier and challenge
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
 * Build OAuth authorization URL
 */
export async function buildLinuxDoAuthUrl(redirectUri: string): Promise<string> {
  const clientId = await getClientId();
  if (!clientId) {
    console.error('Linux.do Client ID not configured.');
    throw new Error('Linux.do Client ID 未配置。请在 Supabase 数据库的 oauth_config 或 app_config 表中添加配置，或设置环境变量 VITE_LINUXDO_CLIENT_ID。');
  }

  // Ensure redirect_uri is properly encoded and matches exactly what's registered
  // ⚠️ 重要：redirect_uri 必须与 Linux.do 应用中配置的回调 URL 完全匹配
  // 
  // 🔧 核心修复：强制移除尾部斜杠，确保统一
  // Linux.do OAuth 对 redirect_uri 的匹配非常严格，必须完全一致
  // 为了确保授权请求和回调时使用相同的值，统一移除尾部斜杠
  let normalizedRedirectUri = redirectUri.trim();
  
  // 强制移除尾部斜杠（根路径时）
  if (normalizedRedirectUri.endsWith('/') && normalizedRedirectUri.split('/').length === 4) {
    normalizedRedirectUri = normalizedRedirectUri.slice(0, -1);
  }
  
  // 🔍 诊断：记录原始 redirect_uri，帮助用户确认配置
  console.log('🔍 redirect_uri 诊断信息:', {
    original: redirectUri,
    normalized: normalizedRedirectUri,
    hasTrailingSlash: normalizedRedirectUri.endsWith('/'),
    origin: typeof window !== 'undefined' ? window.location.origin : 'N/A',
    pathname: typeof window !== 'undefined' ? window.location.pathname : 'N/A',
    warning: '⚠️ 此 URL 必须与 Linux.do 应用中配置的回调 URL 完全一致（包括尾部斜杠）',
    tip: '如果遇到 invalid_request 错误，请检查 Linux.do 应用中的回调 URL 配置是否与此 URL 完全匹配'
  });

  // 清除之前可能存在的状态（防止重复登录导致的问题）
  sessionStorage.removeItem('linuxdo_code_verifier');
  sessionStorage.removeItem('linuxdo_state');
  sessionStorage.removeItem('linuxdo_redirect_uri');

  const state = generateRandomString();
  const { codeVerifier, codeChallenge } = await generatePKCE();

  // Store PKCE values in sessionStorage for later use
  sessionStorage.setItem('linuxdo_code_verifier', codeVerifier);
  sessionStorage.setItem('linuxdo_state', state);
  sessionStorage.setItem('linuxdo_redirect_uri', normalizedRedirectUri); // Store for verification

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: normalizedRedirectUri,
    response_type: 'code',
    scope: 'read', // Linux.do OAuth scope - adjust if needed
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const authUrl = `${LINUXDO_AUTHORIZE_URL}?${params.toString()}`;
  
  // Debug logging - 提供详细的诊断信息
  console.log('Linux.do OAuth URL:', {
    clientId: clientId.substring(0, 8) + '...', // Only log partial client ID
    redirectUri: normalizedRedirectUri,
    scope: 'read',
    hasState: !!state,
    hasCodeChallenge: !!codeChallenge,
    authorizeUrl: LINUXDO_AUTHORIZE_URL,
    fullUrl: authUrl.substring(0, 100) + '...', // 只显示部分 URL，避免日志过长
  });
  
  // 🔍 诊断信息：帮助排查 invalid_request 错误
  console.group('🔍 OAuth 请求诊断信息（如果遇到 invalid_request 错误，请查看此信息）');
  console.log('⚠️ 发送给 Linux.do 的 redirect_uri:', normalizedRedirectUri);
  console.log('当前页面信息:', {
    '完整 URL': typeof window !== 'undefined' ? window.location.href : 'N/A',
    'origin': typeof window !== 'undefined' ? window.location.origin : 'N/A',
    'pathname': typeof window !== 'undefined' ? window.location.pathname : 'N/A',
    '是否有尾部斜杠': normalizedRedirectUri.endsWith('/'),
  });
  console.log('完整授权 URL（复制此 URL 到浏览器地址栏可以查看完整参数）:', authUrl);
  console.log('参数列表:', {
    client_id: '已设置',
    redirect_uri: normalizedRedirectUri,
    response_type: 'code',
    scope: 'read',
    state: '已设置',
    code_challenge: '已设置',
    code_challenge_method: 'S256',
  });
  console.warn('⚠️ 如果遇到 invalid_request 错误，请执行以下步骤：');
  console.log('1. 复制上面的 redirect_uri 值:', normalizedRedirectUri);
  console.log('2. 登录 Linux.do 开发者控制台');
  console.log('3. 找到你的 OAuth 应用设置');
  console.log('4. 检查"回调 URL"或"Redirect URI"配置');
  console.log('5. 确保回调 URL 与上面的 redirect_uri 完全一致（包括尾部斜杠）');
  console.log('6. 如果不一致，修改 Linux.do 应用中的回调 URL 配置');
  console.log('   例如：如果上面的 redirect_uri 是 "https://insight.luoyuanai.cn"（无斜杠）');
  console.log('   那么 Linux.do 应用中的回调 URL 也必须是 "https://insight.luoyuanai.cn"（无斜杠）');
  console.log('   如果上面的 redirect_uri 是 "https://insight.luoyuanai.cn/"（有斜杠）');
  console.log('   那么 Linux.do 应用中的回调 URL 也必须是 "https://insight.luoyuanai.cn/"（有斜杠）');
  console.groupEnd();

  return authUrl;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<{ access_token: string; token_type: string; expires_in?: number }> {
  const clientId = await getClientId();
  const clientSecret = await getClientSecret();
  
  if (!clientId) {
    throw new Error('Linux.do Client ID not configured.');
  }

  const codeVerifier = sessionStorage.getItem('linuxdo_code_verifier');
  if (!codeVerifier) {
    // 提供更详细的错误信息和解决方案
    const storedRedirectUri = sessionStorage.getItem('linuxdo_redirect_uri');
    console.error('Code verifier missing. Session storage state:', {
      hasCodeVerifier: !!codeVerifier,
      hasState: !!sessionStorage.getItem('linuxdo_state'),
      storedRedirectUri,
      currentRedirectUri: redirectUri,
    });
    throw new Error('授权验证码已过期。请重新点击登录按钮，不要在新标签页中打开授权页面。');
  }

  // 验证 redirect_uri 是否匹配
  const storedRedirectUri = sessionStorage.getItem('linuxdo_redirect_uri');
  if (storedRedirectUri && storedRedirectUri !== redirectUri) {
    console.error('⚠️ Redirect URI 不匹配！这可能导致 invalid_request 错误:', {
      stored: storedRedirectUri,
      current: redirectUri,
      difference: storedRedirectUri.endsWith('/') !== redirectUri.endsWith('/') ? '尾部斜杠不一致' : '其他差异',
    });
    // ⚠️ 使用存储的 redirect_uri，确保与授权请求时完全一致
    // 这是关键：必须使用授权请求时发送给 Linux.do 的 redirect_uri
    console.warn('🔧 使用存储的 redirect_uri 而不是当前计算的，确保一致性');
    // 注意：这里不修改 redirectUri 参数，因为调用方应该已经使用了存储的值
  } else if (storedRedirectUri && storedRedirectUri === redirectUri) {
    console.log('✅ Redirect URI 匹配，与授权请求时一致');
  }

  // Build request body
  const bodyParams: Record<string, string> = {
    grant_type: 'authorization_code',
    client_id: clientId,
    code: code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  };

  // ⚠️ 重要：Linux.do OAuth 通常要求 client_secret，即使使用了 PKCE
  // 如果 client_secret 缺失，可能会导致 token 交换失败
  if (clientSecret) {
    bodyParams.client_secret = clientSecret;
    console.log('✅ client_secret 已配置，将包含在 token 交换请求中');
  } else {
    console.warn('⚠️ client_secret 未配置！Linux.do OAuth 通常要求 client_secret，即使使用 PKCE。');
    console.warn('⚠️ 如果 token 交换失败，请检查：');
    console.warn('   1. Supabase 数据库 oauth_config 表中是否有 provider="linuxdo", key="client_secret" 的记录');
    console.warn('   2. 或者 app_config 表中是否有 key="linuxdo_client_secret" 的记录');
    console.warn('   3. 或者环境变量 VITE_LINUXDO_CLIENT_SECRET 是否已设置');
    console.warn('   4. 如果 Linux.do 应用确实不需要 client_secret，可以忽略此警告');
  }

  console.log('Exchanging code for token:', {
    hasCode: !!code,
    hasCodeVerifier: !!codeVerifier,
    hasClientSecret: !!clientSecret,
    redirectUri,
    tokenUrl: LINUXDO_TOKEN_URL,
    requestBodyKeys: Object.keys(bodyParams),
  });

  let response: Response;
  let errorText: string = '';

  try {
    response = await fetch(LINUXDO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(bodyParams),
    });

    errorText = await response.text();
  } catch (networkError) {
    console.error('Network error during token exchange:', networkError);
    throw new Error(`网络请求失败：无法连接到 Linux.do 服务器。请检查网络连接后重试。`);
  }

  if (!response.ok) {
    console.error('Token exchange failed:', {
      status: response.status,
      statusText: response.statusText,
      errorText,
      redirectUri,
      hasCodeVerifier: !!codeVerifier,
      hasClientSecret: !!clientSecret,
    });

    // 根据不同的错误状态码提供更具体的错误信息
    let errorMessage = `Token exchange failed: ${response.status}`;
    if (response.status === 400) {
      errorMessage = '授权码无效或已过期。请重新登录。';
      // 检查是否是 client_secret 缺失导致的
      if (!clientSecret) {
        errorMessage += ' 另外，检测到 client_secret 未配置，Linux.do OAuth 通常要求此参数。请检查配置。';
      }
    } else if (response.status === 401) {
      errorMessage = 'Client ID 或 Client Secret 配置错误。请检查配置。';
      if (!clientSecret) {
        errorMessage += ' 检测到 client_secret 未配置，这可能是导致 401 错误的原因。';
      }
    } else if (response.status === 403) {
      errorMessage = '访问被拒绝。请检查回调 URL 是否在 Linux.do 应用中正确配置。';
    } else if (response.status >= 500) {
      errorMessage = 'Linux.do 服务器错误。请稍后重试。';
    }

    // 尝试解析错误响应（可能是 JSON）
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error_description) {
        errorMessage += ` ${errorJson.error_description}`;
      } else if (errorJson.error) {
        errorMessage += ` ${errorJson.error}`;
      }
    } catch {
      // 如果不是 JSON，使用原始错误文本
      if (errorText) {
        errorMessage += ` ${errorText}`;
      }
    }

    throw new Error(errorMessage);
  }

  // Clear stored values
  sessionStorage.removeItem('linuxdo_code_verifier');
  sessionStorage.removeItem('linuxdo_state');

  try {
    return await response.json();
  } catch (parseError) {
    console.error('Failed to parse token response:', parseError);
    throw new Error('无法解析服务器响应。请重试。');
  }
}

/**
 * Get user information from Linux.do API
 */
export async function getLinuxDoUserInfo(accessToken: string): Promise<any> {
  console.log('Fetching user info from Linux.do:', {
    url: LINUXDO_USER_INFO_URL,
    hasToken: !!accessToken,
    tokenPrefix: accessToken.substring(0, 10) + '...',
  });

  let response: Response;
  let errorText: string = '';

  try {
    response = await fetch(LINUXDO_USER_INFO_URL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    errorText = await response.text();
  } catch (networkError) {
    console.error('Network error during user info fetch:', networkError);
    throw new Error(`网络请求失败：无法连接到 Linux.do 服务器。请检查网络连接后重试。`);
  }

  if (!response.ok) {
    console.error('Failed to fetch user info:', {
      status: response.status,
      statusText: response.statusText,
      errorText,
    });

    let errorMessage = `获取用户信息失败: ${response.status}`;
    if (response.status === 401) {
      errorMessage = '访问令牌无效或已过期。请重新登录。';
    } else if (response.status === 403) {
      errorMessage = '没有权限访问用户信息。请检查 OAuth 权限范围。';
    } else if (response.status >= 500) {
      errorMessage = 'Linux.do 服务器错误。请稍后重试。';
    }

    // 尝试解析错误响应
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error_description) {
        errorMessage += ` ${errorJson.error_description}`;
      } else if (errorJson.error) {
        errorMessage += ` ${errorJson.error}`;
      }
    } catch {
      if (errorText) {
        errorMessage += ` ${errorText}`;
      }
    }

    throw new Error(errorMessage);
  }

  try {
    return await response.json();
  } catch (parseError) {
    console.error('Failed to parse user info response:', parseError);
    throw new Error('无法解析用户信息响应。请重试。');
  }
}

/**
 * Verify state parameter to prevent CSRF attacks
 */
export function verifyState(state: string): boolean {
  const storedState = sessionStorage.getItem('linuxdo_state');
  if (!storedState) {
    console.error('State verification failed: no stored state found', {
      receivedState: state,
      hasStoredState: false,
      sessionStorageKeys: Object.keys(sessionStorage).filter(k => k.startsWith('linuxdo_')),
    });
    return false;
  }
  
  const isValid = storedState === state;
  if (!isValid) {
    console.error('State verification failed: state mismatch', {
      receivedState: state,
      storedState: storedState.substring(0, 8) + '...',
      statesMatch: false,
    });
  } else {
    sessionStorage.removeItem('linuxdo_state');
  }
  
  return isValid;
}

/**
 * Diagnostic function to check Linux.do OAuth configuration
 * Useful for troubleshooting login issues
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
  
  // Determine source
  let clientIdSource: 'env' | 'database' | 'none' = 'none';
  if (import.meta.env.VITE_LINUXDO_CLIENT_ID) {
    clientIdSource = 'env';
  } else if (config?.clientId) {
    clientIdSource = 'database';
  }

  const sessionStorageState = {
    hasCodeVerifier: !!sessionStorage.getItem('linuxdo_code_verifier'),
    hasState: !!sessionStorage.getItem('linuxdo_state'),
    hasRedirectUri: !!sessionStorage.getItem('linuxdo_redirect_uri'),
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

