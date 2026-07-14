'use client';

import { useState, useEffect, useMemo } from 'react';
import LayoutShell from '@/components/LayoutShell';
import { format } from 'date-fns';
import {
  Search,
  History,
  User,
  Users,
  Loader2,
  MessageCircle,
  Send,
  Globe,
  Pencil,
  Plus,
  Trash2,
  X,
  GitMerge,
  Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ChannelIdentity {
  platform: string;
  external_id: string;
}

interface Contact {
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
  identities: ChannelIdentity[];
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
  conversationCount: number;
  lastConversationId: string | null;
  lastStage: string | null;
  lastMessageAt: string | null;
}

interface ContactForm {
  name: string;
  phone: string;
  email: string;
  company: string;
  address: string;
  notes: string;
  tags: string; // comma-separated di form, string[] di API
}

const EMPTY_FORM: ContactForm = {
  name: '',
  phone: '',
  email: '',
  company: '',
  address: '',
  notes: '',
  tags: '',
};

function PlatformIcon({ platform }: { platform: string | null }) {
  if (platform === 'whatsapp') {
    return <MessageCircle className="w-3.5 h-3.5 text-green-500" aria-label="WhatsApp" />;
  }
  if (platform === 'telegram') {
    return <Send className="w-3.5 h-3.5 text-sky-500" aria-label="Telegram" />;
  }
  if (platform === 'webchat') {
    return <Globe className="w-3.5 h-3.5 text-violet-500" aria-label="Web Chat" />;
  }
  return null; // kontak manual tanpa kanal
}

// Semua ikon kanal milik satu kontak (dedup platform). Fallback ke platform primer.
function IdentityIcons({ contact }: { contact: Contact }) {
  const platforms = contact.identities?.length
    ? [...new Set(contact.identities.map(i => i.platform))]
    : contact.platform
      ? [contact.platform]
      : [];
  if (platforms.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {platforms.map(p => <PlatformIcon key={p} platform={p} />)}
    </span>
  );
}

const STAGE_COLOR: Record<string, string> = {
  new: 'text-blue-500',
  interested: 'text-cyan-500',
  negotiating: 'text-amber-500',
  won: 'text-green-500',
  lost: 'text-red-500',
};

function contactToForm(c: Contact): ContactForm {
  return {
    name: c.name || '',
    phone: c.phone || '',
    email: c.email || '',
    company: c.company || '',
    address: c.address || '',
    notes: c.notes || '',
    tags: (c.tags || []).join(', '),
  };
}

function formToPayload(form: ContactForm) {
  return {
    name: form.name.trim(),
    phone: form.phone.trim() || null,
    email: form.email.trim() || null,
    company: form.company.trim() || null,
    address: form.address.trim() || null,
    notes: form.notes.trim() || null,
    tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
  };
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Contact | null>(null); // kontak yang diedit
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Merge lintas kanal (Fase 6)
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/contacts');
        if (res.ok) setContacts((await res.json()) || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [c.name, c.username, c.external_id, c.phone, c.email, c.company, ...(c.tags || [])]
        .some((v) => v && String(v).toLowerCase().includes(q))
    );
  }, [contacts, search]);

  const openEdit = (contact: Contact) => {
    setEditing(contact);
    setCreating(false);
    setForm(contactToForm(contact));
    setConfirmDelete(false);
  };

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setForm(EMPTY_FORM);
    setConfirmDelete(false);
  };

  const closeModal = () => {
    setEditing(null);
    setCreating(false);
    setConfirmDelete(false);
  };

  const saveContact = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (creating) {
        const res = await fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formToPayload(form)),
        });
        if (res.ok) {
          const contact = await res.json();
          setContacts(prev => [contact, ...prev]);
          closeModal();
        }
      } else if (editing) {
        const payload = formToPayload(form);
        const res = await fetch('/api/contacts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, ...payload }),
        });
        if (res.ok) {
          setContacts(prev => prev.map(c => (c.id === editing.id ? { ...c, ...payload } : c)));
          closeModal();
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteContact = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/contacts?id=${editing.id}`, { method: 'DELETE' });
      if (res.ok) {
        setContacts(prev => prev.filter(c => c.id !== editing.id));
        closeModal();
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const cancelMerge = () => {
    setMergeMode(false);
    setSelectedIds(new Set());
    setMergeModalOpen(false);
    setPrimaryId(null);
  };

  const openMergeModal = () => {
    if (selectedIds.size < 2) return;
    // Default primer: kontak terpilih paling banyak percakapannya
    const selected = contacts.filter(c => selectedIds.has(c.id));
    const best = [...selected].sort((a, b) => b.conversationCount - a.conversationCount)[0];
    setPrimaryId(best?.id || selected[0].id);
    setMergeModalOpen(true);
  };

  const doMerge = async () => {
    if (!primaryId) return;
    const mergeIds = [...selectedIds].filter(id => id !== primaryId);
    if (mergeIds.length === 0) return;
    setMerging(true);
    try {
      const res = await fetch('/api/contacts/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primary_id: primaryId, merge_ids: mergeIds }),
      });
      if (res.ok) {
        // Muat ulang daftar agar identitas & agregat percakapan akurat
        const listRes = await fetch('/api/contacts');
        if (listRes.ok) setContacts((await listRes.json()) || []);
        cancelMerge();
      }
    } finally {
      setMerging(false);
    }
  };

  const selectedContacts = contacts.filter(c => selectedIds.has(c.id));
  const showModal = creating || !!editing;

  return (
    <LayoutShell>
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-main">Contacts</h1>
              <p className="text-xs text-muted-app">
                {contacts.length} kontak pelanggan — terisi otomatis dari percakapan & AI.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {mergeMode ? (
              <>
                <span className="text-[11px] text-muted-app font-medium">{selectedIds.size} dipilih</span>
                <button
                  onClick={openMergeModal}
                  disabled={selectedIds.size < 2}
                  className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2 disabled:opacity-40"
                >
                  <GitMerge className="w-4 h-4" /> Merge ({selectedIds.size})
                </button>
                <button
                  onClick={cancelMerge}
                  className="px-4 py-2.5 text-xs font-bold text-muted-app hover:text-main transition-colors"
                >
                  Batal
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setMergeMode(true)}
                  className="px-4 py-2.5 border border-app text-main text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2 hover:bg-muted"
                >
                  <GitMerge className="w-4 h-4" /> Merge
                </button>
                <button
                  onClick={openCreate}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> New Contact
                </button>
              </>
            )}
          </div>
        </div>

        <div className="bg-card-app border border-app rounded-xl overflow-hidden shadow-sm transition-colors">
          <div className="p-4 border-b border-app">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app w-4 h-4" />
              <input
                type="text"
                placeholder="Search name, phone, email, tags..."
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
                  <th className="px-6 py-3 font-semibold text-muted-app text-xs uppercase tracking-wider">Phone / Email</th>
                  <th className="px-6 py-3 font-semibold text-muted-app text-xs uppercase tracking-wider">Tags</th>
                  <th className="px-6 py-3 font-semibold text-muted-app text-xs uppercase tracking-wider">Chats</th>
                  <th className="px-6 py-3 font-semibold text-muted-app text-xs uppercase tracking-wider">Stage</th>
                  <th className="px-6 py-3 font-semibold text-muted-app text-xs uppercase tracking-wider">Last Seen</th>
                  <th className="px-6 py-3 font-semibold text-muted-app text-xs uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app">
                {filteredContacts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-muted-app text-sm italic">
                      No contacts found yet.
                    </td>
                  </tr>
                ) : (
                  filteredContacts.map((contact) => {
                    const selected = selectedIds.has(contact.id);
                    return (
                    <tr
                      key={contact.id}
                      className={`transition-colors ${selected ? 'bg-violet-500/5' : 'hover:bg-muted'}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {mergeMode && (
                            <button
                              onClick={() => toggleSelect(contact.id)}
                              className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                selected ? 'bg-violet-600 border-violet-600 text-white' : 'border-app hover:border-violet-400'
                              }`}
                              aria-label="Select contact"
                            >
                              {selected && <Check className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          <button
                            onClick={() =>
                              mergeMode
                                ? toggleSelect(contact.id)
                                : (window.location.href = `/contacts/${contact.id}`)
                            }
                            className="flex items-center gap-3 text-left group/name"
                          >
                            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 font-bold text-xs">
                              {contact.name?.charAt(0) || <User className="w-4 h-4" />}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-main flex items-center gap-1.5 group-hover/name:text-blue-600 transition-colors">
                                {contact.name || 'Anonymous'} <IdentityIcons contact={contact} />
                              </p>
                              <p className="text-[10px] text-muted-app">
                                {contact.username ? `@${contact.username}` : contact.external_id || contact.company || '—'}
                              </p>
                            </div>
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <p className="text-main">{contact.phone || '—'}</p>
                        <p className="text-[10px] text-muted-app">{contact.email || ''}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1 max-w-[160px]">
                          {(contact.tags || []).length === 0 ? (
                            <span className="text-muted-app text-xs">—</span>
                          ) : (
                            contact.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-500/10 text-blue-500">
                                {tag}
                              </span>
                            ))
                          )}
                          {(contact.tags || []).length > 3 && (
                            <span className="text-[9px] text-muted-app font-bold">+{contact.tags.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-main text-sm font-semibold">
                        {contact.conversationCount}
                      </td>
                      <td className="px-6 py-4">
                        {contact.lastStage ? (
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-muted ${STAGE_COLOR[contact.lastStage] || 'text-blue-500'}`}>
                            {contact.lastStage}
                          </span>
                        ) : (
                          <span className="text-muted-app text-xs">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-muted-app text-xs">
                        {contact.lastMessageAt || contact.last_seen_at
                          ? format(new Date(contact.lastMessageAt || contact.last_seen_at!), 'MMM d, HH:mm')
                          : '—'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(contact)}
                            className="p-1.5 hover:bg-muted text-muted-app hover:text-blue-500 rounded-md transition-colors"
                            aria-label="Edit contact"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => contact.lastConversationId && (window.location.href = `/monitor?id=${contact.lastConversationId}`)}
                            disabled={!contact.lastConversationId}
                            className="p-1.5 hover:bg-muted text-muted-app hover:text-blue-500 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            aria-label="Open conversation history"
                          >
                            <History className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal create/edit */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4"
            onClick={closeModal}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="bg-card-app border border-app rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-main">
                  {creating ? 'New Contact' : 'Edit Contact'}
                </h2>
                <button onClick={closeModal} className="p-1 text-muted-app hover:text-main rounded-md">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {editing && editing.platform && (
                <p className="text-[10px] text-muted-app flex items-center gap-1.5">
                  <PlatformIcon platform={editing.platform} />
                  {editing.external_id} — identitas kanal tidak bisa diubah.
                </p>
              )}

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest">Name *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Nama pelanggan"
                    className="w-full mt-1 bg-muted border border-transparent rounded-lg px-3 py-2 text-sm focus:bg-card-app focus:border-blue-500/50 outline-none transition-all text-main"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest">Phone</label>
                    <input
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="08xxx"
                      className="w-full mt-1 bg-muted border border-transparent rounded-lg px-3 py-2 text-sm focus:bg-card-app focus:border-blue-500/50 outline-none transition-all text-main"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest">Email</label>
                    <input
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="nama@email.com"
                      className="w-full mt-1 bg-muted border border-transparent rounded-lg px-3 py-2 text-sm focus:bg-card-app focus:border-blue-500/50 outline-none transition-all text-main"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest">Company</label>
                  <input
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                    placeholder="Nama perusahaan/usaha"
                    className="w-full mt-1 bg-muted border border-transparent rounded-lg px-3 py-2 text-sm focus:bg-card-app focus:border-blue-500/50 outline-none transition-all text-main"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest">Address</label>
                  <input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Alamat"
                    className="w-full mt-1 bg-muted border border-transparent rounded-lg px-3 py-2 text-sm focus:bg-card-app focus:border-blue-500/50 outline-none transition-all text-main"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Kebutuhan, preferensi, catatan..."
                    rows={3}
                    className="w-full mt-1 bg-muted border border-transparent rounded-lg px-3 py-2 text-sm focus:bg-card-app focus:border-blue-500/50 outline-none transition-all text-main resize-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest">Tags</label>
                  <input
                    value={form.tags}
                    onChange={(e) => setForm({ ...form, tags: e.target.value })}
                    placeholder="vip, reseller, jakarta (pisah koma)"
                    className="w-full mt-1 bg-muted border border-transparent rounded-lg px-3 py-2 text-sm focus:bg-card-app focus:border-blue-500/50 outline-none transition-all text-main"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                {!creating && editing ? (
                  confirmDelete ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-red-500 font-bold">Yakin hapus?</span>
                      <button
                        onClick={deleteContact}
                        disabled={saving}
                        className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold rounded-lg transition-colors disabled:opacity-50"
                      >
                        Hapus
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="px-3 py-1.5 text-[10px] font-bold text-muted-app hover:text-main transition-colors"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors"
                      aria-label="Delete contact"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 text-xs font-bold text-muted-app hover:text-main transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveContact}
                    disabled={saving || !form.name.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                    {creating ? 'Create' : 'Save'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal merge: pilih kontak primer */}
      <AnimatePresence>
        {mergeModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4"
            onClick={() => setMergeModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="bg-card-app border border-app rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-main flex items-center gap-2">
                  <GitMerge className="w-4 h-4 text-violet-500" /> Gabungkan {selectedContacts.length} Kontak
                </h2>
                <button onClick={() => setMergeModalOpen(false)} className="p-1 text-muted-app hover:text-main rounded-md">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[11px] text-muted-app leading-relaxed">
                Pilih kontak <span className="font-bold">utama</span>. Semua percakapan, kanal, dan data dari kontak lain
                dipindah ke sana, lalu kontak lainnya dihapus. Tidak bisa dibatalkan.
              </p>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {selectedContacts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setPrimaryId(c.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${
                      primaryId === c.id ? 'border-violet-500 bg-violet-500/5' : 'border-app hover:bg-muted'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                      primaryId === c.id ? 'border-violet-600 bg-violet-600' : 'border-app'
                    }`}>
                      {primaryId === c.id && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-main flex items-center gap-1.5 truncate">
                        {c.name || 'Anonymous'} <IdentityIcons contact={c} />
                      </p>
                      <p className="text-[10px] text-muted-app truncate">
                        {c.conversationCount} chat{c.phone ? ` · ${c.phone}` : ''}{c.email ? ` · ${c.email}` : ''}
                      </p>
                    </div>
                    {primaryId === c.id && (
                      <span className="text-[9px] font-bold text-violet-600 uppercase shrink-0">Utama</span>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setMergeModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-muted-app hover:text-main transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={doMerge}
                  disabled={merging || !primaryId}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {merging && <Loader2 className="w-3 h-3 animate-spin" />}
                  Gabungkan
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </LayoutShell>
  );
}
