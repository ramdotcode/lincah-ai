'use client';

// Halaman chat widget (Fase E3) — dirender di dalam iframe di website pelanggan.
// Tanpa LayoutShell/auth: publik, hanya bicara ke /api/widget/chat.

import { useState, useEffect, useRef, use } from 'react';
import { Send, Loader2, MessageCircle } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function getSessionId(botId: string): string {
  const key = `lincah-widget-session-${botId}`;
  let id = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, '').slice(0, 32);
    localStorage.setItem(key, id);
  }
  return id;
}

export default function WidgetPage({ params }: { params: Promise<{ botId: string }> }) {
  const { botId } = use(params);
  const [botName, setBotName] = useState('Chat');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [waitingHuman, setWaitingHuman] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/widget/chat?botId=${botId}`);
        if (!res.ok) {
          setAvailable(false);
          return;
        }
        const info = await res.json();
        setBotName(info.name || 'Chat');
        setAvailable(true);

        const stored = localStorage.getItem(`lincah-widget-history-${botId}`);
        if (stored) {
          setMessages(JSON.parse(stored));
        } else if (info.welcome_message) {
          setMessages([{ role: 'assistant', content: info.welcome_message }]);
        }
      } catch {
        setAvailable(false);
      }
    })();
  }, [botId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (messages.length > 0) {
      localStorage.setItem(`lincah-widget-history-${botId}`, JSON.stringify(messages.slice(-50)));
    }
  }, [messages, botId]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setSending(true);

    try {
      const res = await fetch('/api/widget/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, sessionId: getSessionId(botId), message: text }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.reply) {
          setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
        }
        if (data.handoff || data.status === 'pending') {
          setWaitingHuman(true);
        }
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Maaf, terjadi kendala. Coba lagi ya.' }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Tidak bisa terhubung ke server. Cek koneksi lalu coba lagi.' }]);
    } finally {
      setSending(false);
    }
  };

  if (available === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!available) {
    return (
      <div className="flex items-center justify-center h-screen bg-white p-6 text-center">
        <p className="text-sm text-gray-500">Live chat sedang tidak tersedia.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="px-4 py-3 bg-blue-600 text-white flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
          <MessageCircle className="w-4 h-4" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight">{botName}</p>
          <p className="text-[10px] opacity-80 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full inline-block" />
            {waitingHuman ? 'Menunggu admin' : 'Online'}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-md'
                : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md shadow-sm'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 px-4 py-2.5 rounded-2xl rounded-bl-md shadow-sm">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            </div>
          </div>
        )}
        {waitingHuman && (
          <p className="text-center text-[11px] text-amber-600 font-medium py-2">
            Percakapan diteruskan ke admin. Mohon tunggu ya 🙏
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="p-3 border-t border-gray-200 bg-white shrink-0">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tulis pesan..."
            maxLength={2000}
            className="w-full bg-gray-100 rounded-full pl-4 pr-12 py-3 text-[13px] text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center text-white hover:bg-blue-700 transition-all disabled:bg-gray-300"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-center text-[9px] text-gray-400 mt-2">Powered by Lincah.AI</p>
      </form>
    </div>
  );
}
