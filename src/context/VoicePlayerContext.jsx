import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export const PLAYBACK_RATES = [1, 1.25, 1.5, 1.75, 2];
const RATE_STORAGE_KEY = 'voicePlaybackRate';

const loadRate = () => {
  try {
    const saved = parseFloat(localStorage.getItem(RATE_STORAGE_KEY));
    return PLAYBACK_RATES.includes(saved) ? saved : 1;
  } catch {
    return 1;
  }
};

export const formatTime = (t) => {
  if (!t || !isFinite(t)) return '0:00';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const VoicePlayerContext = createContext(null);

export const useVoicePlayer = () => useContext(VoicePlayerContext);

// One <audio> element for the whole app: it survives message list virtualization
// (messages unmount when scrolled out of view) and guarantees one voice at a time.
// tracks: [{ url, from, date }] — all voice messages of the chat in order.
export const VoicePlayerProvider = ({ tracks, children }) => {
  const [audio] = useState(() => new Audio());
  const [track, setTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRateState] = useState(loadRate);

  // Refs for audio event handlers, which outlive a single render
  const trackRef = useRef(null);
  const tracksRef = useRef(tracks);
  const rateRef = useRef(rate);
  tracksRef.current = tracks;

  const playTrack = useCallback((next) => {
    if (!next) return;
    if (trackRef.current?.url !== next.url) {
      audio.src = next.url;
      setCurrentTime(0);
      setDuration(0);
    }
    trackRef.current = next;
    setTrack(next);
    // A new source resets playbackRate to defaultPlaybackRate, so set both
    audio.defaultPlaybackRate = rateRef.current;
    audio.playbackRate = rateRef.current;
    audio.play().catch(() => {});
  }, [audio]);

  const playRelative = useCallback((offset) => {
    const list = tracksRef.current;
    const index = list.findIndex(t => t.url === trackRef.current?.url);
    if (index !== -1) playTrack(list[index + offset]);
  }, [playTrack]);

  useEffect(() => {
    const onTime = () => setCurrentTime(audio.currentTime || 0);
    const onDuration = () => setDuration(isFinite(audio.duration) ? audio.duration : 0);
    const onMetadata = () => {
      audio.playbackRate = rateRef.current;
      onDuration();
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    // Like Telegram: continue with the next voice message
    const onEnded = () => playRelative(1);

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('durationchange', onDuration);
    audio.addEventListener('loadedmetadata', onMetadata);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('durationchange', onDuration);
      audio.removeEventListener('loadedmetadata', onMetadata);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.pause();
    };
  }, [audio, playRelative]);

  const toggle = useCallback(() => {
    if (!trackRef.current) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }, [audio]);

  const toggleUrl = useCallback((url) => {
    if (trackRef.current?.url === url) toggle();
    else playTrack(tracksRef.current.find(t => t.url === url) || { url });
  }, [toggle, playTrack]);

  const seek = useCallback((time) => {
    if (!trackRef.current) return;
    audio.currentTime = time;
    setCurrentTime(time);
  }, [audio]);

  const setRate = useCallback((value) => {
    rateRef.current = value;
    setRateState(value);
    audio.defaultPlaybackRate = value;
    audio.playbackRate = value;
    try {
      localStorage.setItem(RATE_STORAGE_KEY, String(value));
    } catch {
      // Storage unavailable: the rate still applies for this session
    }
  }, [audio]);

  const stop = useCallback(() => {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    trackRef.current = null;
    setTrack(null);
    setCurrentTime(0);
    setDuration(0);
  }, [audio]);

  const next = useCallback(() => playRelative(1), [playRelative]);
  const prev = useCallback(() => playRelative(-1), [playRelative]);

  const index = track ? tracks.findIndex(t => t.url === track.url) : -1;

  const value = useMemo(() => ({
    track,
    isPlaying,
    currentTime,
    duration,
    rate,
    hasPrev: index > 0,
    hasNext: index !== -1 && index < tracks.length - 1,
    toggle,
    toggleUrl,
    seek,
    setRate,
    next,
    prev,
    stop
  }), [track, isPlaying, currentTime, duration, rate, index, tracks.length, toggle, toggleUrl, seek, setRate, next, prev, stop]);

  return <VoicePlayerContext.Provider value={value}>{children}</VoicePlayerContext.Provider>;
};
