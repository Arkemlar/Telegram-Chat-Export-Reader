import React, { useEffect } from 'react';
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';

// In-chat search bar; the search itself lives in MessageList
const ChatSearchBar = ({ inputRef, query, onQueryChange, position, total, onNext, onPrev, onClose }) => {
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [inputRef]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) onPrev();
      else onNext();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const hasQuery = query.trim() !== '';
  const iconButton = 'w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 transition disabled:opacity-30 disabled:hover:bg-transparent';

  let counter = 'Нет совпадений';
  if (total) counter = position >= 0 ? `${position + 1} из ${total}` : `Найдено: ${total}`;

  return (
    <div className="bg-white border-b border-gray-200 shadow-sm relative z-20">
      <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-2">
        <Search size={16} className="text-gray-400 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Поиск по сообщениям"
          aria-label="Поиск по сообщениям"
          className="flex-1 min-w-0 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
        />
        {hasQuery && (
          <span className="text-xs text-gray-500 tabular-nums whitespace-nowrap">{counter}</span>
        )}
        <button onClick={onPrev} disabled={!total} className={iconButton} aria-label="Предыдущее совпадение" title="Предыдущее (Shift+Enter)">
          <ChevronUp size={18} />
        </button>
        <button onClick={onNext} disabled={!total} className={iconButton} aria-label="Следующее совпадение" title="Следующее (Enter)">
          <ChevronDown size={18} />
        </button>
        <button onClick={onClose} className={iconButton} aria-label="Закрыть поиск" title="Закрыть (Esc)">
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default ChatSearchBar;
