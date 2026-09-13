import React from 'react';
import { Send, FolderOpen, Shield, MessageCircle, ChevronRight } from 'lucide-react';

const EmptyState = ({ onLoadClick, loading, progress, chats }) => {
  if (loading) {
    return (
      <div className="text-center py-20">
        <div className="flex justify-center mb-6">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500"></div>
        </div>
        <p className="text-gray-600 font-medium">Loading messages...</p>
        {progress && (
          <div className="mt-6 max-w-xs mx-auto">
            <div className="bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-400 to-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-500 mt-2">{Math.round(progress)}%</p>
          </div>
        )}
      </div>
    );
  }

  const hasChats = chats?.length > 0;

  return (
    <div className="text-center py-24 px-4">
      <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-50 rounded-full mb-6">
        <Send className="w-10 h-10 text-blue-500" />
      </div>

      {hasChats ? (
        <>
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Выберите чат</h2>
          {/* Exports mounted into the container (/chats/) */}
          <div className="max-w-md mx-auto mb-8 text-left bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            {chats.map(chat => (
              <a
                key={chat.name}
                href={chat.href}
                className="flex items-center gap-3 px-4 py-3 border-t border-gray-200 first:border-t-0 hover:bg-gray-100 transition"
              >
                <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <MessageCircle className="w-5 h-5 text-blue-500" />
                </div>
                <span className="flex-1 min-w-0 truncate font-medium text-gray-900">{chat.name}</span>
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              </a>
            ))}
          </div>
          <p className="text-gray-500 mb-4">или откройте папку экспорта с диска</p>
        </>
      ) : (
        <>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Chat Loaded</h2>
          <p className="text-gray-500 mb-8">Load a Telegram export folder to view the conversation</p>
        </>
      )}

      <button
        onClick={onLoadClick}
        className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-3 rounded-full font-medium transition inline-flex items-center gap-2"
      >
        <FolderOpen className="w-5 h-5" />
        Load Telegram Export
      </button>

      <div className="mt-12 pt-8 border-t border-gray-200">
        <div className="inline-flex items-start gap-3 text-left bg-green-50 p-4 rounded-lg max-w-md">
          <Shield className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-green-900">100% Private & Local</p>
            <p className="text-sm text-green-700 mt-1">All processing happens in your browser. Your data is never uploaded or stored anywhere.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmptyState;
