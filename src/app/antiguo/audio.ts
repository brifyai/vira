/**
 * Decodes base64 string to an ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Creates a WAV file header for PCM data.
 * Necessary because Gemini API returns raw PCM without headers.
 */
export function createWavHeader(dataLength: number, sampleRate: number = 24000, numChannels: number = 1): ArrayBuffer {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true); // File size - 8
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * numChannels * 2, true); // ByteRate
  view.setUint16(32, numChannels * 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true); // Subchunk2Size

  return buffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Combines header and raw PCM data into a Blob
 */
export function createWavBlob(pcmData: ArrayBuffer, sampleRate: number = 24000): Blob {
  const header = createWavHeader(pcmData.byteLength, sampleRate);
  return new Blob([header, pcmData], { type: 'audio/wav' });
}

/**
 * Decodes audio data for playback in browser
 */
export async function decodeAudioData(
  audioData: ArrayBuffer,
  ctx: AudioContext
): Promise<AudioBuffer> {
  // We need to treat raw PCM specially if we were streaming, 
  // but since we package it as WAV blob immediately, we can use decodeAudioData
  // However, for raw PCM from Gemini without header, we must manually process if playing directly from stream.
  // In this app, we will package to WAV first for consistency in play and download.
  
  // Actually, Gemini returns Raw PCM. Let's decode raw PCM to Float32 for playback context.
  // PCM 16-bit Little Endian
  const int16Array = new Int16Array(audioData);
  const float32Array = new Float32Array(int16Array.length);
  
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 32768.0;
  }

  const audioBuffer = ctx.createBuffer(1, float32Array.length, 24000);
  audioBuffer.copyToChannel(float32Array, 0);
  
  return audioBuffer;
}
