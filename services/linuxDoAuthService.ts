/**
 * Linux.do OAuth Service
 * Handles OAuth 2.0 authentication with Linux.do
 */

import { supabase } from './authService';

const LINUXDO_AUTHORIZE_URL = 'https://connect.linux.do/oauth2/authorize';
const LINUXDO_TOKEN_URL = 'https://connect.linux.do/oauth2/token';
const LINUXDO_USER_INFO_URL = 'https://connect.linux.do/api/user';

// Cache for client ID and secret
let cachedConfig: { clientId: string; clientSecret?: string } | null = null;

/**
 * Get Linux.do OAuth configuration from Supabase database
 * Supports multiple storage locations:
 * 1. A 'oauth_config' table with 'provider' and 'key' columns
 * 2. A 'app_config' table with 'key' and 'value' columns
 * 3. Environment variable as fallback
 */
async function getLinuxDoConfig(): Promise<{ clientId: string; clientSecret?: string } | null> {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig;
  }

  // Try to get from environment variable first (for backward compatibility)
  const envClientId = import.meta.env.VITE_LINUXDO_CLIENT_ID;
  if (envClientId) {
    cachedConfig = { clientId: envClientId };
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
    throw new Error('Linux.do Client ID not configured. Please set it in Supabase database (oauth_config or app_config table) or set VITE_LINUXDO_CLIENT_ID environment variable.');
  }

  // Ensure redirect_uri is properly encoded and matches exactly what's registered
  // Remove trailing slash if present, as OAuth providers are strict about URI matching
  const normalizedRedirectUri = redirectUri.replace(/\/$/, '');

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
  
  // Debug logging (remove in production)
  console.log('Linux.do OAuth URL:', {
    clientId: clientId.substring(0, 8) + '...', // Only log partial client ID
    redirectUri: normalizedRedirectUri,
    scope: 'read',
    hasState: !!state,
    hasCodeChallenge: !!codeChallenge,
    fullUrl: authUrl
  });

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
    throw new Error('Code verifier not found. Please restart the authorization flow.');
  }

  // Build request body
  const bodyParams: Record<string, string> = {
    grant_type: 'authorization_code',
    client_id: clientId,
    code: code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  };

  // Add client_secret if available (some OAuth implementations require it)
  if (clientSecret) {
    bodyParams.client_secret = clientSecret;
  }

  const response = await fetch(LINUXDO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(bodyParams),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
  }

  // Clear stored values
  sessionStorage.removeItem('linuxdo_code_verifier');
  sessionStorage.removeItem('linuxdo_state');

  return await response.json();
}

/**
 * Get user information from Linux.do API
 */
export async function getLinuxDoUserInfo(accessToken: string): Promise<any> {
  const response = await fetch(LINUXDO_USER_INFO_URL, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch user info: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

/**
 * Verify state parameter to prevent CSRF attacks
 */
export function verifyState(state: string): boolean {
  const storedState = sessionStorage.getItem('linuxdo_state');
  if (!storedState) {
    return false;
  }
  
  const isValid = storedState === state;
  if (isValid) {
    sessionStorage.removeItem('linuxdo_state');
  }
  
  return isValid;
}

