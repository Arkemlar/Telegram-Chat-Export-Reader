import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, X } from 'lucide-react';
import { useVoicePlayer, PLAYBACK_RATES, formatTime } from '../context/VoicePlayerContext';

const formatRate = (rate) => `${rate}×`;

const SpeedMenu = ({ rate, onChange }) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (e) => {
      if (!menuRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`min-w-[52px] px-2 py-1 rounded-full text-sm font-semibold tabular-nums hover:bg-gray-100 transition ${
          rate !== 1 ? 'text-blue-600' : 'text-gray-600'
        }`}
        title="Playback speed"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {formatRate(rate)}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 z-50 bg-white border border-gray-200 rounded-xl shadow py-1 min-w-[88px]">
          {PLAYBACK_RATES.map(r => (
            <button
              key={r}
              role="menuitemradio"
              aria-checked={r === rate}
              onClick={() => {
                onChange(r);
                setOpen(false);
              }}
              className={`block w-full text-left px-4 py-1.5 text-sm tabular-nums hover:bg-gray-100 ${
                r === rate ? 'text-blue-600 font-semibold' : 'text-gray-700'
              }`}
            >
              {formatRate(r)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Telegram-style player pinned under the chat header
const VoicePlayerBar = () => {
  const player = useVoicePlayer();
  if (!player?.track) return null;

  const { track, isPlaying, currentTime, duration, rate } = player;
  const iconButton = 'w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 transition disabled:opacity-30 disabled:hover:bg-transparent';

  return (
    // z-30: above the search bar (z-20), so the speed menu overlaps it
    <div className="bg-white border-b border-gray-200 shadow-sm relative z-30">
      <div className="max-w-5xl mx-auto px-4 pt-2 pb-1">
        <div className="flex items-center gap-1">
          <button onClick={player.prev} disabled={!player.hasPrev} className={iconButton} aria-label="Previous voice message">
            <SkipBack size={16} />
          </button>
          <button
            onClick={player.toggle}
            className="w-9 h-9 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center shadow transition"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button onClick={player.next} disabled={!player.hasNext} className={iconButton} aria-label="Next voice message">
            <SkipForward size={16} />
          </button>

          <div className="flex-1 min-w-0 ml-2">
            <div className="text-sm font-semibold text-gray-900 truncate">{track.from || 'Voice message'}</div>
            {track.date && <div className="text-xs text-gray-500 truncate">{track.date}</div>}
          </div>

          <div className="text-xs text-gray-500 tabular-nums mr-1">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
          <SpeedMenu rate={rate} onChange={player.setRate} />
          <button onClick={player.stop} className={iconButton} aria-label="Close player">
            <X size={16} />
          </button>
        </div>

        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          onChange={e => player.seek(parseFloat(e.target.value))}
          disabled={!duration}
          className="w-full h-4 mt-1 accent-blue-500 cursor-pointer disabled:cursor-default"
          aria-label="Seek"
        />
      </div>
    </div>
  );
};

export default VoicePlayerBar;
