export enum Gender {
  Male = 'Hombre',
  Female = 'Mujer',
}

export interface VoiceOption {
  id: string;
  name: string;
  gender: Gender;
  geminiVoiceName: string; // Map to: 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'
}

export enum TTSStyle {
  Alegre = 'alegre',
  Triste = 'triste',
  Susurrar = 'susurrar',
  Storyteller = 'storyteller',
  Natural = 'natural',
}

export interface AudioHistoryItem {
  id: string;
  text: string;
  timestamp: number;
  blob: Blob; // The WAV blob
  style: TTSStyle;
  voiceName: string;
}

export interface GenerationParams {
  text: string;
  voice: VoiceOption;
  style: TTSStyle;
  speed: number; // 0.5 to 2.0
  pitch: number; // -10 to 10
}
