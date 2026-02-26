import { GenerationParams } from "./types";
import { base64ToArrayBuffer, createWavBlob } from "./audio";
import { config } from "../core/config";

export const generateSpeech = async (params: GenerationParams): Promise<Blob> => {
  try {
    const apiUrl = config.apiUrl;
    const url = `${apiUrl}/api/gemini-tts`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: params.text,
        voice: params.voice.geminiVoiceName,
        speed: params.speed,
        pitch: params.pitch,
        style: params.style
      })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini TTS API Error (${response.status}): ${errorText}`);
    }

    const blob = await response.blob();
    return blob;

  } catch (error) {
    console.error("Error generating speech:", error);
    throw error;
  }
};
