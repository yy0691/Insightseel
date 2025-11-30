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
  redirectUri?: string; // 重定向地址，从数据库配置读取
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
 * 重定向地址优先从数据库读取，确保与 Linux.do 应用配置一致
 */
async function getLinuxDoConfig(): Promise<OAuthConfig | null> {
  if (cachedConfig) return cachedConfig;

  // 1. 优先从环境变量读取（仅用于开发/测试）
  const envClientId = import.meta.env.VITE_LINUXDO_CLIENT_ID;
  const envClientSecret = import.meta.env.VITE_LINUXDO_CLIENT_SECRET;
  const envRedirectUri = import.meta.env.VITE_LINUXDO_REDIRECT_URI;
  if (envClientId) {
    cachedConfig = { 
      clientId: envClientId, 
      clientSecret: envClientSecret,
      redirectUri: envRedirectUri
    };
    return cachedConfig;
  }

  // 2. 从数据库读取（推荐方式）
  if (!supabase) {
    console.warn('[Linux.do] Supabase 未配置，无法从数据库读取配置');
    return null;
  }

  try {
    // 方法1: oauth_config 表（推荐）
    // 支持多种 provider 名称：linuxdo、slack、slack_oidc（因为 Linux.do 可能配置为 "Slack (OIDC)"）
    const providerNames = ['linuxdo', 'slack', 'slack_oidc'];
    let oauthConfig: Array<{ key: string; value: string }> | null = null;
    let oauthError: any = null;
    let foundProvider = '';

    // 依次尝试不同的 provider 名称
    for (const providerName of providerNames) {
      const { data, error } = await supabase
        .from('oauth_config')
        .select('key, value')
        .eq('provider', providerName);

      if (!error && data && data.length > 0) {
        oauthConfig = data;
        foundProvider = providerName;
        console.log(`[Linux.do] 从 oauth_config 表找到 provider="${providerName}" 的配置`);
        break;
      } else if (error) {
        oauthError = error;
      }
    }

    if (oauthError && !oauthConfig) {
      console.error('[Linux.do] 读取 oauth_config 表失败:', oauthError);
      console.error('[Linux.do] 错误详情:', {
        message: oauthError.message,
        details: oauthError.details,
        hint: oauthError.hint,
        code: oauthError.code,
      });
    } else if (oauthConfig && oauthConfig.length > 0) {
      console.log(`[Linux.do] 从 oauth_config 表读取到 ${oauthConfig.length} 条配置 (provider="${foundProvider}")`);
      console.log('[Linux.do] 配置项:', oauthConfig);
      const config: Partial<OAuthConfig> = {};
      oauthConfig.forEach((item: { key: string; value: string }) => {
        if (item.key === 'client_id') config.clientId = item.value;
        if (item.key === 'client_secret') config.clientSecret = item.value;
        if (item.key === 'redirect_uri') config.redirectUri = item.value;
      });
      console.log('[Linux.do] 解析后的配置:', {
        hasClientId: !!config.clientId,
        hasClientSecret: !!config.clientSecret,
        hasRedirectUri: !!config.redirectUri,
        redirectUri: config.redirectUri,
      });
      if (config.clientId) {
        cachedConfig = { 
          clientId: config.clientId, 
          clientSecret: config.clientSecret,
          redirectUri: config.redirectUri
        };
        return cachedConfig;
      } else {
        console.warn(`[Linux.do] oauth_config 表中 provider="${foundProvider}" 没有找到 client_id 配置`);
      }
    } else {
      console.warn('[Linux.do] oauth_config 表中没有找到 provider="linuxdo"、"slack" 或 "slack_oidc" 的配置');
      console.warn('[Linux.do] 请检查配置，provider 字段应该是 "linuxdo"、"slack" 或 "slack_oidc" 之一');
    }

    // 方法2: app_config 表（备选）
    const { data: appConfig, error: appError } = await supabase
      .from('app_config')
      .select('key, value')
      .in('key', ['linuxdo_client_id', 'linuxdo_client_secret', 'linuxdo_redirect_uri']);

    if (appError) {
      console.error('[Linux.do] 读取 app_config 表失败:', appError);
      console.error('[Linux.do] 错误详情:', {
        message: appError.message,
        details: appError.details,
        hint: appError.hint,
        code: appError.code,
      });
    } else {
      console.log('[Linux.do] 从 app_config 表读取到', appConfig?.length || 0, '条配置');
      if (appConfig && appConfig.length > 0) {
        console.log('[Linux.do] 配置项:', appConfig);
        const config: Partial<OAuthConfig> = {};
        appConfig.forEach((item: { key: string; value: string }) => {
          if (item.key === 'linuxdo_client_id') config.clientId = item.value;
          if (item.key === 'linuxdo_client_secret') config.clientSecret = item.value;
          if (item.key === 'linuxdo_redirect_uri') config.redirectUri = item.value;
        });
        console.log('[Linux.do] 解析后的配置:', {
          hasClientId: !!config.clientId,
          hasClientSecret: !!config.clientSecret,
          hasRedirectUri: !!config.redirectUri,
          redirectUri: config.redirectUri,
        });
        if (config.clientId) {
          cachedConfig = { 
            clientId: config.clientId, 
            clientSecret: config.clientSecret,
            redirectUri: config.redirectUri
          };
          return cachedConfig;
        } else {
          console.warn('[Linux.do] app_config 表中没有找到 linuxdo_client_id 配置');
        }
      } else {
        console.warn('[Linux.do] app_config 表中没有找到 Linux.do 相关配置');
      }
    }
  } catch (error) {
    console.error('[Linux.do] 读取配置时发生异常:', error);
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

// 已移除 buildRedirectUri 函数
// 重定向地址必须从数据库配置中读取，不允许前端动态构建

// ==================== OAuth 流程 ====================
/**
 * 构建 OAuth 授权 URL
 * 
 * ⚠️ 重要：重定向地址必须从 Supabase 数据库配置中读取，与其他服务（Google、GitHub）保持一致
 * 不允许前端动态构建，确保配置的统一性和一致性
 * 
 * @param redirectUri - 已废弃，不再使用。重定向地址必须从数据库配置中读取
 */
export async function buildLinuxDoAuthUrl(redirectUri?: string): Promise<string> {
  const config = await getLinuxDoConfig();
  
  if (!config) {
    throw new Error(
      'Linux.do 配置未找到。请检查：\n' +
      '1. 是否在 Supabase 数据库的 oauth_config 表中配置了 Linux.do 相关配置？\n' +
      '2. RLS 策略是否允许匿名用户读取？请执行 fix_oauth_config_rls_for_anonymous.sql 迁移文件\n' +
      '3. 配置格式是否正确？\n' +
      '   示例：INSERT INTO oauth_config (provider, key, value) VALUES\n' +
      '     (\'linuxdo\', \'client_id\', \'your_client_id\'),\n' +
      '     (\'linuxdo\', \'client_secret\', \'your_client_secret\'),\n' +
      '     (\'linuxdo\', \'redirect_uri\', \'你的回调地址\');\n' +
      '4. 查看浏览器控制台的详细日志，了解具体错误原因'
    );
  }
  
  if (!config.clientId) {
    throw new Error(
      'Linux.do Client ID 未配置。请在 Supabase 数据库的 oauth_config 表中添加配置：\n' +
      'INSERT INTO oauth_config (provider, key, value) VALUES (\'linuxdo\', \'client_id\', \'your_client_id\');\n' +
      '查看浏览器控制台了解详细错误信息'
    );
  }

  // 重定向地址必须从数据库配置中读取，不允许前端动态构建
  if (!config.redirectUri) {
    throw new Error(
      'Linux.do 重定向地址未配置。请在 Supabase 数据库的 oauth_config 表中添加 redirect_uri 配置：\n' +
      'INSERT INTO oauth_config (provider, key, value) VALUES (\'linuxdo\', \'redirect_uri\', \'你的回调地址\');\n' +
      '⚠️ 回调地址必须与 Linux.do 应用中配置的回调 URL 完全一致\n' +
      '查看浏览器控制台了解详细错误信息'
    );
  }

  const finalRedirectUri = normalizeRedirectUri(config.redirectUri);
  console.log('[Linux.do] 使用数据库配置的重定向地址:', finalRedirectUri);

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
  // 重定向地址必须从数据库配置中读取，不允许前端动态构建
  if (!storedRedirectUri && !redirectUri) {
    throw new Error(
      '重定向地址未找到。请确保在 Supabase 数据库中配置了 redirect_uri，并重新开始登录流程。'
    );
  }
  
  const finalRedirectUri = redirectUri 
    ? normalizeRedirectUri(redirectUri) 
    : storedRedirectUri!;

  // 构建请求体（通过后端 API 代理，避免 CORS 问题）
  const requestBody: Record<string, string> = {
    code,
    client_id: config.clientId,
    redirect_uri: finalRedirectUri,
    code_verifier: codeVerifier,
  };

  if (config.clientSecret) {
    requestBody.client_secret = config.clientSecret;
  }

  // 使用后端 API 代理发送请求（解决 CORS 问题）
  const apiUrl = `${window.location.origin}/api/linuxdo-token`;
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      const errorMessage = errorData.error_description || errorData.error || `Token 交换失败 (${response.status})`;
      throw new Error(errorMessage);
    }

    // 清除已使用的状态
    sessionStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER);
    sessionStorage.removeItem(STORAGE_KEYS.STATE);

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
        throw new Error('网络请求失败：无法连接到服务器。请检查网络连接后重试。');
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
  // 使用后端 API 代理发送请求（解决 CORS 问题）
  const apiUrl = `${window.location.origin}/api/linuxdo-userinfo`;
  
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      const errorMessage = errorData.error_description || errorData.error || `获取用户信息失败 (${response.status})`;
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
        throw new Error('网络请求失败：无法连接到服务器。请检查网络连接后重试。');
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
 * 诊断 Linux.do OAuth 配置（详细版本）
 */
export async function diagnoseLinuxDoConfig(): Promise<{
  hasClientId: boolean;
  clientIdSource: 'env' | 'database' | 'none';
  hasClientSecret: boolean;
  hasRedirectUri: boolean;
  redirectUriValue?: string;
  supabaseConfigured: boolean;
  databaseReadDetails: {
    oauthConfigTable: {
      exists: boolean;
      recordCount: number;
      error?: string;
      records?: Array<{ key: string; value: string }>;
    };
    appConfigTable: {
      exists: boolean;
      recordCount: number;
      error?: string;
      records?: Array<{ key: string; value: string }>;
    };
  };
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
  const hasRedirectUri = !!config?.redirectUri;
  
  let clientIdSource: 'env' | 'database' | 'none' = 'none';
  if (import.meta.env.VITE_LINUXDO_CLIENT_ID) {
    clientIdSource = 'env';
  } else if (config?.clientId) {
    clientIdSource = 'database';
  }

  // 详细检查数据库读取情况
  const databaseReadDetails = {
    oauthConfigTable: {
      exists: false,
      recordCount: 0,
      records: [] as Array<{ key: string; value: string }>,
      error: undefined as string | undefined,
      foundProvider: '' as string,
    },
    appConfigTable: {
      exists: false,
      recordCount: 0,
      records: [] as Array<{ key: string; value: string }>,
      error: undefined as string | undefined,
    },
  };

  if (supabase) {
    try {
      // 检查 oauth_config 表，支持多种 provider 名称
      const providerNames = ['linuxdo', 'slack', 'slack_oidc'];
      let foundProvider = '';
      let oauthConfig: Array<{ key: string; value: string }> | null = null;
      let oauthError: any = null;

      for (const providerName of providerNames) {
        const { data, error } = await supabase
          .from('oauth_config')
          .select('key, value')
          .eq('provider', providerName);
        
        if (!error && data && data.length > 0) {
          oauthConfig = data;
          foundProvider = providerName;
          break;
        } else if (error) {
          oauthError = error;
        }
      }
      
      if (oauthError && !oauthConfig) {
        databaseReadDetails.oauthConfigTable.error = `${oauthError.message} (code: ${oauthError.code})`;
        if (oauthError.code === '42P01') {
          databaseReadDetails.oauthConfigTable.error += ' - 表不存在，请先执行 create_oauth_config_table.sql';
        } else if (oauthError.code === '42501') {
          databaseReadDetails.oauthConfigTable.error += ' - 权限不足，请检查 RLS 策略，执行 fix_oauth_config_rls_for_anonymous.sql';
        }
      } else if (oauthConfig && oauthConfig.length > 0) {
        databaseReadDetails.oauthConfigTable.exists = true;
        databaseReadDetails.oauthConfigTable.recordCount = oauthConfig.length;
        databaseReadDetails.oauthConfigTable.records = oauthConfig;
        databaseReadDetails.oauthConfigTable.foundProvider = foundProvider;
      }
    } catch (error) {
      databaseReadDetails.oauthConfigTable.error = error instanceof Error ? error.message : '未知错误';
    }

    try {
      // 检查 app_config 表
      const { data: appConfig, error: appError } = await supabase
        .from('app_config')
        .select('key, value')
        .in('key', ['linuxdo_client_id', 'linuxdo_client_secret', 'linuxdo_redirect_uri']);
      
      if (appError) {
        databaseReadDetails.appConfigTable.error = `${appError.message} (code: ${appError.code})`;
        if (appError.code === '42P01') {
          databaseReadDetails.appConfigTable.error += ' - 表不存在';
        } else if (appError.code === '42501') {
          databaseReadDetails.appConfigTable.error += ' - 权限不足，请检查 RLS 策略';
        }
      } else {
        databaseReadDetails.appConfigTable.exists = true;
        databaseReadDetails.appConfigTable.recordCount = appConfig?.length || 0;
        databaseReadDetails.appConfigTable.records = appConfig || [];
      }
    } catch (error) {
      databaseReadDetails.appConfigTable.error = error instanceof Error ? error.message : '未知错误';
    }
  }

  const sessionStorageState = {
    hasCodeVerifier: !!sessionStorage.getItem(STORAGE_KEYS.CODE_VERIFIER),
    hasState: !!sessionStorage.getItem(STORAGE_KEYS.STATE),
    hasRedirectUri: !!sessionStorage.getItem(STORAGE_KEYS.REDIRECT_URI),
  };

  const recommendations: string[] = [];
  
  if (!supabase) {
    recommendations.push('❌ Supabase 客户端未初始化：检查环境变量 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY');
  } else {
    if (!hasClientId) {
      recommendations.push('❌ Client ID 未配置：在 oauth_config 表中添加 (provider=\'linuxdo\', key=\'client_id\')');
    }
    if (!hasRedirectUri) {
      recommendations.push('❌ Redirect URI 未配置：在 oauth_config 表中添加 (provider=\'linuxdo\', key=\'redirect_uri\')');
    }
    
    if (databaseReadDetails.oauthConfigTable.error) {
      if (databaseReadDetails.oauthConfigTable.error.includes('42501')) {
        recommendations.push('🔧 RLS 策略问题：执行 fix_oauth_config_rls_for_anonymous.sql 修复策略');
      } else if (databaseReadDetails.oauthConfigTable.error.includes('42P01')) {
        recommendations.push('🔧 表不存在：执行 create_oauth_config_table.sql 创建表');
      } else {
        recommendations.push(`🔧 数据库错误：${databaseReadDetails.oauthConfigTable.error}`);
      }
    }
    
    if (databaseReadDetails.oauthConfigTable.exists && databaseReadDetails.oauthConfigTable.recordCount === 0) {
      recommendations.push('⚠️ oauth_config 表中没有找到 provider=\'linuxdo\'、\'slack\' 或 \'slack_oidc\' 的配置记录');
      recommendations.push('💡 如果配置在 Supabase 中显示为 "Slack (OIDC)"，请使用 provider=\'slack\' 或 \'slack_oidc\'');
      recommendations.push('💡 执行以下 SQL 添加配置：');
      recommendations.push('   INSERT INTO oauth_config (provider, key, value) VALUES');
      recommendations.push('     (\'slack\', \'client_id\', \'你的client_id\'),  -- 或使用 \'linuxdo\'、\'slack_oidc\'');
      recommendations.push('     (\'slack\', \'client_secret\', \'你的client_secret\'),');
      recommendations.push('     (\'slack\', \'redirect_uri\', \'你的回调地址\');');
    } else if (databaseReadDetails.oauthConfigTable.foundProvider) {
      recommendations.push(`✅ 找到配置，provider="${databaseReadDetails.oauthConfigTable.foundProvider}"`);
    }
  }

  if (sessionStorageState.hasCodeVerifier || sessionStorageState.hasState) {
    recommendations.push('⚠️ 检测到未完成的登录流程：清除浏览器 sessionStorage 后重试');
  }

  return {
    hasClientId,
    clientIdSource,
    hasClientSecret,
    hasRedirectUri,
    redirectUriValue: config?.redirectUri,
    supabaseConfigured: !!supabase,
    databaseReadDetails,
    sessionStorageState,
    recommendations,
  };
}
