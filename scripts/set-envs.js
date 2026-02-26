const { writeFileSync, mkdirSync } = require('fs');
const path = require('path');

// Load dotenv to read .env file
require('dotenv').config();

// Helper to get env var with fallback
const getEnv = (key, upperKey, defaultValue = '') => {
  return process.env[key] || process.env[upperKey] || defaultValue;
};

// Default values/Mappings
const envConfig = {
  production: process.env.PRODUCTION === 'true' || process.env.production === 'true',
  // Ensure apiUrl doesn't end with /api since services append it
  apiUrl: getEnv('apiUrl', 'API_URL', 'https://vira-swart.vercel.app').replace(/\/api$/, ''),
  azureWorkerUrl: getEnv('azureWorkerUrl', 'AZURE_WORKER_URL', 'https://text-to-speech-worker.brifyaimaster.workers.dev/'),
  appUrl: getEnv('appUrl', 'APP_URL', 'https://vira-swart.vercel.app'),
  supabaseUrl: getEnv('supabaseUrl', 'SUPABASE_URL'),
  supabaseAnonKey: getEnv('supabaseAnonKey', 'SUPABASE_ANON_KEY'),
  scrapingBeeApiKey: getEnv('scrapingBeeApiKey', 'SCRAPING_BEE_API_KEY'),
  cronSecret: getEnv('cronSecret', 'CRON_SECRET'),
  googleClientId: getEnv('googleClientId', 'GOOGLE_CLIENT_ID'),
  googleClientSecret: getEnv('googleClientSecret', 'GOOGLE_CLIENT_SECRET'),
  googleRedirectUri: getEnv('googleRedirectUri', 'GOOGLE_REDIRECT_URI', 'https://vira-swart.vercel.app/api/auth/google/callback'),
  // geminiApiKey: REMOVED FOR SECURITY - NOW ON SERVER SIDE ONLY
  googleCloudTtsApiKey: getEnv('googleCloudTtsApiKey', 'GOOGLE_CLOUD_TTS_API_KEY'),
  defaultVoiceSettings: {
    language: 'es-ES',
    voice: 'es-ES-Wavenet-B',
    speakingRate: 1.0,
    pitch: 0.0
  }
};

const getEnvFileContent = (isProduction) => {
  return `export const environment = {
    production: ${isProduction},
    apiUrl: '${envConfig.apiUrl}',
    azureWorkerUrl: '${envConfig.azureWorkerUrl}',
    appUrl: '${envConfig.appUrl}',
    supabaseUrl: '${envConfig.supabaseUrl}',
    supabaseAnonKey: '${envConfig.supabaseAnonKey}',
    scrapingBeeApiKey: '${envConfig.scrapingBeeApiKey}',
    cronSecret: '${envConfig.cronSecret}',
    googleClientId: '${envConfig.googleClientId}',
    googleClientSecret: '${envConfig.googleClientSecret}',
    googleRedirectUri: '${envConfig.googleRedirectUri}',
    // geminiApiKey: removed,
    googleCloudTtsApiKey: '${envConfig.googleCloudTtsApiKey}',
    defaultVoiceSettings: ${JSON.stringify(envConfig.defaultVoiceSettings, null, 4)}
};
`;
};

// Ensure directory exists
const targetDir = './src/environments';
mkdirSync(targetDir, { recursive: true });

// Write environment.ts
writeFileSync(path.join(targetDir, 'environment.ts'), getEnvFileContent(false));
console.log('Generated src/environments/environment.ts');

// Write environment.prod.ts
writeFileSync(path.join(targetDir, 'environment.prod.ts'), getEnvFileContent(true));
console.log('Generated src/environments/environment.prod.ts');
