import React, { useRef, useState, useEffect } from 'react';
import { AudioHistoryItem } from './types';
import { Download, Play, Pause, Trash2 } from 'lucide-react';

interface Props {
  items: AudioHistoryItem[];
  onDelete: (id: string) => void;
}

export const HistoryList: React.FC<Props> = ({ items, onDelete }) => {
  if (items.length === 0) return null;

  return (
    <div className="space-y-4 mt-8">
      <h2 className="text-xl font-bold text-white mb-4 border-b border-slate-700 pb-2">Historial de Generaciones</h2>
      <div className="space-y-3">
        {items.map((item) => (
          <HistoryItem key={item.id} item={item} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
};

const HistoryItem: React.FC<{ item: AudioHistoryItem; onDelete: (id: string) => void }> = ({ item, onDelete }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [url, setUrl] = useState<string>('');

  useEffect(() => {
    const objectUrl = URL.createObjectURL(item.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [item.blob]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `voz-chilena-${item.id}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-slate-800 rounded-lg p-4 flex flex-col md:flex-row gap-4 items-center justify-between border border-slate-700 hover:border-slate-600 transition-colors">
      <div className="flex-1 min-w-0 w-full">
        <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-brand-900 text-brand-300 border border-brand-700 uppercase tracking-wider">
                {item.voiceName}
            </span>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-700 text-slate-300 uppercase tracking-wider">
                {item.style}
            </span>
            <span className="text-xs text-slate-500 ml-auto md:ml-2">
                {new Date(item.timestamp).toLocaleTimeString()}
            </span>
        </div>
        <p className="text-sm text-slate-300 truncate font-mono opacity-80" title={item.text}>
          "{item.text}"
        </p>
      </div>

      <div className="flex items-center gap-3 w-full md:w-auto justify-end">
        <audio
            ref={audioRef}
            src={url}
            onEnded={() => setIsPlaying(false)}
            onPause={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            className="hidden"
        />
        
        <button
          onClick={togglePlay}
          className="p-2 rounded-full bg-brand-600 text-white hover:bg-brand-500 transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-brand-500"
          title={isPlaying ? "Pausar" : "Reproducir"}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>

        <button
          onClick={handleDownload}
          className="p-2 rounded-full bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
          title="Descargar WAV"
        >
          <Download size={18} />
        </button>
        
        <button
            onClick={() => onDelete(item.id)}
            className="p-2 rounded-full bg-red-900/20 text-red-400 hover:bg-red-900/40 transition-colors"
            title="Eliminar"
        >
            <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
};
