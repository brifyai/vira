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

const getEnvFileContent = () => {
  return `(function(window) {
  window.__env = window.__env || {};
  
  // Environment variables
  window.__env.production = ${envConfig.production};
  window.__env.apiUrl = '${envConfig.apiUrl}';
  window.__env.azureWorkerUrl = '${envConfig.azureWorkerUrl}';
  window.__env.appUrl = '${envConfig.appUrl}';
  window.__env.supabaseUrl = '${envConfig.supabaseUrl}';
  window.__env.supabaseAnonKey = '${envConfig.supabaseAnonKey}';
  window.__env.scrapingBeeApiKey = '${envConfig.scrapingBeeApiKey}';
  window.__env.cronSecret = '${envConfig.cronSecret}';
  window.__env.googleClientId = '${envConfig.googleClientId}';
  window.__env.googleClientSecret = '${envConfig.googleClientSecret}';
  window.__env.googleRedirectUri = '${envConfig.googleRedirectUri}';
  window.__env.googleCloudTtsApiKey = '${envConfig.googleCloudTtsApiKey}';
  window.__env.defaultVoiceSettings = ${JSON.stringify(envConfig.defaultVoiceSettings)};

}(this));
`;
};

// Ensure directory exists
const targetDir = './public';
mkdirSync(targetDir, { recursive: true });

// Write env.js
writeFileSync(path.join(targetDir, 'env.js'), getEnvFileContent());
console.log('Generated public/env.js');
