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
  // Public frontend config only. Private secrets must stay in server-side Vercel env vars.
  apiUrl: getEnv('apiUrl', 'API_URL', '').replace(/\/api$/, ''),
  appUrl: getEnv('appUrl', 'APP_URL', ''),
  supabaseUrl: getEnv('supabaseUrl', 'SUPABASE_URL'),
  supabaseAnonKey: getEnv('supabaseAnonKey', 'SUPABASE_ANON_KEY'),
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
  window.__env.appUrl = '${envConfig.appUrl}';
  window.__env.supabaseUrl = '${envConfig.supabaseUrl}';
  window.__env.supabaseAnonKey = '${envConfig.supabaseAnonKey}';
  window.__env.defaultVoiceSettings = ${JSON.stringify(envConfig.defaultVoiceSettings)};

}(this));
`;
};

// Ensure directory exists
const targetDir = './public';
mkdirSync(targetDir, { recursive: true });

// Write env.js
writeFileSync(path.join(targetDir, 'env.js'), getEnvFileContent());
// console.log('Generated public/env.js');
