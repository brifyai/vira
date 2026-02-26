import { Gender, TTSStyle, VoiceOption } from './types';

// Gemini Voices: 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'
export const VOICES: VoiceOption[] = [
  // Hombres (5)
  { id: 'm1', name: 'Mateo', gender: Gender.Male, geminiVoiceName: 'Fenrir' },
  { id: 'm2', name: 'Benjamín', gender: Gender.Male, geminiVoiceName: 'Puck' },
  { id: 'm3', name: 'Alonso', gender: Gender.Male, geminiVoiceName: 'Zephyr' },
  { id: 'm4', name: 'Felipe', gender: Gender.Male, geminiVoiceName: 'Fenrir' }, // Reusing Fenrir with prompt nuances
  { id: 'm5', name: 'Joaquín', gender: Gender.Male, geminiVoiceName: 'Puck' },   // Reusing Puck with prompt nuances

  // Mujeres (5)
  { id: 'f1', name: 'Isidora', gender: Gender.Female, geminiVoiceName: 'Kore' },
  { id: 'f2', name: 'Sofía', gender: Gender.Female, geminiVoiceName: 'Charon' },
  { id: 'f3', name: 'Valentina', gender: Gender.Female, geminiVoiceName: 'Kore' }, // Reusing Kore
  { id: 'f4', name: 'Camila', gender: Gender.Female, geminiVoiceName: 'Charon' }, // Reusing Charon
  { id: 'f5', name: 'Martina', gender: Gender.Female, geminiVoiceName: 'Zephyr' }, // Zephyr can be gender neutral/female depending on pitch
];

export const STYLES = [
  { value: TTSStyle.Natural, label: 'Natural' },
  { value: TTSStyle.Alegre, label: 'Alegre' },
  { value: TTSStyle.Triste, label: 'Triste' },
  { value: TTSStyle.Susurrar, label: 'Susurrar' },
  { value: TTSStyle.Storyteller, label: 'Cuentacuentos' },
];

export const SPECIAL_TAGS = [
  { tag: '[pausa]', desc: 'Pausa (2s)' },
  { tag: '[risa]', desc: 'Risa' },
  { tag: '[grito]', desc: 'Grito' },
  { tag: '[llanto]', desc: 'Llanto' },
];
