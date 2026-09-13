import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import MessageItem from './MessageItem';
import MediaViewer from './MediaViewer';

const ESTIMATED_HEIGHT = 160;
const BUFFER_SIZE = 8;
const BOTTOM_SPACER = 120;

// "20.10.2023 13:58:12 UTC+03:00" -> "Пятница, 20 октября 2023 г."
const dayLabelCache = new Map();
const formatDay = (date) => {
  const match = date?.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) return '';
  const key = match[0];
  if (!dayLabelCache.has(key)) {
    const [, d, m, y] = match;
    const label = new Date(+y, +m - 1, +d).toLocaleDateString('ru-RU', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    dayLabelCache.set(key, label.charAt(0).toUpperCase() + label.slice(1));
  }
  return dayLabelCache.get(key);
};

const MessageList = ({ messages }) => {
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const heightsRef = useRef(new Map());
  const [mountedItems, setMountedItems] = useState(new Set());
  // Global media viewer state
  const [globalViewerOpen, setGlobalViewerOpen] = useState(false);
  const [globalIndex, setGlobalIndex] = useState(0);
  // Index of the topmost visible message, for the pinned date badge
  const [topIndex, setTopIndex] = useState(0);

  // Day label for every message. Service messages (e.g. the day separator) have no date
  // and take the next message's day; trailing ones fall back to the previous day.
  const dayLabels = useMemo(() => {
    const labels = new Array(messages.length).fill('');
    let next = '';
    for (let i = messages.length - 1; i >= 0; i--) {
      next = formatDay(messages[i].date) || next;
      labels[i] = next;
    }
    for (let i = 1; i < labels.length; i++) {
      if (!labels[i]) labels[i] = labels[i - 1];
    }
    return labels;
  }, [messages]);

  // Build a flat list of all media (photos/videos/gifs/animations/round_video) across messages
  const globalMedia = useMemo(() => {
    const list = [];
    messages.forEach((msg, msgIdx) => {
      const media = (msg.media || []).filter(m => m && typeof m === 'object' && m.type);
      media.forEach((m, mediaIdx) => {
        // Only include types we want to browse globally (exclude round_video - play inline only)
        if (["photo", "video", "gif", "animation"].includes(m.type)) {
          list.push({ item: m, messageIndex: msgIdx, mediaIndex: mediaIdx });
        }
      });
    });
    return list;
  }, [messages]);

  const openGlobalMedia = useCallback((messageIdx, mediaIdx) => {
    // find global index
    const idx = globalMedia.findIndex(g => g.messageIndex === messageIdx && g.mediaIndex === mediaIdx);
    if (idx !== -1) {
      setGlobalIndex(idx);
      setGlobalViewerOpen(true);
    }
  }, [globalMedia]);

  const closeGlobalViewer = useCallback(() => setGlobalViewerOpen(false), []);

  const handleGlobalNext = useCallback(() => {
    setGlobalIndex(i => Math.min(i + 1, globalMedia.length - 1));
  }, [globalMedia.length]);

  const handleGlobalPrev = useCallback(() => {
    setGlobalIndex(i => Math.max(i - 1, 0));
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleResize = () => {
      setContainerHeight(container.clientHeight);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const nextScrollTop = Math.min(container.scrollTop, maxScrollTop);
    setScrollTop(nextScrollTop);
  }, []);

  const setItemHeight = useCallback((index, height) => {
    if (height > 0 && heightsRef.current.get(index) !== height) {
      heightsRef.current.set(index, height);
      setMountedItems(new Set(heightsRef.current.keys()));
    }
  }, []);

  const getItemHeight = useCallback((index) => {
    return heightsRef.current.get(index) || ESTIMATED_HEIGHT;
  }, []);

  // Calculate visible range
  const getVisibleRange = useCallback(() => {
    if (!messages.length || !containerHeight) {
      return { startIndex: 0, endIndex: Math.min(20, messages.length), offsetY: 0 };
    }

    let accumulatedHeight = 0;
    let startIndex = 0;
    let endIndex = messages.length;
    let startOffset = 0;

    // Find start index
    for (let i = 0; i < messages.length; i++) {
      const itemHeight = getItemHeight(i);
      
      if (accumulatedHeight + itemHeight >= scrollTop) {
        startIndex = Math.max(0, i - BUFFER_SIZE);
        break;
      }
      accumulatedHeight += itemHeight;
    }

    // Calculate start offset
    startOffset = 0;
    for (let i = 0; i < startIndex; i++) {
      startOffset += getItemHeight(i);
    }

    // Find end index
    accumulatedHeight = startOffset;
    for (let i = startIndex; i < messages.length; i++) {
      const itemHeight = getItemHeight(i);
      accumulatedHeight += itemHeight;
      
      if (accumulatedHeight >= scrollTop + containerHeight + (BUFFER_SIZE * ESTIMATED_HEIGHT)) {
        endIndex = Math.min(messages.length, i + 1);
        break;
      }
    }

    return { startIndex, endIndex, offsetY: startOffset };
  }, [messages, scrollTop, containerHeight, getItemHeight]);

  const { startIndex, endIndex, offsetY } = getVisibleRange();

  // Calculate total height
  const totalHeight = messages.reduce((sum, _, index) => {
    return sum + getItemHeight(index);
  }, 0) + BOTTOM_SPACER;

  // Make sure we don't slice beyond array bounds
  const safeStartIndex = Math.max(0, Math.min(startIndex, messages.length - 1));
  const safeEndIndex = Math.max(0, Math.min(endIndex, messages.length));
  
  const visibleMessages = messages.slice(safeStartIndex, safeEndIndex);

  // Measured from the DOM: estimated heights drift, real positions don't
  const updateTopIndex = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const top = container.getBoundingClientRect().top;
    for (const el of container.querySelectorAll('[data-index]')) {
      if (el.getBoundingClientRect().bottom > top) {
        setTopIndex(Number(el.dataset.index));
        return;
      }
    }
  }, []);

  // After every render (scroll, re-measured heights)...
  useEffect(updateTopIndex);

  // ...and when content resizes on its own (images, stickers loading)
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new ResizeObserver(updateTopIndex);
    observer.observe(list);
    return () => observer.disconnect();
  }, [updateTopIndex]);

  const currentDay = dayLabels[Math.min(topIndex, dayLabels.length - 1)];

  return (
    <div 
      ref={containerRef}
      className="flex-1 overflow-y-auto overscroll-y-contain bg-white pb-20"
      onScroll={handleScroll}
    >
      {/* Pinned date badge; zero height so it doesn't shift the virtualized list */}
      {currentDay && (
        <div className="sticky top-0 z-10 h-0 flex items-start justify-center pointer-events-none">
          <div className="mt-2 px-3 py-1 rounded-full bg-white border border-gray-200 shadow-sm text-xs font-medium text-gray-700 whitespace-nowrap">
            {currentDay}
          </div>
        </div>
      )}
      {globalViewerOpen && globalMedia[globalIndex] && (
        <MediaViewer
          item={globalMedia[globalIndex].item}
          onClose={closeGlobalViewer}
          onNext={handleGlobalNext}
          onPrev={handleGlobalPrev}
          hasNext={globalIndex < globalMedia.length - 1}
          hasPrev={globalIndex > 0}
          currentIndex={globalIndex + 1}
          totalIndex={globalMedia.length}
        />
      )}
      <div className="max-w-5xl mx-auto px-4 py-6 pb-32">
        <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
          <div 
            style={{ 
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${offsetY}px)`,
            }}
            ref={listRef}
          >
            {visibleMessages.map((msg, idx) => {
              const actualIndex = safeStartIndex + idx;
              if (!msg || actualIndex >= messages.length) return null;
              
              return (
                <MessageItem 
                  key={msg.id} 
                  message={msg}
                  index={actualIndex}
                  onHeightChange={setItemHeight}
                  onOpenGlobalMedia={(localIndex) => openGlobalMedia(actualIndex, localIndex)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageList;