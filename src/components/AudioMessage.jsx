import React, { useMemo } from 'react';
import { Play, Pause } from 'lucide-react';
import { useVoicePlayer, formatTime } from '../context/VoicePlayerContext';

const BARS = 20;

// Pseudo-random waveform seeded by the URL, so it stays the same when the message remounts
const waveFor = (url) => {
  let seed = 0;
  for (let i = 0; i < url.length; i++) seed = (seed * 31 + url.charCodeAt(i)) >>> 0;
  return Array.from({ length: BARS }, () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return ((seed >>> 16) / 0xffff) * 0.8 + 0.2;
  });
};

// Playback itself lives in VoicePlayerContext; this is only the in-message view of it
const AudioMessage = ({ url, duration }) => {
  const player = useVoicePlayer();
  const waveData = useMemo(() => waveFor(url || ''), [url]);

  const isCurrent = player.track?.url === url;
  const isPlaying = isCurrent && player.isPlaying;
  const progress = isCurrent && player.duration > 0 ? player.currentTime / player.duration : 0;

  const handleWaveClick = (e) => {
    if (!isCurrent || !player.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    player.seek(((e.clientX - rect.left) / rect.width) * player.duration);
  };

  // Export gives "01:33"; show "1:33" like formatTime
  const exportDuration = duration?.trim().replace(/^0(\d:)/, '$1') || '0:00';

  return (
    <div className="flex items-center gap-3 bg-gradient-to-r from-blue-50 to-blue-100 rounded-2xl px-4 py-3 max-w-sm shadow-sm">
      <button
        onClick={() => player.toggleUrl(url)}
        className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500 hover:bg-blue-600 transition-colors flex items-center justify-center text-white shadow"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause size={18} /> : <Play size={18} />}
      </button>

      <div
        className={`flex-1 flex items-center gap-1 h-8 ${isCurrent ? 'cursor-pointer' : ''}`}
        onClick={handleWaveClick}
      >
        {waveData.map((w, i) => {
          const barProgress = i / waveData.length;
          const isActive = isCurrent && barProgress <= progress;
          const height = `${Math.max(2, Math.round(w * 100))}%`;
          return (
            <div
              key={i}
              className={`rounded-full transition-all duration-150 ${isActive ? 'bg-blue-500' : 'bg-blue-300'}`}
              style={{ height, flex: '1 1 0', minWidth: 2, opacity: isActive ? 1 : 0.6 }}
            />
          );
        })}
      </div>

      <div className="text-xs font-medium text-gray-700 min-w-[40px] text-right tabular-nums">
        {isCurrent && player.duration > 0
          ? formatTime(Math.max(0, player.duration - player.currentTime))
          : exportDuration}
      </div>
    </div>
  );
};

export default AudioMessage;
