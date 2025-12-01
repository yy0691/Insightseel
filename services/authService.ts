import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not configured. Auth features will be disabled.');
}

export const supabase: SupabaseClient | null = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export interface Profile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  // Optional reference to Supabase auth.users (NULL for Linux.do-only profiles)
  auth_user_id?: string;
  // Flag to indicate if this is a Linux.do-only profile (no Supabase auth account)
  is_linuxdo_only?: boolean;
  // Linux.do OAuth fields
  linuxdo_user_id?: string;
  linuxdo_username?: string;
  linuxdo_avatar_url?: string; // Linux.do user avatar/logo URL
  linuxdo_access_token?: string;
  linuxdo_token_expires_at?: string;
  linuxdo_user_data?: any; // JSON data from Linux.do API
}

export const authService = {
  isAvailable(): boolean {
    return supabase !== null;
  },

  async signUpWithEmail(email: string, password: string, fullName?: string) {
    if (!supabase) throw new Error('Supabase not configured');

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) throw error;
    return data;
  },

  async signInWithEmail(email: string, password: string) {
    if (!supabase) throw new Error('Supabase not configured');

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return data;
  },

  async signInWithGoogle() {
    if (!supabase) throw new Error('Supabase not configured');

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) throw error;
    return data;
  },

  async signInWithGithub() {
    if (!supabase) throw new Error('Supabase not configured');

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) throw error;
    return data;
  },

  async signOut() {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getCurrentUser(): Promise<User | null> {
    if (!supabase) return null;

    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  /**
   * Sync avatar from OAuth provider (Google/GitHub) to profile
   * Extracts avatar URL from user metadata and updates profile if needed
   */
  async syncAvatarFromProvider(user: User): Promise<void> {
    if (!supabase || !user) return;

    try {
      // Get current profile
      const currentProfile = await this.getProfile(user.id);
      
      // If profile already has avatar, skip
      if (currentProfile?.avatar_url) {
        return;
      }

      // Extract avatar from user metadata (OAuth providers store it here)
      // Google: user_metadata.avatar_url or user_metadata.picture
      // GitHub: user_metadata.avatar_url
      const avatarUrl = user.user_metadata?.avatar_url || 
                       user.user_metadata?.picture ||
                       user.user_metadata?.avatar ||
                       undefined;

      if (avatarUrl) {
        // Update profile with avatar
        await this.updateProfile(user.id, { avatar_url: avatarUrl });
        console.log('Avatar synced from OAuth provider:', avatarUrl);
      }
    } catch (error) {
      console.error('Error syncing avatar from provider:', error);
      // Don't throw, this is a non-critical operation
    }
  },

  async getSession(): Promise<Session | null> {
    if (!supabase) return null;

    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  async getProfile(userId: string): Promise<Profile | null> {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }

    return data;
  },

  async updateProfile(userId: string, updates: Partial<Profile>) {
    if (!supabase) throw new Error('Supabase not configured');

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Find or create profile by Linux.do user ID
   * 优化版本：使用优化后的 SQL 函数，自动处理创建和更新
   */
  async findOrCreateProfileByLinuxDoId(linuxdoUserId: string, linuxdoUserInfo: any): Promise<Profile | null> {
    if (!supabase) return null;

    try {
      // 提取用户信息
      const extractAvatarUrl = (info: any): string | undefined => {
        return info?.avatar_url || info?.avatar || info?.logo || info?.picture || undefined;
      };

      const email = linuxdoUserInfo?.email || `linuxdo_${linuxdoUserId}@linux.do`;
      const username = linuxdoUserInfo?.username || linuxdoUserInfo?.name || `Linux.do User ${linuxdoUserId}`;
      const avatarUrl = extractAvatarUrl(linuxdoUserInfo);

      // 使用优化后的 RPC 函数（自动处理创建和更新）
      const { data: profile, error: rpcError } = await supabase
        .rpc('create_linuxdo_profile', {
          p_linuxdo_user_id: linuxdoUserId,
          p_email: email,
          p_username: username,
          p_avatar_url: avatarUrl || null,
          p_user_data: linuxdoUserInfo || null,
        });

      if (rpcError) {
        console.error('[AuthService] 创建/更新 Linux.do profile 失败:', rpcError);
        
        // 如果 RPC 函数不存在，尝试直接查询和插入
        if (rpcError.code === '42883') { // function does not exist
          console.warn('[AuthService] RPC 函数不存在，使用直接查询方式');
          return await this._fallbackFindOrCreateProfile(linuxdoUserId, email, username, avatarUrl, linuxdoUserInfo);
        }
        
        return null;
      }

      return profile as Profile;
    } catch (error) {
      console.error('[AuthService] findOrCreateProfileByLinuxDoId 错误:', error);
      return null;
    }
  },

  /**
   * 备用方法：直接查询和插入（当 RPC 函数不可用时）
   */
  async _fallbackFindOrCreateProfile(
    linuxdoUserId: string,
    email: string,
    username: string,
    avatarUrl: string | undefined,
    userData: any
  ): Promise<Profile | null> {
    if (!supabase) return null;

    try {
      // 先查找现有 profile
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('linuxdo_user_id', linuxdoUserId)
        .maybeSingle();

      if (existingProfile) {
        // 更新现有 profile
        const updates: Partial<Profile> = {
          email,
          full_name: username,
          linuxdo_username: username,
          linuxdo_user_data: userData,
        };
        if (avatarUrl) {
          updates.avatar_url = avatarUrl;
          updates.linuxdo_avatar_url = avatarUrl;
        }

        const { data: updatedProfile } = await supabase
          .from('profiles')
          .update(updates)
          .eq('id', existingProfile.id)
          .select()
          .single();

        return updatedProfile || existingProfile;
      }

      // 创建新 profile
      const { data: newProfile } = await supabase
        .from('profiles')
        .insert({
          id: crypto.randomUUID(),
          email,
          full_name: username,
          avatar_url: avatarUrl,
          linuxdo_user_id: linuxdoUserId,
          linuxdo_username: username,
          linuxdo_avatar_url: avatarUrl,
          linuxdo_user_data: userData,
          auth_user_id: null,
          is_linuxdo_only: true,
        } as any)
        .select()
        .single();

      return newProfile;
    } catch (error) {
      console.error('[AuthService] _fallbackFindOrCreateProfile 错误:', error);
      return null;
    }
  },

  /**
   * Get profile by Linux.do user ID
   */
  async getProfileByLinuxDoId(linuxdoUserId: string): Promise<Profile | null> {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('linuxdo_user_id', linuxdoUserId)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // No profile found
      }
      console.error('Error fetching profile by Linux.do ID:', error);
      return null;
    }

    return data;
  },

  /**
   * 检查并获取 Linux.do 登录状态
   * 从 localStorage 或 profile 中恢复登录状态
   */
  async getLinuxDoLoginStatus(): Promise<Profile | null> {
    if (!supabase) return null;

    try {
      // 方法1: 从 localStorage 中获取保存的 Linux.do 数据
      const storedData = localStorage.getItem('linuxdo_oauth_data');
      if (storedData) {
        try {
          const linuxDoData = JSON.parse(storedData);
          if (linuxDoData.user_id) {
            // 根据 user_id 查找 profile
            const profile = await this.getProfileByLinuxDoId(linuxDoData.user_id);
            if (profile) {
              return profile;
            }
          }
        } catch (e) {
          console.error('[AuthService] 解析 localStorage 中的 Linux.do 数据失败:', e);
        }
      }

      // 方法2: 检查是否有有效的 Linux.do access token（从最近创建的 profile 中）
      // 这里我们尝试查找最近更新的 Linux.do-only profile
      // 注意：这个方法可能不够准确，但作为备用方案
      
      return null;
    } catch (error) {
      console.error('[AuthService] 检查 Linux.do 登录状态失败:', error);
      return null;
    }
  },

  onAuthStateChange(callback: (user: User | null) => void) {
    if (!supabase) {
      callback(null);
      return { data: { subscription: { unsubscribe: () => {} } } };
    }

    return supabase.auth.onAuthStateChange((_event, session) => {
      callback(session?.user ?? null);
    });
  },

  async resetPassword(email: string) {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) throw error;
  },

  async updatePassword(newPassword: string) {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) throw error;
  },
};
