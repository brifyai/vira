const runtimeEnv = (window as any).__env || {};
const runtimeOrigin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin.replace(/\/+$/, '')
    : '';

export const config = {
    production: runtimeEnv.production ?? false,
    // Frontend should use same-origin by default on Vercel and only override when truly needed.
    apiUrl: String(runtimeEnv.apiUrl || runtimeOrigin || 'http://localhost:8888').replace(/\/+$/, '').replace(/\/api$/, ''),
    azureWorkerUrl: runtimeEnv.azureWorkerUrl || '',
    appUrl: String(runtimeEnv.appUrl || runtimeOrigin || '').replace(/\/+$/, ''),
    supabaseUrl: runtimeEnv.supabaseUrl || '',
    supabaseAnonKey: runtimeEnv.supabaseAnonKey || '',
    defaultVoiceSettings: runtimeEnv.defaultVoiceSettings || {
        language: 'es-ES',
        voice: 'es-ES-Wavenet-B',
        speakingRate: 1.0,
        pitch: 0.0
    }
};
