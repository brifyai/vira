import React from 'react';
import { VoiceOption } from './types';
import { VOICES } from './constants';
import { User, Mic } from 'lucide-react';

interface Props {
  selectedVoice: VoiceOption;
  onSelect: (voice: VoiceOption) => void;
}

export const VoiceSelector: React.FC<Props> = ({ selectedVoice, onSelect }) => {
  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
        <Mic size={16} />
        Seleccionar Voz
      </label>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {VOICES.map((voice) => (
          <button
            key={voice.id}
            onClick={() => onSelect(voice)}
            className={`
              relative p-3 rounded-lg border flex flex-col items-center justify-center gap-2 transition-all
              ${selectedVoice.id === voice.id 
                ? 'bg-brand-600 border-brand-500 text-white shadow-lg shadow-brand-900/50' 
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:border-slate-600'}
            `}
          >
            <div className={`p-2 rounded-full ${selectedVoice.id === voice.id ? 'bg-brand-500' : 'bg-slate-700'}`}>
              <User size={20} />
            </div>
            <div className="text-center">
              <div className="font-semibold text-sm">{voice.name}</div>
              <div className="text-xs opacity-70">{voice.gender}</div>
            </div>
            {selectedVoice.id === voice.id && (
              <div className="absolute top-2 right-2 w-2 h-2 bg-white rounded-full animate-pulse" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};
