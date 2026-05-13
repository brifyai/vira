import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../core/config';

export interface AudioQuotaSummary {
    user_id: string;
    role: string;
    manager_id: string | null;
    quota_total_minutes: number;
    team_assigned_minutes: number;
    team_used_minutes: number;
    personal_quota_minutes: number;
    used_minutes: number;
    remaining_minutes: number;
    available_to_assign_minutes: number;
    unlimited: boolean;
    can_generate: boolean;
}

export interface GeneratedBroadcastWithQuotaResult {
    generated_broadcast: any;
    quota_summary?: any;
    charged_minutes: number;
    charged_now: boolean;
    already_charged: boolean;
}

export interface AudioQuotaAdjustmentEvent {
    id: string;
    target_user_id: string;
    actor_user_id: string | null;
    mode: 'set' | 'delta';
    delta_minutes: number;
    previous_quota_minutes: number;
    new_quota_minutes: number;
    created_at: string;
    actor?: { id: string; full_name: string | null; email: string | null } | null;
}

@Injectable({
    providedIn: 'root'
})
export class SupabaseService {
    private supabase: SupabaseClient;

    constructor() {
        this.supabase = createClient(
            config.supabaseUrl,
            config.supabaseAnonKey
        );
    }

    // Get the Supabase client instance
    getClient(): SupabaseClient {
        return this.supabase;
    }

    private getApiBaseUrl(): string {
        return String(config.apiUrl || '').replace(/\/+$/, '');
    }

    /**
     * Executes a promise with automatic retry logic and timeout protection.
     * This ensures the application recovers from temporary network glitches or tab suspensions
     * without showing errors to the user.
     */
    async safeFetch<T>(
        operation: () => Promise<T>,
        retries: number = 2,
        timeoutMs: number = 15000
    ): Promise<T | null> {
        for (let i = 0; i <= retries; i++) {
            try {
                // Create a timeout promise
                let timeoutHandle: any;
                const timeoutPromise = new Promise<T>((_, reject) => {
                    timeoutHandle = setTimeout(() => reject(new Error('Timeout')), timeoutMs);
                });

                // Race the operation against the timeout
                const result = await Promise.race([
                    operation().then(res => {
                        clearTimeout(timeoutHandle);
                        return res;
                    }).catch(err => {
                        clearTimeout(timeoutHandle);
                        throw err;
                    }),
                    timeoutPromise
                ]);

                return result;
            } catch (error) {
                // If it's the last attempt, return null (fail silently) or rethrow if critical
                // User requested "no errors", so we prefer returning null/empty for UI to handle gracefully
                if (i === retries) {
                    console.warn(`Operation failed after ${retries + 1} attempts`, error);
                    return null;
                }
                // Wait a bit before retrying (exponential backoff: 500ms, 1000ms, etc.)
                await new Promise(r => setTimeout(r, 500 * (i + 1)));
            }
        }
        return null;
    }

    // ============================================
    // USERS METHODS
    // ============================================

    async getCurrentUser() {
        const { data: { user } } = await this.supabase.auth.getUser();
        return user;
    }

    async getCurrentSession() {
        const { data: { session } } = await this.supabase.auth.getSession();
        return session;
    }

    async getUserProfile(userId: string) {
        try {
            const data = await this.safeFetch(async () => {
                const { data, error } = await this.supabase
                    .from('users')
                    .select('*')
                    .eq('id', userId)
                    .single();
                
                if (error) throw error;
                return data;
            }, 2, 10000); // Retry twice, 10s timeout each
            
            return data;
        } catch (error) {
             console.warn('Error fetching user profile:', error);
             return null;
        }
    }

    async getUsers() {
        const { data, error } = await this.supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    }

    async getUserProfilesByIds(userIds: string[]) {
        const ids = Array.isArray(userIds) ? userIds.filter(Boolean) : [];
        if (ids.length === 0) return [];

        const { data, error } = await this.supabase
            .from('users')
            .select('id, full_name, email, role, can_upload_music, can_use_ad_block, can_download_broadcast')
            .in('id', ids);

        if (error) throw error;
        return data || [];
    }

    async updateUserRole(userId: string, role: string) {
        const { data, error } = await this.supabase
            .from('users')
            .update({ role })
            .eq('id', userId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async getAudioQuotaSummary(userId?: string): Promise<AudioQuotaSummary | null> {
        const tryRpc = async (fn: string) => {
            const { data, error } = await this.supabase.rpc(fn, { p_user_id: userId || null });
            return { data, error };
        };

        const v2 = await tryRpc('get_audio_quota_summary_v2_rpc');
        if (!v2.error) {
            const row = Array.isArray(v2.data) ? v2.data[0] : v2.data;
            if (!row) return null;
            return {
                user_id: row.user_id,
                role: row.role,
                manager_id: row.manager_id ?? null,
                quota_total_minutes: Number(row.quota_total_minutes || 0),
                team_assigned_minutes: Number(row.team_assigned_minutes || 0),
                team_used_minutes: Number(row.team_used_minutes || 0),
                personal_quota_minutes: Number(row.personal_quota_minutes || 0),
                used_minutes: Number(row.used_minutes || 0),
                remaining_minutes: Number(row.remaining_minutes || 0),
                available_to_assign_minutes: Number(row.available_to_assign_minutes || 0),
                unlimited: !!row.unlimited,
                can_generate: !!row.can_generate
            };
        }

        const msg = String((v2.error as any)?.message || '');
        const code = String((v2.error as any)?.code || '');
        const canFallback = code === 'PGRST202' || /could not find the function|get_audio_quota_summary_v2_rpc/i.test(msg);
        if (!canFallback) throw v2.error;

        const v1 = await tryRpc('get_audio_quota_summary_rpc');
        if (v1.error) throw v1.error;

        const row = Array.isArray(v1.data) ? v1.data[0] : v1.data;
        if (!row) return null;

        return {
            user_id: row.user_id,
            role: row.role,
            manager_id: row.manager_id ?? null,
            quota_total_minutes: Number(row.quota_total_minutes || 0),
            team_assigned_minutes: Number(row.team_assigned_minutes || 0),
            team_used_minutes: 0,
            personal_quota_minutes: Number(row.personal_quota_minutes || 0),
            used_minutes: Number(row.used_minutes || 0),
            remaining_minutes: Number(row.remaining_minutes || 0),
            available_to_assign_minutes: Number(row.available_to_assign_minutes || 0),
            unlimited: !!row.unlimited,
            can_generate: !!row.can_generate
        };
    }

    async setUserAudioQuota(userId: string, quotaMinutes: number) {
        const { data, error } = await this.supabase.rpc('set_user_audio_quota_rpc', {
            p_user_id: userId,
            p_quota_minutes: Math.max(0, Math.round(Number(quotaMinutes || 0)))
        });

        if (error) throw error;
        return data;
    }

    async adjustUserAudioQuota(userId: string, deltaMinutes: number) {
        const { data, error } = await this.supabase.rpc('adjust_user_audio_quota_rpc', {
            p_user_id: userId,
            p_delta_minutes: Math.round(Number(deltaMinutes || 0))
        });

        if (error) throw error;
        return data;
    }

    async getAudioQuotaAdjustmentEvents(options: { userId: string; limit?: number }) {
        const limit = Math.max(1, Math.min(200, Number(options?.limit || 50)));
        const { data, error } = await this.supabase
            .from('audio_quota_adjustment_events')
            .select('id, target_user_id, actor_user_id, mode, delta_minutes, previous_quota_minutes, new_quota_minutes, created_at, actor:actor_user_id(id, full_name, email)')
            .eq('target_user_id', options.userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return (data || []) as AudioQuotaAdjustmentEvent[];
    }

    async createUser(user: { email: string; password: string; role: string; fullName?: string }) {
        const { data, error } = await this.supabase.rpc('create_user_rpc', {
            email: user.email,
            password: user.password,
            role_name: user.role,
            full_name: user.fullName || ''
        });

        if (error) throw error;
        return data;
    }

    async createTeamUser(user: { email: string; password: string; fullName?: string }) {
        const { data, error } = await this.supabase.rpc('create_team_user_rpc', {
            email: user.email,
            password: user.password,
            full_name: user.fullName || ''
        });

        if (error) throw error;
        return data;
    }

    async setTeamUserPermissions(payload: {
        userId: string;
        canUploadMusic: boolean;
        canUseAdBlock: boolean;
        canDownloadBroadcast: boolean;
    }) {
        const { error } = await this.supabase.rpc('set_team_user_permissions', {
            p_user_id: payload.userId,
            p_can_upload_music: payload.canUploadMusic,
            p_can_use_ad_block: payload.canUseAdBlock,
            p_can_download_broadcast: payload.canDownloadBroadcast
        });
        if (error) throw error;
        return true;
    }

    async sendWelcomeEmail(payload: {
        recipientEmail: string;
        recipientName?: string;
        profileType: 'admin' | 'user' | 'team_user';
        createdByRole?: string;
        createdByName?: string;
    }) {
        const apiBaseUrl = this.getApiBaseUrl();

        if (!apiBaseUrl) {
            return {
                success: false,
                configured: false,
                error: 'API_URL no esta configurado.'
            };
        }

        const response = await fetch(`${apiBaseUrl}/api/mail/send-welcome`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            return {
                success: false,
                configured: data?.configured ?? false,
                error: data?.error || 'No se pudo enviar el correo de bienvenida.'
            };
        }

        return data;
    }

    generateSecurePassword(length: number = 24): string {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
        const cryptoObject = globalThis.crypto;
        const values = new Uint32Array(length);

        if (cryptoObject?.getRandomValues) {
            cryptoObject.getRandomValues(values);
        } else {
            for (let i = 0; i < length; i += 1) {
                values[i] = Math.floor(Math.random() * chars.length);
            }
        }

        let password = 'Tmp1!';
        for (let i = 0; i < length; i += 1) {
            password += chars[values[i] % chars.length];
        }

        return password;
    }

    async requestPasswordReset(email: string) {
        const apiBaseUrl = this.getApiBaseUrl();
        if (!apiBaseUrl) {
            throw new Error('API_URL no esta configurado.');
        }

        const response = await fetch(`${apiBaseUrl}/api/auth/forgot-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data?.error || 'No se pudo iniciar la recuperacion de contrasena.');
        }

        return data;
    }

    async resetPassword(token: string, newPassword: string) {
        const apiBaseUrl = this.getApiBaseUrl();
        if (!apiBaseUrl) {
            throw new Error('API_URL no esta configurado.');
        }

        const response = await fetch(`${apiBaseUrl}/api/auth/reset-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token, newPassword })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data?.error || 'No se pudo restablecer la contrasena.');
        }

        return data;
    }

    async updateCurrentUserPassword(newPassword: string) {
        const { data, error } = await this.supabase.auth.updateUser({
            password: newPassword
        });

        if (error) throw error;
        return data.user;
    }

    async getTeamMembersWithUsage(adminId?: string) {
        const args: any = {};
        if (adminId) args.p_admin_id = adminId;

        const { data, error } = await this.supabase.rpc('get_team_members_with_usage_rpc', args);

        if (error) throw error;
        return data;
    }

    async deleteTeamUser(userId: string, behavior: 'transfer' | 'delete') {
        const { data, error } = await this.supabase.rpc('delete_team_user_rpc', {
            p_user_id: userId,
            p_behavior: behavior
        });

        if (error) throw error;
        return data;
    }

    // User Radios Assignment
    async getUserRadios(userId: string) {
        const { data, error } = await this.supabase
            .from('user_radios')
            .select('*, radio:radios(*)')
            .eq('user_id', userId);

        if (error) throw error;
        return data;
    }

    async assignRadioToUser(userId: string, radioId: string) {
        const user = await this.getCurrentUser();
        const { data, error } = await this.supabase
            .from('user_radios')
            .insert({ 
                user_id: userId, 
                radio_id: radioId,
                assigned_by: user?.id 
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async removeRadioFromUser(userId: string, radioId: string) {
        const { error } = await this.supabase
            .from('user_radios')
            .delete()
            .eq('user_id', userId)
            .eq('radio_id', radioId);

        if (error) throw error;
    }

    // async updateUserProfile(userId: string, updates: any) {
    //     const { data, error } = await this.supabase
    //         .from('users')
    //         .update(updates)
    //         .eq('id', userId)
    //         .select()
    //         .single();

    //     if (error) throw error;
    //     return data;
    // }

    // ============================================
    // RADIOS METHODS
    // ============================================

    async getRadios(options?: { limit?: number; offset?: number }) {
        let query = this.supabase
            .from('radios')
            .select('*')
            .order('created_at', { ascending: false });

        if (options?.limit) {
            query = query.limit(options.limit);
        }

        if (options?.offset) {
            query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
        }

        const { data, error } = await query;

        if (error) throw error;
        return data;
    }

    async getRadioById(id: string) {
        const { data, error } = await this.supabase
            .from('radios')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    }

    async createRadio(radio: any) {
        let user = await this.getCurrentUser();
        
        // Double check session if user is null
        if (!user) {
            const { data: { session } } = await this.supabase.auth.getSession();
            user = session?.user || null;
        }

        if (!user) {
            console.error('CreateRadio: User not authenticated', {
                session: await this.supabase.auth.getSession()
            });
            throw new Error('User not authenticated - Please log in again');
        }

        const { data, error } = await this.supabase
            .from('radios')
            .insert({ ...radio, created_by: user.id })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async updateRadio(id: string, updates: any) {
        const { data, error } = await this.supabase
            .from('radios')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async deleteRadio(id: string) {
        const { error } = await this.supabase
            .from('radios')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }

    // ============================================
    // NEWS SOURCES METHODS
    // ============================================

    async getNewsSources(options?: { radioId?: string; region?: string }) {
        let query = this.supabase
            .from('news_sources')
            .select('*, radio:radios(name)')
            .order('created_at', { ascending: false });

        if (options?.radioId && options.radioId !== 'all') {
            query = query.eq('radio_id', options.radioId);
        }

        if (options?.region && options.region !== 'all') {
            query = query.eq('region', options.region);
        }

        const { data, error } = await query;

        if (error) throw error;
        return data;
    }

    async getNewsSourceById(id: string) {
        const { data, error } = await this.supabase
            .from('news_sources')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    }

    async createNewsSource(source: any) {
        const { data, error } = await this.supabase
            .from('news_sources')
            .insert(source)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async createSourceImportFailure(payload: {
        import_run_id: string;
        file_name?: string | null;
        url: string;
        name?: string | null;
        radio_id?: string | null;
        region?: string | null;
        stage: string;
        error_code?: string | null;
        error_message?: string | null;
        details?: any;
    }) {
        const { data, error } = await this.supabase
            .from('source_import_failures')
            .insert(payload)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async getSourceImportFailures(options?: { limit?: number; offset?: number; runId?: string; stage?: string; search?: string }) {
        const limit = Number.isFinite(Number(options?.limit)) ? Math.max(1, Math.min(1000, Number(options?.limit))) : 200;
        const offset = Number.isFinite(Number(options?.offset)) ? Math.max(0, Number(options?.offset)) : 0;

        let query = this.supabase
            .from('source_import_failures')
            .select('*')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (options?.runId && String(options.runId).trim()) {
            query = query.eq('import_run_id', String(options.runId).trim());
        }
        if (options?.stage && options.stage !== 'all') {
            query = query.eq('stage', options.stage);
        }
        if (options?.search && String(options.search).trim()) {
            const raw = String(options.search).trim().slice(0, 120);
            const safe = raw.replace(/[%]/g, '').replace(/[,]/g, ' ');
            const pat = `%${safe}%`;
            query = query.or(`url.ilike.${pat},name.ilike.${pat},error_message.ilike.${pat}`);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    }

    async updateNewsSource(id: string, updates: any) {
        const { data, error } = await this.supabase
            .from('news_sources')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async deleteNewsSource(id: string) {
        const { error } = await this.supabase
            .from('news_sources')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }

    // ============================================
    // MUSIC RESOURCES METHODS
    // ============================================

    async getMusicResources(radioId?: string) {
        let query = this.supabase
            .from('music_resources')
            .select('*, radio:radios(name)')
            .order('created_at', { ascending: false });

        if (radioId) {
            // If radioId provided, show global (null) + specific radio
            query = query.or(`radio_id.is.null,radio_id.eq.${radioId}`);
        }
        
        const { data, error } = await query;

        if (error) throw error;
        return data;
    }

    async uploadMusicResource(file: File, name: string, type: 'intro' | 'outro' | 'background' | 'effect', radioId?: string) {
        const user = await this.getCurrentUser();
        if (!user) throw new Error('User not authenticated');

        const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        
        // 1. Upload file to storage
        const { data: uploadData, error: uploadError } = await this.supabase.storage
            .from('music-resources')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) throw uploadError;

        // 2. Get public URL
        const { data: { publicUrl } } = this.supabase.storage
            .from('music-resources')
            .getPublicUrl(fileName);

        // 3. Create database record
        const insertData: any = {
            name,
            url: publicUrl,
            type,
            user_id: user.id
        };

        if (radioId) {
            insertData.radio_id = radioId;
        }

        const { data: resource, error: dbError } = await this.supabase
            .from('music_resources')
            .insert(insertData)
            .select()
            .single();

        if (dbError) {
            // Rollback storage upload if DB insert fails
            await this.supabase.storage.from('music-resources').remove([fileName]);
            throw dbError;
        }

        return resource;
    }

    async deleteMusicResource(id: string, url: string) {
        // 0. Remove references from broadcast_news_items to prevent FK error
        // constraint: broadcast_news_items_music_resource_id_fkey implies column music_resource_id
        try {
            const { error: updateError } = await this.supabase
                .from('broadcast_news_items')
                .update({ music_resource_id: null })
                .eq('music_resource_id', id);
            
            if (updateError) {
                console.warn('Warning: Failed to cleanup broadcast_news_items references', updateError);
            }
        } catch (e) {
            console.warn('Error during cleanup of references', e);
        }

        // 1. Delete from database
        const { error: dbError } = await this.supabase
            .from('music_resources')
            .delete()
            .eq('id', id);

        if (dbError) throw dbError;

        // 2. Delete from storage (extract filename from URL)
        // URL format: .../music-resources/filename
        const fileName = url.split('/').pop();
        if (fileName) {
            const { error: storageError } = await this.supabase.storage
                .from('music-resources')
                .remove([fileName]);
            
            if (storageError) console.error('Error deleting file from storage:', storageError);
        }
    }

    // ============================================
    // SCRAPED NEWS METHODS
    // ============================================

    async getScrapedNews(options?: { limit?: number; offset?: number; sourceId?: string; sourceIds?: string[]; category?: string; since?: string }) {
        let query = this.supabase
            .from('news_with_source')
            .select('*')
            .order('scraped_at', { ascending: false });

        if (options?.limit) {
            query = query.limit(options.limit);
        }

        if (options?.offset) {
            query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
        }

        if (options?.sourceId) {
            query = query.eq('source_id', options.sourceId);
        }

        if (options?.sourceIds && options.sourceIds.length > 0) {
            query = query.in('source_id', options.sourceIds);
        }

        if (options?.category && options.category !== 'all') {
            query = query.eq('category', options.category);
        }

        if (options?.since) {
            query = query.gte('published_at', options.since);
        }

        const { data, error } = await query;

        if (error) throw error;
        return data;
    }

    async getScrapedNewsById(id: string) {
        const { data, error } = await this.supabase
            .from('scraped_news')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    }

    async logCostEvent(event: { action: string; module?: string; units?: number; relatedId?: string | null; metadata?: any }) {
        try {
            const { data, error } = await this.supabase.rpc('log_cost_event', {
                p_action: event.action,
                p_module: event.module || 'app',
                p_units: event.units ?? 1,
                p_related_id: event.relatedId ?? null,
                p_metadata: event.metadata ?? {}
            });

            if (error) throw error;
            return data;
        } catch (error) {
            console.warn('Error logging cost event:', error);
            return null;
        }
    }

    async getCostRates() {
        const { data, error } = await this.supabase
            .from('cost_rates')
            .select('*')
            .order('action', { ascending: true });

        if (error) throw error;
        return data;
    }

    async upsertCostRate(rate: { action: string; module?: string; unit_name?: string; unit_cost?: number; currency?: string; is_active?: boolean }) {
        const payload = {
            action: rate.action,
            module: rate.module || 'app',
            unit_name: rate.unit_name || 'unit',
            unit_cost: rate.unit_cost ?? 0,
            currency: rate.currency || 'USD',
            is_active: rate.is_active ?? true
        };

        const { data, error } = await this.supabase
            .from('cost_rates')
            .upsert(payload, { onConflict: 'action' })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async getCostEvents(options?: { limit?: number; offset?: number; userId?: string; action?: string; from?: string; to?: string }) {
        let query = this.supabase
            .from('cost_events')
            .select('*, user:users(id, email, full_name, role, manager_id)')
            .order('created_at', { ascending: false });

        if (options?.limit) query = query.limit(options.limit);
        if (options?.offset) query = query.range(options.offset, options.offset + (options.limit || 50) - 1);

        if (options?.userId && options.userId !== 'all') {
            query = query.eq('user_id', options.userId);
        }

        if (options?.action && options.action !== 'all') {
            query = query.eq('action', options.action);
        }

        if (options?.from) query = query.gte('created_at', options.from);
        if (options?.to) query = query.lte('created_at', options.to);

        const { data, error } = await query;
        if (error) throw error;
        return data;
    }

    async getAudioMinuteUsageEvents(options?: { limit?: number; offset?: number; userId?: string; from?: string; to?: string }) {
        let query = this.supabase
            .from('audio_minute_usage_events')
            .select('*')
            .order('created_at', { ascending: false });

        if (options?.limit) query = query.limit(options.limit);
        if (options?.offset) query = query.range(options.offset, options.offset + (options.limit || 50) - 1);

        if (options?.userId && options.userId !== 'all') {
            query = query.eq('user_id', options.userId);
        }

        if (options?.from) query = query.gte('created_at', options.from);
        if (options?.to) query = query.lte('created_at', options.to);

        const { data, error } = await query;
        if (error) throw error;
        return data;
    }

    async getBroadcastsForCosts(options?: { limit?: number; offset?: number; creatorId?: string; from?: string; to?: string }) {
        let query = this.supabase
            .from('news_broadcasts')
            .select('id, title, status, duration_minutes, total_reading_time_seconds, total_news_count, created_at, created_by, creator:users!news_broadcasts_created_by_fkey(id, email, full_name, role, manager_id)')
            .order('created_at', { ascending: false });

        if (options?.limit) query = query.limit(options.limit);
        if (options?.offset) query = query.range(options.offset, options.offset + (options.limit || 50) - 1);

        if (options?.creatorId && options.creatorId !== 'all') {
            query = query.eq('created_by', options.creatorId);
        }

        if (options?.from) query = query.gte('created_at', options.from);
        if (options?.to) query = query.lte('created_at', options.to);

        const { data, error } = await query;
        if (error) throw error;
        return data;
    }

    async createScrapedNews(news: any) {
        const { data, error } = await this.supabase
            .from('scraped_news')
            .insert(news)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async updateScrapedNews(id: string, updates: any) {
        const { data, error } = await this.supabase
            .from('scraped_news')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async deleteScrapedNews(id: string) {
        const { error } = await this.supabase
            .from('scraped_news')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }

    async getGeneratedBroadcasts(options?: {
        limit?: number;
        offset?: number;
        broadcastId?: string;
        chargedUserId?: string;
        from?: string;
        to?: string;
    }) {
        let query = this.supabase
            .from('generated_broadcasts')
            .select('*')
            .order('created_at', { ascending: false });

        if (options?.limit) {
            query = query.limit(options.limit);
        }

        if (options?.offset) {
            query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
        }

        if (options?.broadcastId) {
            query = query.eq('broadcast_id', options.broadcastId);
        }

        if (options?.chargedUserId && options.chargedUserId !== 'all') {
            query = query.eq('charged_user_id', options.chargedUserId);
        }

        if (options?.from) query = query.gte('created_at', options.from);
        if (options?.to) query = query.lte('created_at', options.to);

        const { data, error } = await query;

        if (error) throw error;
        return data;
    }

    async createGeneratedBroadcast(broadcast: any) {
        const { data, error } = await this.supabase
            .from('generated_broadcasts')
            .insert(broadcast)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async createGeneratedBroadcastWithQuota(payload: {
        broadcast_id: string;
        title: string;
        audio_url: string;
        duration_seconds: number;
    }): Promise<GeneratedBroadcastWithQuotaResult> {
        const { data, error } = await this.supabase.rpc('create_generated_broadcast_with_quota_rpc', {
            p_broadcast_id: payload.broadcast_id,
            p_title: payload.title,
            p_audio_url: payload.audio_url,
            p_duration_seconds: Math.max(0, Math.round(Number(payload.duration_seconds || 0)))
        });

        if (error) throw error;
        return {
            generated_broadcast: data?.generated_broadcast,
            quota_summary: data?.quota_summary,
            charged_minutes: Number(data?.charged_minutes || 0),
            charged_now: !!data?.charged_now,
            already_charged: !!data?.already_charged
        };
    }

    async deleteGeneratedBroadcast(id: string) {
        const { error } = await this.supabase
            .from('generated_broadcasts')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }

    // ============================================
    // HUMANIZED NEWS METHODS
    // ============================================

    async getHumanizedNews(options?: { limit?: number; offset?: number }) {
        let query = this.supabase
            .from('humanized_news')
            .select('*')
            .order('created_at', { ascending: false });

        if (options?.limit) {
            query = query.limit(options.limit);
        }

        if (options?.offset) {
            query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
        }

        const { data, error } = await query;

        if (error) throw error;
        return data;
    }

    async getHumanizedNewsById(id: string) {
        const { data, error } = await this.supabase
            .from('humanized_news')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    }

    async createHumanizedNews(news: any) {
        const { data, error } = await this.supabase
            .from('humanized_news')
            .insert(news)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async updateHumanizedNews(id: string, updates: any) {
        const { data, error } = await this.supabase
            .from('humanized_news')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    // ============================================
    // NEWS BROADCASTS METHODS
    // ============================================

    async getNewsBroadcasts(options?: { limit?: number; offset?: number; status?: string; radioId?: string }) {
        let query = this.supabase
            .from('news_broadcasts')
            .select('*')
            .order('created_at', { ascending: false });

        if (options?.limit) {
            query = query.limit(options.limit);
        }

        if (options?.offset) {
            query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
        }

        if (options?.status) {
            query = query.eq('status', options.status);
        }

        if (options?.radioId) {
            query = query.eq('radio_id', options.radioId);
        }

        const { data, error } = await query;

        if (error) throw error;
        return data;
    }

    async getNewsBroadcastById(id: string) {
        const { data, error } = await this.supabase
            .from('news_broadcasts')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    }

    async createNewsBroadcast(broadcast: any) {
        const { data, error } = await this.supabase
            .from('news_broadcasts')
            .insert(broadcast)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async getPendingReviewBroadcasts() {
        const { data, error } = await this.supabase
            .from('news_broadcasts')
            .select('id, title, created_by, created_at, duration_minutes, total_news_count, total_reading_time_seconds, status')
            .eq('status', 'pending_review')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    }

    async updateNewsBroadcast(id: string, updates: any) {
        const { data, error } = await this.supabase
            .from('news_broadcasts')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async deleteNewsBroadcast(id: string) {
        const MAX_RETRIES = 3;
        
        // Helper for retrying delete operations
        const deleteWithRetry = async (table: string, matchColumn: string, matchValue: any, isIn: boolean = false) => {
            for (let i = 0; i < MAX_RETRIES; i++) {
                try {
                    let query = this.supabase.from(table).delete();
                    
                    if (isIn) {
                        query = query.in(matchColumn, matchValue);
                    } else {
                        query = query.eq(matchColumn, matchValue);
                    }

                    const { error } = await query;
                    if (!error) return;
                    
                    console.warn(`Attempt ${i + 1} failed to delete from ${table}:`, error);
                    if (i === MAX_RETRIES - 1) throw error;
                    await new Promise(r => setTimeout(r, 1000)); // Wait 1s before retry
                } catch (e) {
                    if (i === MAX_RETRIES - 1) throw e;
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
        };

        try {
            // 1. Delete generated broadcasts
            await deleteWithRetry('generated_broadcasts', 'broadcast_id', id);

            // 2. Delete timeline events
            await deleteWithRetry('timeline_events', 'broadcast_id', id);

            // 3. Delete broadcast news items (and their related TTS files)
            const { data: items, error: itemsError } = await this.supabase
                .from('broadcast_news_items')
                .select('id')
                .eq('broadcast_id', id);
            if (itemsError) throw itemsError;
            
            const itemIds = (items || []).map(i => i.id);

            if (itemIds.length > 0) {
                await deleteWithRetry('tts_audio_files', 'broadcast_news_item_id', itemIds, true);
            }

            await deleteWithRetry('broadcast_news_items', 'broadcast_id', id);

            // 4. Finally delete the broadcast
            await deleteWithRetry('news_broadcasts', 'id', id);

            const { data: remaining, error: remainingError } = await this.supabase
                .from('news_broadcasts')
                .select('id')
                .eq('id', id)
                .maybeSingle();

            if (remainingError) throw remainingError;
            if (remaining) {
                throw new Error('No se pudo eliminar el noticiero. Intenta nuevamente.');
            }
        } catch (error) {
            console.error('Final error deleting broadcast:', error);
            throw error;
        }
    }

    // ============================================
    // BROADCAST NEWS ITEMS METHODS
    // ============================================

    async getBroadcastNewsItems(broadcastId: string) {
        const { data, error } = await this.supabase
            .from('broadcast_news_items')
            .select('*, humanized_news(*), tts_audio_files(*)')
            .eq('broadcast_id', broadcastId)
            .order('order_index', { ascending: true });

        if (error) throw error;
        return data;
    }

    private parseMissingColumnFromPostgrestError(error: any): string | null {
        const code = String(error?.code || '');
        if (code !== 'PGRST204') return null;
        const msg = String(error?.message || '');
        const m = msg.match(/Could not find the '([^']+)' column/i);
        return m?.[1] ? String(m[1]) : null;
    }

    private omitKey(obj: any, key: string): any {
        if (!obj || typeof obj !== 'object') return obj;
        if (!(key in obj)) return obj;
        const copy: any = Array.isArray(obj) ? obj.slice() : { ...obj };
        try {
            delete copy[key];
        } catch {}
        return copy;
    }

    async createBroadcastNewsItem(item: any) {
        let payload = item;
        for (let attempt = 0; attempt < 6; attempt++) {
            const { data, error } = await this.supabase
                .from('broadcast_news_items')
                .insert(payload)
                .select()
                .single();

            if (!error) return data;

            const missing = this.parseMissingColumnFromPostgrestError(error);
            if (!missing) throw error;

            const next = this.omitKey(payload, missing);
            if (next === payload) throw error;
            payload = next;
        }
        throw new Error('No se pudo crear el bloque del noticiero (schema mismatch).');
    }

    async updateBroadcastNewsItem(id: string, updates: any) {
        let payload = updates;
        for (let attempt = 0; attempt < 6; attempt++) {
            const { data, error } = await this.supabase
                .from('broadcast_news_items')
                .update(payload)
                .eq('id', id)
                .select()
                .single();

            if (!error) return data;

            const missing = this.parseMissingColumnFromPostgrestError(error);
            if (!missing) throw error;

            const next = this.omitKey(payload, missing);
            if (next === payload) throw error;
            payload = next;
        }
        throw new Error('No se pudo actualizar el bloque del noticiero (schema mismatch).');
    }

    async deleteBroadcastNewsItem(id: string) {
        const { error } = await this.supabase
            .from('broadcast_news_items')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }

    // ============================================
    // STORAGE METHODS
    // ============================================

    async uploadAudioFile(file: File, path: string) {
        const { data, error } = await this.supabase.storage
            .from('noticias') // Changed from 'audio-files' to 'noticias'
            .upload(path, file, {
                cacheControl: '3600',
                upsert: true
            });

        if (error) throw error;

        // Get public URL
        const { data: publicUrlData } = this.supabase.storage
            .from('noticias')
            .getPublicUrl(path);
            
        return publicUrlData.publicUrl;
    }

    async uploadAudio(blob: Blob, path: string) {
        const file = new File([blob], path.split('/').pop() || 'audio.mp3', { type: 'audio/mp3' });
        return this.uploadAudioFile(file, path);
    }

    // ============================================
    // TTS AUDIO FILES METHODS
    // ============================================

    async getTtsAudioFiles(options?: { limit?: number; offset?: number }) {
        let query = this.supabase
            .from('tts_audio_files')
            .select('*')
            .order('created_at', { ascending: false });

        if (options?.limit) {
            query = query.limit(options.limit);
        }

        if (options?.offset) {
            query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
        }

        const { data, error } = await query;

        if (error) throw error;
        return data;
    }

    async createTtsAudioFile(audio: any) {
        const { data, error } = await this.supabase
            .from('tts_audio_files')
            .insert(audio)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    // ============================================
    // AUTOMATION ASSETS METHODS
    // ============================================

    async getAutomationAssets(options?: { limit?: number; offset?: number; type?: string; isActive?: boolean }) {
        let query = this.supabase
            .from('automation_assets')
            .select('*')
            .order('created_at', { ascending: false });

        if (options?.limit) {
            query = query.limit(options.limit);
        }

        if (options?.offset) {
            query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
        }

        if (options?.type) {
            query = query.eq('type', options.type);
        }

        if (options?.isActive !== undefined) {
            query = query.eq('is_active', options.isActive);
        }

        const { data, error } = await query;

        if (error) throw error;
        return data;
    }

    async getAutomationAssetById(id: string) {
        const { data, error } = await this.supabase
            .from('automation_assets')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    }

    async createAutomationAsset(asset: any) {
        const { data, error } = await this.supabase
            .from('automation_assets')
            .insert(asset)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async updateAutomationAsset(id: string, updates: any) {
        const { data, error } = await this.supabase
            .from('automation_assets')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async deleteAutomationAsset(id: string) {
        const { error } = await this.supabase
            .from('automation_assets')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }

    // ============================================
    // AUTOMATION RUNS METHODS
    // ============================================

    async getAutomationRuns(assetId?: string, options?: { limit?: number; offset?: number }) {
        let query = this.supabase
            .from('automation_runs')
            .select('*')
            .order('started_at', { ascending: false });

        if (assetId) {
            query = query.eq('asset_id', assetId);
        }

        if (options?.limit) {
            query = query.limit(options.limit);
        }

        if (options?.offset) {
            query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
        }

        const { data, error } = await query;

        if (error) throw error;
        return data;
    }

    async createAutomationRun(run: any) {
        const { data, error } = await this.supabase
            .from('automation_runs')
            .insert(run)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async updateAutomationRun(id: string, updates: any) {
        const { data, error } = await this.supabase
            .from('automation_runs')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    // ============================================
    // TIMELINE EVENTS METHODS
    // ============================================

    async getTimelineEvents(broadcastId: string) {
        const { data, error } = await this.supabase
            .from('timeline_events')
            .select('*')
            .eq('broadcast_id', broadcastId)
            .order('start_time_seconds', { ascending: true });

        if (error) throw error;
        return data;
    }

    async createTimelineEvent(event: any) {
        const { data, error } = await this.supabase
            .from('timeline_events')
            .insert(event)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    // ============================================
    // SETTINGS METHODS
    // ============================================

    async getSettings() {
        const { data, error } = await this.supabase
            .from('settings')
            .select('*');

        if (error) throw error;
        return data;
    }

    async getSettingByKey(key: string) {
        const { data, error } = await this.supabase
            .from('settings')
            .select('*')
            .eq('key', key)
            .maybeSingle();

        if (error) throw error;
        return data;
    }

    async updateSetting(key: string, value: any) {
        const { data, error } = await this.supabase
            .from('settings')
            .update({ value })
            .eq('key', key)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async upsertSetting(key: string, value: any) {
        const { data, error } = await this.supabase
            .from('settings')
            .upsert({ key, value }, { onConflict: 'key' })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    // ============================================
    // VIEWS METHODS
    // ============================================

    async getBroadcastDetails() {
        const { data, error } = await this.supabase
            .from('broadcast_details')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    }

    async getNewsWithSource() {
        const { data, error } = await this.supabase
            .from('news_with_source')
            .select('*')
            .order('published_at', { ascending: false });

        if (error) throw error;
        return data;
    }

    async getAutomationStatus() {
        const { data, error } = await this.supabase
            .from('automation_status')
            .select('*');

        if (error) throw error;
        return data;
    }

    // ============================================
    // REALTIME SUBSCRIPTIONS
    // ============================================

    subscribeToTable(tableName: string, callback: (payload: any) => void) {
        return this.supabase
            .channel(`public:${tableName}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, callback)
            .subscribe();
    }

    subscribeToBroadcast(broadcastId: string, callback: (payload: any) => void) {
        return this.supabase
            .channel(`broadcast:${broadcastId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'broadcast_news_items',
                filter: `broadcast_id=eq.${broadcastId}`
            }, callback)
            .subscribe();
    }

    // Unsubscribe from channel
    unsubscribe(channel: any) {
        this.supabase.removeChannel(channel);
    }

}
