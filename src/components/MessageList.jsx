import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import MessageItem from './MessageItem';
import MediaViewer from './MediaViewer';
import ChatSearchBar from './ChatSearchBar';

const ESTIMATED_HEIGHT = 160;
const BUFFER_SIZE = 8;
const BOTTOM_SPACER = 120;
// Revealed messages stay below the pinned date badge
const REVEAL_TOP_GAP = 40;

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

// Case-insensitive, "ё" matches "е"; keeps the length, so offsets map back to the original text
const normalizeForSearch = (text) => text.toLowerCase().replace(/ё/g, 'е');

const supportsHighlights = typeof CSS !== 'undefined' && !!CSS.highlights && typeof Highlight !== 'undefined';

const MessageList = ({ messages, searchOpen = false, onSearchOpenChange }) => {
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const searchInputRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const heightsRef = useRef(new Map());
  const [mountedItems, setMountedItems] = useState(new Set());
  // Global media viewer state
  const [globalViewerOpen, setGlobalViewerOpen] = useState(false);
  const [globalIndex, setGlobalIndex] = useState(0);
  // Index of the topmost visible message, for the pinned date badge
  const [topIndex, setTopIndex] = useState(0);
  const topIndexRef = useRef(0);
  topIndexRef.current = topIndex;
  // Search: query and the message index of the active result
  const [query, setQuery] = useState('');
  const [currentMatch, setCurrentMatch] = useState(-1);
  // Message being scrolled into view: { index, startedAt }
  const pendingScrollRef = useRef(null);

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

  // Scrolls the pending message into view once it is rendered; retried after every render
  // because moving the scroll position re-renders the window and re-measures heights.
  const settlePendingScroll = useCallback(() => {
    const pending = pendingScrollRef.current;
    const container = containerRef.current;
    if (!pending || !container) return;
    if (performance.now() - pending.startedAt > 2000) {
      pendingScrollRef.current = null;
      return;
    }
    const el = container.querySelector(`[data-index="${pending.index}"]`);
    if (!el) return;

    const box = container.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    if (rect.top >= box.top + REVEAL_TOP_GAP && rect.bottom <= box.bottom) {
      pendingScrollRef.current = null;
      return;
    }
    // Tall messages go right under the badge, others to the upper third
    const targetTop = rect.height > box.height - REVEAL_TOP_GAP
      ? REVEAL_TOP_GAP
      : Math.max(REVEAL_TOP_GAP, Math.min(box.height / 3, box.height - rect.height));
    const before = container.scrollTop;
    container.scrollTop = before + rect.top - box.top - targetTop;
    if (container.scrollTop === before) {
      pendingScrollRef.current = null; // clamped at the edge of the list
      return;
    }
    handleScroll();
  }, [handleScroll]);

  useEffect(settlePendingScroll);

  // Unrendered messages only have estimated positions: jump there, then settle from the DOM
  const revealMessage = useCallback((index) => {
    const container = containerRef.current;
    if (!container) return;
    pendingScrollRef.current = { index, startedAt: performance.now() };
    if (container.querySelector(`[data-index="${index}"]`)) {
      settlePendingScroll();
      return;
    }
    let offset = 0;
    for (let i = 0; i < index; i++) offset += getItemHeight(i);
    container.scrollTop = Math.max(0, offset - container.clientHeight / 3);
    handleScroll();
  }, [getItemHeight, handleScroll, settlePendingScroll]);

  // Search runs over all parsed messages: the DOM only has the rendered window,
  // which is also why the browser's own Ctrl+F can't find everything.
  const searchTexts = useMemo(() => messages.map(m => normalizeForSearch(m?.text || '')), [messages]);
  const normalizedQuery = normalizeForSearch(query);
  const searchActive = searchOpen && normalizedQuery.trim() !== '';

  const searchResults = useMemo(() => {
    if (!searchActive) return [];
    const results = [];
    searchTexts.forEach((text, i) => {
      if (text.includes(normalizedQuery)) results.push(i);
    });
    return results;
  }, [searchActive, normalizedQuery, searchTexts]);

  const goToMatch = useCallback((index) => {
    setCurrentMatch(index);
    revealMessage(index);
  }, [revealMessage]);

  // New results (query typed): start from the first match at or below the current position
  useEffect(() => {
    if (!searchResults.length) {
      setCurrentMatch(-1);
      return;
    }
    goToMatch(searchResults.find(i => i >= topIndexRef.current) ?? searchResults[0]);
  }, [searchResults, goToMatch]);

  const stepMatch = useCallback((direction) => {
    if (!searchResults.length) return;
    const target = direction > 0
      ? (searchResults.find(i => i > currentMatch) ?? searchResults[0])
      : (searchResults.findLast(i => i < currentMatch) ?? searchResults[searchResults.length - 1]);
    goToMatch(target);
  }, [searchResults, currentMatch, goToMatch]);

  const matchPosition = searchResults.indexOf(currentMatch);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyF') {
        // A second Ctrl+F inside the search box opens the browser's own find
        if (document.activeElement === searchInputRef.current) return;
        e.preventDefault();
        if (searchOpen) {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        } else {
          onSearchOpenChange(true);
        }
      } else if (e.key === 'F3' && searchOpen) {
        e.preventDefault();
        stepMatch(e.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchOpen, stepMatch, onSearchOpenChange]);

  // Paints matches in the rendered messages via the CSS Custom Highlight API (no DOM changes)
  useEffect(() => {
    if (!supportsHighlights) return;
    const container = containerRef.current;
    const matchRanges = [];
    const currentRanges = [];
    if (searchActive && container) {
      for (const block of container.querySelectorAll('[data-search-text]')) {
        const index = Number(block.closest('[data-index]')?.dataset.index);
        const ranges = index === currentMatch ? currentRanges : matchRanges;
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = normalizeForSearch(node.data);
          if (text.length !== node.data.length) continue;
          for (let pos = text.indexOf(normalizedQuery); pos !== -1; pos = text.indexOf(normalizedQuery, pos + normalizedQuery.length)) {
            const range = new Range();
            range.setStart(node, pos);
            range.setEnd(node, pos + normalizedQuery.length);
            ranges.push(range);
          }
        }
      }
    }
    CSS.highlights.set('search-match', new Highlight(...matchRanges));
    CSS.highlights.set('search-current', new Highlight(...currentRanges));
  });

  useEffect(() => () => {
    if (!supportsHighlights) return;
    CSS.highlights.delete('search-match');
    CSS.highlights.delete('search-current');
  }, []);

  return (
    <>
      {searchOpen && (
        <ChatSearchBar
          inputRef={searchInputRef}
          query={query}
          onQueryChange={setQuery}
          position={matchPosition}
          total={searchResults.length}
          onNext={() => stepMatch(1)}
          onPrev={() => stepMatch(-1)}
          onClose={() => onSearchOpenChange(false)}
        />
      )}
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
    </>
  );
};

export default MessageList;
