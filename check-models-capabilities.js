
const { GoogleGenAI } = require('@google/genai');

const apiKey = process.env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY';

async function checkModels() {
  const client = new GoogleGenAI({ apiKey });
  
  try {
    console.log('Fetching models supporting generateContent...');
    const response = await client.models.list();
    
    let foundAudioCapable = false;

    for await (const model of response) {
        // Check if supports generateContent (REST API)
        if (model.supportedActions && model.supportedActions.includes('generateContent')) {
            console.log(`Model: ${model.name}`);
            console.log(`Version: ${model.version}`);
            console.log(`Display: ${model.displayName}`);
            console.log('---');
        }
        
        if (model.name.includes('audio')) {
             console.log(`[AUDIO MODEL FOUND] ${model.name}`);
             console.log(`Supported Actions: ${model.supportedActions?.join(', ')}`);
             console.log('---');
        }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkModels();
