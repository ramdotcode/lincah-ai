'use client';

import { useState, useEffect, useRef } from 'react';
import LayoutShell from '@/components/LayoutShell';
import { 
  Send, 
  Loader2, 
  User, 
  Search,
  RefreshCw,
  MoreVertical,
  MessageSquare,
  Circle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function MonitorPage() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConv, setSelectedConv] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConv?.history]);

  const fetchConversations = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !selectedConv) return;

    setSending(true);
    try {
      const res = await fetch('/api/chat/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: selectedConv.id,
          text: message,
        }),
      });

      if (res.ok) {
        const updatedConv = {
          ...selectedConv,
          history: [...(selectedConv.history || []), { role: 'assistant', content: message }],
        };
        setSelectedConv(updatedConv);
        setMessage('');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <LayoutShell>
      <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden bg-app transition-colors">
        {/* conversations list */}
        <div className="w-80 border-r border-app flex flex-col bg-card-app transition-colors">
          <div className="p-4 flex items-center justify-between">
            <h2 className="font-bold text-main">Conversations</h2>
            <button onClick={fetchConversations} className="p-1.5 hover:bg-muted rounded-md text-muted-app">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="px-4 pb-4">
             <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app w-3.5 h-3.5" />
                <input 
                  type="text" 
                  placeholder="Find a chat..." 
                  className="w-full bg-muted border border-transparent rounded-lg px-9 py-1.5 text-xs focus:bg-card-app focus:border-blue-500/50 outline-none transition-all text-main"
                />
             </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
                <div className="p-8 text-center text-muted-app text-xs italic">
                    No active chats.
                </div>
            ) : (
                conversations.map((conv) => (
                    <button
                        key={conv.id}
                        onClick={() => setSelectedConv(conv)}
                        className={`w-full p-4 flex items-center gap-3 transition-colors border-l-4 ${
                            selectedConv?.id === conv.id 
                                ? "bg-blue-500/5 border-blue-600" 
                                : "hover:bg-muted transition-colors border-transparent"
                        }`}
                    >
                        <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm ${
                            conv.status === 'pending' ? 'bg-amber-500/10 text-amber-500' : 'bg-muted text-muted-app'
                        }`}>
                            {conv.name?.charAt(0)}
                        </div>
                        <div className="flex-1 text-left overflow-hidden">
                            <p className="text-sm font-semibold text-main truncate font-sans">{conv.name}</p>
                            <p className="text-[11px] text-muted-app truncate">
                                {conv.history[conv.history.length - 1]?.content || "No messages"}
                            </p>
                        </div>
                        {conv.status === 'pending' && (
                            <Circle className="w-2 h-2 fill-amber-500 text-amber-500" />
                        )}
                    </button>
                ))
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col relative bg-muted/30">
          <AnimatePresence mode="wait">
            {selectedConv ? (
                <motion.div 
                    key={selectedConv.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex-1 flex flex-col h-full overflow-hidden"
                >
                    {/* Header */}
                    <div className="p-4 bg-card-app border-b border-app flex items-center justify-between">
                        <div className="flex items-center gap-3">
                             <div className="w-9 h-9 rounded-full bg-blue-500/10 flex items-center justify-center font-bold text-blue-500 text-sm">
                                {selectedConv.name?.charAt(0)}
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-main">{selectedConv.name}</h3>
                                <p className="text-[10px] text-muted-app capitalize">{selectedConv.status} • @{selectedConv.username}</p>
                            </div>
                        </div>
                        <button className="p-2 hover:bg-muted rounded-lg text-muted-app">
                            <MoreVertical className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        {selectedConv.history.map((msg: any, i: number) => (
                            <div 
                                key={i}
                                className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
                            >
                                <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm ${
                                    msg.role === 'user' 
                                        ? 'bg-card-app border border-app text-main rounded-bl-none shadow-sm' 
                                        : 'bg-blue-600 text-white rounded-br-none shadow-md shadow-blue-500/10'
                                }`}>
                                    <p>{msg.content}</p>
                                </div>
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-4 bg-card-app border-t border-app">
                        <form onSubmit={handleSend} className="flex gap-4">
                            <input 
                                type="text"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Type a message to user..."
                                className="flex-1 bg-muted border border-transparent rounded-xl px-4 py-2.5 text-sm outline-none focus:bg-card-app focus:border-blue-500/50 transition-all text-main"
                            />
                            <button 
                                type="submit"
                                disabled={sending || !message.trim()}
                                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all"
                            >
                                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                Send
                            </button>
                        </form>
                    </div>
                </motion.div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-app gap-4">
                    <div className="w-16 h-16 rounded-3xl bg-card-app border border-app flex items-center justify-center shadow-sm transition-colors">
                        <MessageSquare className="w-8 h-8 opacity-20" />
                    </div>
                    <p className="font-medium text-sm">Select a lead to start monitor</p>
                </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </LayoutShell>
  );
}
