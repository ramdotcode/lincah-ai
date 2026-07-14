'use client';

import { useState, useEffect, useMemo } from 'react';
import LayoutShell from '@/components/LayoutShell';
import { format } from 'date-fns';
import { Search, History, User, Users, Loader2, MessageCircle, Send } from 'lucide-react';

interface Contact {
  key: string;
  name: string | null;
  username: string | null;
  chat_id: string;
  platform: string;
  conversationCount: number;
  lastConversationId: string;
  lastStage: string;
  lastMessageAt: string | null;
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === 'whatsapp') {
    return <MessageCircle className="w-3.5 h-3.5 text-green-500" aria-label="WhatsApp" />;
  }
  return <Send className="w-3.5 h-3.5 text-sky-500" aria-label="Telegram" />;
}

const STAGE_COLOR: Record<string, string> = {
  new: 'text-blue-500',
  interested: 'text-cyan-500',
  negotiating: 'text-amber-500',
  won: 'text-green-500',
  lost: 'text-red-500',
};

export default function ContactsPage() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/conversations');
        if (res.ok) setConversations((await res.json()) || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Satu kontak = satu identitas unik (platform + chat_id) lintas semua bot.
  const contacts = useMemo<Contact[]>(() => {
    const map = new Map<string, Contact>();
    for (const c of conversations) {
      const key = `${c.platform}:${c.chat_id}`;
      const existing = map.get(key);
      if (existing) {
        existing.conversationCount += 1;
        // /api/conversations sudah terurut last_message_at desc,
        // jadi entri pertama per kontak adalah yang terbaru.
        if (!existing.name && c.name) existing.name = c.name;
        if (!existing.username && c.username) existing.username = c.username;
      } else {
        map.set(key, {
          key,
          name: c.name || null,
          username: c.username || null,
          chat_id: c.chat_id,
          platform: c.platform,
          conversationCount: 1,
          lastConversationId: c.id,
          lastStage: c.stage || 'new',
          lastMessageAt: c.last_message_at || null,
        });
      }
    }
    return Array.from(map.values());
  }, [conversations]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [c.name, c.username, c.chat_id].some((v) => v && String(v).toLowerCase().includes(q))
    );
  }, [contacts, search]);

  return (
    <LayoutShell>
      <div className="p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center">
            <Users className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-main">Contacts</h1>
            <p className="text-xs text-muted-app">
              {contacts.length} pelanggan unik dari semua percakapan bot kamu.
            </p>
          </div>
        </div>

        <div className="bg-card-app border border-app rounded-xl overflow-hidden shadow-sm transition-colors">
          <div className="p-4 border-b border-app">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app w-4 h-4" />
              <input
                type="text"
                placeholder="Search contacts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-muted border border-transparent rounded-lg px-10 py-2 text-sm focus:bg-card-app focus:border-blue-500/50 outline-none transition-all text-main"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted">
                  <th className="px-6 py-3 font-semibold text-muted-app text-xs uppercase tracking-wider">Contact</th>
                  <th className="px-6 py-3 font-semibold text-muted-app text-xs uppercase tracking-wider">Username</th>
                  <th className="px-6 py-3 font-semibold text-muted-app text-xs uppercase tracking-wider">Conversations</th>
                  <th className="px-6 py-3 font-semibold text-muted-app text-xs uppercase tracking-wider">Stage</th>
                  <th className="px-6 py-3 font-semibold text-muted-app text-xs uppercase tracking-wider">Last Seen</th>
                  <th className="px-6 py-3 font-semibold text-muted-app text-xs uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app">
                {filteredContacts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-muted-app text-sm italic">
                      No contacts found yet.
                    </td>
                  </tr>
                ) : (
                  filteredContacts.map((contact) => (
                    <tr key={contact.key} className="hover:bg-muted transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 font-bold text-xs">
                            {contact.name?.charAt(0) || <User className="w-4 h-4" />}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-main flex items-center gap-1.5">
                              {contact.name || 'Anonymous'} <PlatformIcon platform={contact.platform} />
                            </p>
                            <p className="text-[10px] text-muted-app">{contact.chat_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-app text-sm">
                        @{contact.username || 'n/a'}
                      </td>
                      <td className="px-6 py-4 text-main text-sm font-semibold">
                        {contact.conversationCount}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-muted ${STAGE_COLOR[contact.lastStage] || 'text-blue-500'}`}>
                          {contact.lastStage}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-app text-xs">
                        {contact.lastMessageAt ? format(new Date(contact.lastMessageAt), 'MMM d, HH:mm') : '—'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => window.location.href = `/monitor?id=${contact.lastConversationId}`}
                          className="p-1.5 hover:bg-muted text-muted-app hover:text-blue-500 rounded-md transition-colors"
                        >
                          <History className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </LayoutShell>
  );
}
