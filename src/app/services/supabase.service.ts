import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../core/config';

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

    async getNewsSources() {
        const { data, error } = await this.supabase
            .from('news_sources')
            .select('*')
            .order('created_at', { ascending: false });

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

    async getScrapedNews(options?: { limit?: number; offset?: number; sourceId?: string }) {
        let query = this.supabase
            .from('news_with_source')
            .select('*')
            .order('published_at', { ascending: false });

        if (options?.limit) {
            query = query.limit(options.limit);
        }

        if (options?.offset) {
            query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
        }

        if (options?.sourceId) {
            query = query.eq('source_id', options.sourceId);
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

    async getGeneratedBroadcasts(options?: { limit?: number; offset?: number; broadcastId?: string }) {
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
            const { data: items } = await this.supabase
                .from('broadcast_news_items')
                .select('id')
                .eq('broadcast_id', id);
            
            if (items && items.length > 0) {
                const itemIds = items.map(i => i.id);
                
                // Delete tts_audio_files referencing these items
                if (itemIds.length > 0) {
                     await deleteWithRetry('tts_audio_files', 'broadcast_news_item_id', itemIds, true);
                }

                // Now delete items
                await deleteWithRetry('broadcast_news_items', 'broadcast_id', id);
            }

            // 4. Finally delete the broadcast
            await deleteWithRetry('news_broadcasts', 'id', id);

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
            .select('*, humanized_news(*)')
            .eq('broadcast_id', broadcastId)
            .order('order_index', { ascending: true });

        if (error) throw error;
        return data;
    }

    async createBroadcastNewsItem(item: any) {
        const { data, error } = await this.supabase
            .from('broadcast_news_items')
            .insert(item)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async updateBroadcastNewsItem(id: string, updates: any) {
        const { data, error } = await this.supabase
            .from('broadcast_news_items')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
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
            .single();

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
