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
import ConversationLabels, { Label, LABEL_STYLE } from '@/components/ConversationLabels';

export default function MonitorPage() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConv, setSelectedConv] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allLabels, setAllLabels] = useState<Label[]>([]);
  const [filterLabelId, setFilterLabelId] = useState<string>('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data || []);
        return data || [];
      }
    } finally {
      setLoading(false);
    }
    return [];
  };

  useEffect(() => {
    (async () => {
      const data = await fetchConversations();
      // Auto-buka percakapan dari link ?id= (mis. dari halaman Contacts)
      const id = new URLSearchParams(window.location.search).get('id');
      if (id) {
        const conv = data.find((c: any) => c.id === id);
        if (conv) setSelectedConv(conv);
      }
    })();
    // Label akun (fail-open: sebelum migrasi 0020, biarkan kosong)
    (async () => {
      try {
        const res = await fetch('/api/labels');
        if (res.ok) setAllLabels((await res.json()) || []);
      } catch { /* label belum tersedia */ }
    })();
  }, []);

  // Sinkronkan perubahan label percakapan ke state list + selected
  const applyConvLabels = (convId: string, labels: Label[]) => {
    setConversations(prev => prev.map(c => (c.id === convId ? { ...c, labels } : c)));
    setSelectedConv((prev: any) => (prev?.id === convId ? { ...prev, labels } : prev));
  };

  const visibleConversations = filterLabelId
    ? conversations.filter(c => (c.labels || []).some((l: Label) => l.id === filterLabelId))
    : conversations;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConv?.history]);

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
          <div className="px-4 pb-4 space-y-2">
             <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app w-3.5 h-3.5" />
                <input
                  type="text"
                  placeholder="Find a chat..."
                  className="w-full bg-muted border border-transparent rounded-lg px-9 py-1.5 text-xs focus:bg-card-app focus:border-blue-500/50 outline-none transition-all text-main"
                />
             </div>
             {allLabels.length > 0 && (
               <div className="flex flex-wrap gap-1.5">
                 <button
                   onClick={() => setFilterLabelId('')}
                   className={`px-2 py-0.5 rounded-full text-[9px] font-bold transition-colors ${
                     !filterLabelId ? 'bg-blue-600 text-white' : 'bg-muted text-muted-app hover:text-main'
                   }`}
                 >
                   All
                 </button>
                 {allLabels.map((label) => (
                   <button
                     key={label.id}
                     onClick={() => setFilterLabelId(filterLabelId === label.id ? '' : label.id)}
                     className={`px-2 py-0.5 rounded-full text-[9px] font-bold transition-all ${
                       LABEL_STYLE[label.color] || LABEL_STYLE.blue
                     } ${filterLabelId === label.id ? 'ring-1 ring-blue-500' : 'opacity-80 hover:opacity-100'}`}
                   >
                     {label.name}
                   </button>
                 ))}
               </div>
             )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {visibleConversations.length === 0 ? (
                <div className="p-8 text-center text-muted-app text-xs italic">
                    {filterLabelId ? 'No chats with this label.' : 'No active chats.'}
                </div>
            ) : (
                visibleConversations.map((conv) => (
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
                            {(conv.labels || []).length > 0 && (
                                <span className="flex flex-wrap gap-1 mt-1">
                                    {(conv.labels as Label[]).slice(0, 3).map((label) => (
                                        <span key={label.id} className={`px-1.5 py-px rounded-full text-[8px] font-bold ${LABEL_STYLE[label.color] || LABEL_STYLE.blue}`}>
                                            {label.name}
                                        </span>
                                    ))}
                                </span>
                            )}
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
        <div className="flex-1 flex flex-row relative bg-muted/30 overflow-hidden">
          <AnimatePresence mode="wait">
            {selectedConv ? (
                <>
                <motion.div 
                    key={selectedConv.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex-1 flex flex-col h-full overflow-hidden border-r border-app bg-white dark:bg-zinc-950/20"
                >
                    {/* Header */}
                    <div className="p-4 bg-card-app border-b border-app flex items-center justify-between">
                        <div className="flex items-center gap-3">
                             <div className="w-9 h-9 rounded-full bg-blue-500/10 flex items-center justify-center font-bold text-blue-500 text-sm relative">
                                {selectedConv.name?.charAt(0)}
                                <div className="absolute -bottom-1 -right-1 bg-white dark:bg-zinc-800 rounded-full p-0.5 border border-app shadow-sm">
                                    {selectedConv.platform === 'whatsapp' ? (
                                        <svg viewBox="0 0 24 24" className="w-3 h-3 fill-emerald-500"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 .004 5.412 0 12.048c0 2.123.554 4.197 1.608 6.037L0 24l6.117-1.605a11.803 11.803 0 005.925 1.586h.005c6.637 0 12.05-5.414 12.05-12.051 0-3.213-1.25-6.232-3.522-8.504z"/></svg>
                                    ) : (
                                        <Circle className="w-2.5 h-2.5 fill-blue-500 text-blue-500" />
                                    )}
                                </div>
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-main">{selectedConv.name}</h3>
                                <p className="text-[10px] text-muted-app font-medium tracking-tight">
                                    Status: <span className={selectedConv.status === 'pending' ? 'text-amber-500 font-bold' : 'text-emerald-500 font-bold'}>{selectedConv.status.toUpperCase()}</span>
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {selectedConv.status === 'pending' ? (
                                <button 
                                    onClick={async () => {
                                        const res = await fetch(`/api/conversations/status`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ id: selectedConv.id, status: 'active' })
                                        });
                                        if (res.ok) {
                                            setSelectedConv({...selectedConv, status: 'active'});
                                            fetchConversations();
                                        }
                                    }}
                                    className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 rounded-lg text-[10px] font-bold transition-all border border-emerald-500/20"
                                >
                                    Activate AI Mode
                                </button>
                            ) : (
                                <button 
                                    onClick={async () => {
                                        const res = await fetch(`/api/conversations/status`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ id: selectedConv.id, status: 'pending' })
                                        });
                                        if (res.ok) {
                                            setSelectedConv({...selectedConv, status: 'pending'});
                                            fetchConversations();
                                        }
                                    }}
                                    className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 rounded-lg text-[10px] font-bold transition-all border border-amber-500/20"
                                >
                                    Switch to Manual
                                </button>
                            )}
                        </div>
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
                                    {msg.followup && (
                                        <span className="inline-block mb-1 px-1.5 py-0.5 rounded bg-white/20 text-[9px] font-bold uppercase tracking-wider">
                                            ⏰ Auto Follow-up
                                        </span>
                                    )}
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

                {/* AI Copilot Sidebar */}
                <div className="w-72 bg-card-app flex flex-col h-full overflow-hidden shadow-xl z-10 transition-colors">
                    <div className="p-4 border-b border-app flex items-center gap-2">
                        <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center">
                            <RefreshCw className="w-4 h-4 text-purple-600" />
                        </div>
                        <h3 className="text-xs font-bold text-main uppercase tracking-wider">AI Copilot</h3>
                    </div>
                    
                    <div className="flex-1 p-4 overflow-y-auto space-y-6">
                        <ConversationLabels
                            conversationId={selectedConv.id}
                            labels={selectedConv.labels || []}
                            allLabels={allLabels}
                            onLabelsChange={(labels) => applyConvLabels(selectedConv.id, labels)}
                            onLabelCreated={(label) => setAllLabels(prev => [...prev, label])}
                            onLabelUpdated={(label) => setAllLabels(prev => prev.map(l => (l.id === label.id ? label : l)))}
                            onLabelDeleted={(labelId) => {
                                setAllLabels(prev => prev.filter(l => l.id !== labelId));
                                if (filterLabelId === labelId) setFilterLabelId('');
                                // label yang dihapus ikut lenyap dari semua percakapan (FK cascade)
                                setConversations(prev => prev.map(c => ({
                                    ...c,
                                    labels: (c.labels || []).filter((l: Label) => l.id !== labelId),
                                })));
                                setSelectedConv((prev: any) => prev ? {
                                    ...prev,
                                    labels: (prev.labels || []).filter((l: Label) => l.id !== labelId),
                                } : prev);
                            }}
                        />

                        <div className="space-y-3 pt-4 border-t border-app">
                            <p className="text-[10px] text-muted-app font-medium leading-relaxed">
                                Get a drafting suggestion based on the context of this conversation.
                            </p>
                            <button 
                                onClick={async () => {
                                    setIsSuggesting(true);
                                    try {
                                        const res = await fetch('/api/ai/suggest', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ conversationId: selectedConv.id })
                                        });
                                        if (res.ok) {
                                            const data = await res.json();
                                            setSuggestion(data.suggestion);
                                        }
                                    } finally {
                                        setIsSuggesting(false);
                                    }
                                }}
                                disabled={isSuggesting}
                                className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white text-[11px] font-bold rounded-lg flex items-center justify-center gap-2 transition-all shadow-md shadow-purple-500/10"
                            >
                                {isSuggesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                Generate Draft
                            </button>
                        </div>

                        {suggestion && (
                            <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-3"
                            >
                                <div className="p-3 bg-muted/50 rounded-xl border border-app relative group">
                                    <textarea 
                                        value={suggestion}
                                        onChange={(e) => setSuggestion(e.target.value)}
                                        className="w-full bg-transparent text-[11px] text-main outline-none min-h-[150px] resize-none leading-relaxed"
                                    />
                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => setSuggestion('')} className="p-1 hover:bg-red-50 text-red-400 rounded">
                                            <MoreVertical className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => {
                                        setMessage(suggestion);
                                        setSuggestion('');
                                    }}
                                    className="w-full py-2 border border-purple-500/30 text-purple-600 hover:bg-purple-50 text-[10px] font-bold rounded-lg transition-all"
                                >
                                    Copy to Input Box
                                </button>
                            </motion.div>
                        )}

                        <div className="pt-6 border-t border-app">
                            <h4 className="text-[10px] font-bold text-muted-app uppercase tracking-widest mb-3">Quick Actions</h4>
                            <div className="space-y-2">
                                {["Ask for email", "Ask for budget", "Schedule a call"].map((act) => (
                                    <button 
                                        key={act}
                                        onClick={() => setMessage(prev => prev + (prev ? " " : "") + act)}
                                        className="w-full text-left px-3 py-2 bg-muted/30 hover:bg-muted text-[10px] text-main rounded-lg transition-colors border border-transparent hover:border-app"
                                    >
                                        {act}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
                </>
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
