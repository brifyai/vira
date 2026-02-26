export const config = (window as any).__env || {
    production: false,
    apiUrl: '',
    azureWorkerUrl: '',
    appUrl: '',
    supabaseUrl: '',
    supabaseAnonKey: '',
    scrapingBeeApiKey: '',
    cronSecret: '',
    googleClientId: '',
    googleClientSecret: '',
    googleRedirectUri: '',
    googleCloudTtsApiKey: '',
    defaultVoiceSettings: {
        language: 'es-ES',
        voice: 'es-ES-Wavenet-B',
        speakingRate: 1.0,
        pitch: 0.0
    }
};
