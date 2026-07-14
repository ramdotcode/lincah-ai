'use client';

// Halaman detail kontak (CRM Fase 2): profil + semua percakapan lintas bot +
// tiket + order dalam satu view. Profil bisa diedit inline (PATCH /api/contacts).

import { useState, useEffect, use } from 'react';
import LayoutShell from '@/components/LayoutShell';
import { format } from 'date-fns';
import {
  ArrowLeft,
  User,
  Loader2,
  MessageCircle,
  Send,
  Globe,
  MessagesSquare,
  Ticket as TicketIcon,
  ClipboardList,
  Pencil,
  Check,
  X,
  Bot,
} from 'lucide-react';

interface ContactDetail {
  contact: {
    id: string;
    platform: string | null;
    external_id: string | null;
    name: string | null;
    username: string | null;
    phone: string | null;
    email: string | null;
    company: string | null;
    address: string | null;
    notes: string | null;
    tags: string[];
    source: string;
    last_seen_at: string | null;
    created_at: string;
  };
  identities: Array<{ platform: string; external_id: string }>;
  conversations: Array<{
    id: string;
    bot_name: string | null;
    platform: string | null;
    stage: string | null;
    status: string | null;
    last_message: string | null;
    last_message_at: string | null;
    created_at: string;
  }>;
  tickets: Array<{
    id: string;
    subject: string;
    status: string;
    priority: string;
    created_at: string;
  }>;
  orders: Array<{
    id: string;
    items: Array<{ name: string; qty: number }>;
    status: string;
    created_at: string;
  }>;
}

function PlatformIcon({ platform }: { platform: string | null }) {
  if (platform === 'whatsapp') return <MessageCircle className="w-3.5 h-3.5 text-green-500" aria-label="WhatsApp" />;
  if (platform === 'telegram') return <Send className="w-3.5 h-3.5 text-sky-500" aria-label="Telegram" />;
  if (platform === 'webchat') return <Globe className="w-3.5 h-3.5 text-violet-500" aria-label="Web Chat" />;
  return null;
}

const STAGE_COLOR: Record<string, string> = {
  new: 'text-blue-500',
  interested: 'text-cyan-500',
  negotiating: 'text-amber-500',
  won: 'text-green-500',
  lost: 'text-red-500',
};

const TICKET_STATUS_STYLE: Record<string, string> = {
  open: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600',
  in_progress: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600',
  resolved: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600',
  closed: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500',
};

const ORDER_STATUS_STYLE: Record<string, string> = {
  new: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600',
  confirmed: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600',
  paid: 'bg-violet-100 dark:bg-violet-900/40 text-violet-600',
  shipped: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600',
  done: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600',
  cancelled: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500',
};

// Field profil yang bisa diedit inline
const PROFILE_FIELDS: Array<{ key: 'name' | 'phone' | 'email' | 'company' | 'address' | 'notes'; label: string; multiline?: boolean }> = [
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'company', label: 'Company' },
  { key: 'address', label: 'Address' },
  { key: 'notes', label: 'Notes', multiline: true },
];

export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldValue, setFieldValue] = useState('');
  const [savingField, setSavingField] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [tagsValue, setTagsValue] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/contacts/${id}`);
        if (res.ok) {
          setData(await res.json());
        } else {
          setNotFound(true);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const patchContact = async (updates: Record<string, any>) => {
    setSavingField(true);
    try {
      const res = await fetch('/api/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });
      if (res.ok && data) {
        setData({ ...data, contact: { ...data.contact, ...updates } });
      }
    } finally {
      setSavingField(false);
      setEditingField(null);
      setEditingTags(false);
    }
  };

  const startEdit = (key: string, current: string | null) => {
    setEditingField(key);
    setFieldValue(current || '');
  };

  const saveField = () => {
    if (!editingField) return;
    patchContact({ [editingField]: fieldValue.trim() || null });
  };

  const saveTags = () => {
    patchContact({ tags: tagsValue.split(',').map(t => t.trim()).filter(Boolean) });
  };

  if (loading) {
    return (
      <LayoutShell>
        <div className="flex justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </LayoutShell>
    );
  }

  if (notFound || !data) {
    return (
      <LayoutShell>
        <div className="p-8">
          <p className="text-sm text-muted-app italic">Contact not found.</p>
          <button onClick={() => (window.location.href = '/contacts')} className="mt-4 text-xs font-bold text-blue-600 flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Contacts
          </button>
        </div>
      </LayoutShell>
    );
  }

  const { contact, identities, conversations, tickets, orders } = data;

  return (
    <LayoutShell>
      <div className="p-8 space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => (window.location.href = '/contacts')}
            className="p-2 hover:bg-muted rounded-xl text-muted-app hover:text-main transition-colors"
            aria-label="Back to contacts"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 font-bold text-xl">
            {contact.name?.charAt(0) || <User className="w-6 h-6" />}
          </div>
          <div>
            <h1 className="text-xl font-bold text-main flex items-center gap-2">
              {contact.name || 'Anonymous'} <PlatformIcon platform={contact.platform} />
            </h1>
            <p className="text-xs text-muted-app">
              {contact.username ? `@${contact.username} · ` : ''}
              {contact.external_id || 'Manual contact'}
              {contact.last_seen_at ? ` · last seen ${format(new Date(contact.last_seen_at), 'MMM d, HH:mm')}` : ''}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 items-start">
          {/* Profil (edit inline) */}
          <div className="bg-card-app border border-app rounded-xl shadow-sm p-5 space-y-4">
            <h2 className="text-[10px] uppercase font-bold text-muted-app tracking-widest">Profile</h2>

            {/* Kanal terhubung (Fase 6: bisa lebih dari satu setelah merge) */}
            {(identities || []).length > 0 && (
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-app tracking-widest">Channels</p>
                <div className="flex flex-col gap-1 mt-1">
                  {identities.map((idn) => (
                    <span key={`${idn.platform}:${idn.external_id}`} className="flex items-center gap-1.5 text-xs text-main">
                      <PlatformIcon platform={idn.platform} />
                      <span className="truncate">{idn.external_id}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {PROFILE_FIELDS.map(({ key, label, multiline }) => (
              <div key={key} className="group">
                <p className="text-[10px] uppercase font-bold text-muted-app tracking-widest">{label}</p>
                {editingField === key ? (
                  <div className="flex items-start gap-1.5 mt-1">
                    {multiline ? (
                      <textarea
                        value={fieldValue}
                        onChange={(e) => setFieldValue(e.target.value)}
                        rows={3}
                        autoFocus
                        className="flex-1 bg-muted border border-transparent rounded-lg px-3 py-2 text-sm focus:bg-card-app focus:border-blue-500/50 outline-none transition-all text-main resize-none"
                      />
                    ) : (
                      <input
                        value={fieldValue}
                        onChange={(e) => setFieldValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveField()}
                        autoFocus
                        className="flex-1 bg-muted border border-transparent rounded-lg px-3 py-2 text-sm focus:bg-card-app focus:border-blue-500/50 outline-none transition-all text-main"
                      />
                    )}
                    <button onClick={saveField} disabled={savingField} className="p-1.5 text-emerald-500 hover:bg-muted rounded-md">
                      {savingField ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button onClick={() => setEditingField(null)} className="p-1.5 text-muted-app hover:bg-muted rounded-md">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startEdit(key, contact[key])}
                    className="w-full text-left flex items-start justify-between gap-2 mt-0.5 rounded-md hover:bg-muted px-1 py-0.5 -mx-1 transition-colors"
                  >
                    <span className={`text-sm whitespace-pre-wrap ${contact[key] ? 'text-main' : 'text-muted-app italic'}`}>
                      {contact[key] || 'Add...'}
                    </span>
                    <Pencil className="w-3 h-3 text-muted-app opacity-0 group-hover:opacity-100 mt-1 shrink-0" />
                  </button>
                )}
              </div>
            ))}

            {/* Tags */}
            <div className="group">
              <p className="text-[10px] uppercase font-bold text-muted-app tracking-widest">Tags</p>
              {editingTags ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <input
                    value={tagsValue}
                    onChange={(e) => setTagsValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveTags()}
                    placeholder="vip, reseller (pisah koma)"
                    autoFocus
                    className="flex-1 bg-muted border border-transparent rounded-lg px-3 py-2 text-sm focus:bg-card-app focus:border-blue-500/50 outline-none transition-all text-main"
                  />
                  <button onClick={saveTags} disabled={savingField} className="p-1.5 text-emerald-500 hover:bg-muted rounded-md">
                    {savingField ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </button>
                  <button onClick={() => setEditingTags(false)} className="p-1.5 text-muted-app hover:bg-muted rounded-md">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setEditingTags(true); setTagsValue((contact.tags || []).join(', ')); }}
                  className="w-full text-left flex items-center justify-between gap-2 mt-1 rounded-md hover:bg-muted px-1 py-0.5 -mx-1 transition-colors"
                >
                  <span className="flex flex-wrap gap-1">
                    {(contact.tags || []).length === 0 ? (
                      <span className="text-sm text-muted-app italic">Add...</span>
                    ) : (
                      contact.tags.map((tag) => (
                        <span key={tag} className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-500/10 text-blue-500">
                          {tag}
                        </span>
                      ))
                    )}
                  </span>
                  <Pencil className="w-3 h-3 text-muted-app opacity-0 group-hover:opacity-100 shrink-0" />
                </button>
              )}
            </div>

            <p className="text-[10px] text-muted-app pt-2 border-t border-app">
              Source: <span className="font-bold">{contact.source}</span> · Added {format(new Date(contact.created_at), 'MMM d, yyyy')}
            </p>
          </div>

          {/* Aktivitas: percakapan, tiket, order */}
          <div className="space-y-6">
            {/* Conversations */}
            <div className="bg-card-app border border-app rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-app flex items-center gap-2">
                <MessagesSquare className="w-4 h-4 text-blue-500" />
                <h2 className="text-xs font-bold text-main">Conversations ({conversations.length})</h2>
              </div>
              {conversations.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-app italic">No conversations yet.</p>
              ) : (
                <div className="divide-y divide-app">
                  {conversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => (window.location.href = `/monitor?id=${conv.id}`)}
                      className="w-full text-left px-5 py-3 hover:bg-muted transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-main flex items-center gap-1.5">
                          <Bot className="w-3.5 h-3.5 text-muted-app" /> {conv.bot_name || 'Bot'}
                          <PlatformIcon platform={conv.platform} />
                        </p>
                        <p className="text-[11px] text-muted-app truncate mt-0.5">{conv.last_message || '—'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-muted ${STAGE_COLOR[conv.stage || 'new'] || 'text-blue-500'}`}>
                          {conv.stage || 'new'}
                        </span>
                        <p className="text-[10px] text-muted-app mt-1">
                          {conv.last_message_at ? format(new Date(conv.last_message_at), 'MMM d, HH:mm') : '—'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tickets */}
            <div className="bg-card-app border border-app rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-app flex items-center gap-2">
                <TicketIcon className="w-4 h-4 text-amber-500" />
                <h2 className="text-xs font-bold text-main">Tickets ({tickets.length})</h2>
              </div>
              {tickets.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-app italic">No tickets linked to this contact.</p>
              ) : (
                <div className="divide-y divide-app">
                  {tickets.map((t) => (
                    <div key={t.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-main truncate">{t.subject}</p>
                        <p className="text-[10px] text-muted-app mt-0.5">
                          #{t.id.slice(0, 8).toUpperCase()} · {format(new Date(t.created_at), 'MMM d, HH:mm')} · priority {t.priority}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase shrink-0 ${TICKET_STATUS_STYLE[t.status] || 'bg-muted text-muted-app'}`}>
                        {t.status.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Orders */}
            <div className="bg-card-app border border-app rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-app flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-emerald-500" />
                <h2 className="text-xs font-bold text-main">Orders ({orders.length})</h2>
              </div>
              {orders.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-app italic">No orders linked to this contact.</p>
              ) : (
                <div className="divide-y divide-app">
                  {orders.map((o) => (
                    <div key={o.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-main truncate">
                          {(o.items || []).map((i) => `${i.name} x${i.qty}`).join(', ') || '—'}
                        </p>
                        <p className="text-[10px] text-muted-app mt-0.5">
                          #{o.id.slice(0, 8).toUpperCase()} · {format(new Date(o.created_at), 'MMM d, HH:mm')}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase shrink-0 ${ORDER_STATUS_STYLE[o.status] || 'bg-muted text-muted-app'}`}>
                        {o.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </LayoutShell>
  );
}
