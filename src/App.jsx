import React, { useState, useEffect, useRef, useMemo } from 'react';
import ChatHeader from './components/ChatHeader';
import MessageList from './components/MessageList';
import EmptyState from './components/EmptyState';
import VoicePlayerBar from './components/VoicePlayerBar';
import { VoicePlayerProvider } from './context/VoicePlayerContext';
import { parseHTML, listRemoteFolder } from './utils/fileHandler';
import { parseMessage } from './utils/parser';

// Folder of chat exports, served by nginx as a JSON listing (see nginx.conf); optional
const CHATS_URL = `${import.meta.env.BASE_URL}chats/`;

const App = () => {
  const [messages, setMessages] = useState([]);
  const [chatTitle, setChatTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark';
    }
    return false;
  });
  const [searchOpen, setSearchOpen] = useState(false);
  // [{ name, href }] from CHATS_URL; empty when nothing is mounted there
  const [chats, setChats] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Auto-load an export folder served over HTTP: /?chat=/chat/
  useEffect(() => {
    const chatUrl = new URLSearchParams(window.location.search).get('chat');
    if (!chatUrl) return;

    (async () => {
      setLoading(true);
      try {
        const baseUrl = chatUrl.endsWith('/') ? chatUrl : chatUrl + '/';
        const files = await listRemoteFolder(baseUrl, 'chat');
        await loadChat(files, 'chat');
      } catch (err) {
        alert(`Failed to load chat from ${chatUrl}: ${err.message}`);
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    fetch(CHATS_URL)
      .then(res => (res.ok ? res.json() : []))
      .then(entries => {
        setChats(entries
          .filter(e => e.type === 'directory' && !e.name.startsWith('.'))
          .map(e => ({
            name: e.name,
            // Links reuse the ?chat= loader, so they work as bookmarks and in new tabs
            href: `?chat=${encodeURIComponent(`${CHATS_URL}${encodeURIComponent(e.name)}/`)}`
          }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ru')));
      })
      .catch(() => setChats([]));
  }, []);

  const loadChat = async (files, basePath) => {
    setLoading(true);
    setProgress(0);
    setMessages([]);
    setSearchOpen(false);

    // Telegram splits big exports into messages.html, messages2.html, messages3.html, ...
    const pages = files
      .map(file => {
        const match = file.webkitRelativePath.match(/^[^/]+\/messages(\d*)\.html$/);
        return match && { file, page: match[1] ? parseInt(match[1], 10) : 1 };
      })
      .filter(Boolean)
      .sort((a, b) => a.page - b.page)
      .map(({ file }) => file);

    if (pages.length === 0) {
      alert('No messages.html file found in the selected folder');
      setLoading(false);
      return;
    }

    const docs = [];
    for (const page of pages) {
      docs.push(parseHTML(await page.text()));
    }

    const title = docs[0].querySelector('.page_header .text')?.textContent.trim() || 'Chat';
    setChatTitle(title);
    document.title = title;

    const messageElements = docs.flatMap(doc => Array.from(doc.querySelectorAll('.message')));
    const parsedMessages = [];

    const BATCH_SIZE = 100;
    for (let i = 0; i < messageElements.length; i += BATCH_SIZE) {
      const batch = messageElements.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(msgEl => parseMessage(msgEl, files, basePath));
      const batchResults = await Promise.all(batchPromises);
      parsedMessages.push(...batchResults);

      setMessages([...parsedMessages]);
      setProgress((parsedMessages.length / messageElements.length) * 100);

      await new Promise(resolve => setTimeout(resolve, 0));
    }

    // Post-process to link quoted messages
    const messagesWithQuotes = parsedMessages.map(msg => {
      if (msg.replyTo && msg.replyTo.messageId && !msg.replyTo.isAnotherChat) {
        // Find the quoted message
        const quotedMsg = parsedMessages.find(m => {
          const msgId = m.id.replace('message', '');
          return msgId === msg.replyTo.messageId.toString();
        });

        if (quotedMsg) {
          return {
            ...msg,
            replyTo: {
              ...msg.replyTo,
              quotedMessage: quotedMsg
            }
          };
        }
      }
      return msg;
    });

    setMessages(messagesWithQuotes);
    setLoading(false);
    setProgress(0);
  };

  // Playlist for the voice player; "joined" messages have no sender, so carry the last one
  const voiceTracks = useMemo(() => {
    const tracks = [];
    let lastFrom = '';
    for (const msg of messages) {
      if (msg.type !== 'message') continue;
      if (msg.from) lastFrom = msg.from;
      for (const item of msg.media || []) {
        if (item.type === 'voice') {
          tracks.push({
            url: item.url,
            from: msg.from || lastFrom,
            // "30.12.2023 23:26:26 UTC+03:00" -> "30.12.2023 23:26"
            date: msg.date ? msg.date.replace(/:\d{2} UTC.*$/, '') : msg.time
          });
        }
      }
    }
    return tracks;
  }, [messages]);

  const handleFolderSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const basePath = files[0].webkitRelativePath.split('/')[0];
    await loadChat(files, basePath);
  };

  return (
    <VoicePlayerProvider tracks={voiceTracks}>
      <div className="h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col app-shell">
        <ChatHeader
          chatTitle={chatTitle}
          isDarkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(prevMode => !prevMode)}
          onLoadClick={() => fileInputRef.current?.click()}
          onSearchClick={messages.length > 0 ? () => setSearchOpen(open => !open) : undefined}
          chatsHref={messages.length > 0 && chats?.length ? import.meta.env.BASE_URL : undefined}
        />
        <VoicePlayerBar />

        {messages.length === 0 ? (
          <div className="flex-1 overflow-y-auto">
            <EmptyState
              loading={loading}
              progress={loading ? progress : null}
              chats={chats}
              onLoadClick={() => fileInputRef.current?.click()}
            />
          </div>
        ) : (
          <MessageList messages={messages} searchOpen={searchOpen} onSearchOpenChange={setSearchOpen} />
        )}

        <input
          ref={fileInputRef}
          type="file"
          webkitdirectory="true"
          directory="true"
          multiple
          onChange={handleFolderSelect}
          className="hidden"
        />
      </div>
    </VoicePlayerProvider>
  );
};

export default App;
