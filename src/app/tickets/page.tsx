'use client';

import { useState, useEffect } from 'react';
import LayoutShell from '@/components/LayoutShell';
import { Ticket as TicketIcon, Loader2, RefreshCw, Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Ticket {
  id: string;
  conversation_id: string | null;
  subject: string;
  description: string | null;
  customer_name: string | null;
  customer_contact: string | null;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
}

const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600',
  in_progress: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600',
  resolved: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600',
  closed: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500',
};

const PRIORITY_STYLE: Record<string, string> = {
  low: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500',
  normal: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600',
  high: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600',
  urgent: 'bg-red-100 dark:bg-red-900/40 text-red-500',
};

const EMPTY_FORM = { subject: '', description: '', customer_name: '', customer_contact: '', priority: 'normal' };

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tickets');
      if (res.ok) setTickets(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const updateTicket = async (id: string, updates: Partial<Ticket>) => {
    const res = await fetch('/api/tickets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    });
    if (res.ok) {
      setTickets(prev => prev.map(t => (t.id === id ? { ...t, ...updates } : t)));
    }
  };

  const createTicket = async () => {
    if (!form.subject.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const ticket = await res.json();
        setTickets(prev => [ticket, ...prev]);
        setForm(EMPTY_FORM);
        setShowForm(false);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <LayoutShell>
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center">
              <TicketIcon className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-main">Tickets</h1>
              <p className="text-xs text-muted-app">Eskalasi & tindak lanjut yang butuh penanganan manual.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={fetchTickets}
              className="p-2.5 border border-app rounded-xl text-muted-app hover:text-main bg-card-app shadow-sm">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors">
              <Plus className="w-4 h-4" /> New Ticket
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="bg-card-app border border-dashed border-app rounded-2xl p-16 text-center">
            <p className="text-sm text-muted-app">
              Belum ada ticket. Klik <span className="font-bold">New Ticket</span> untuk mencatat eskalasi atau tindak lanjut pelanggan.
            </p>
          </div>
        ) : (
          <div className="bg-card-app border border-app rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-app text-[10px] uppercase font-bold text-muted-app tracking-widest">
                  <th className="px-5 py-3">Ref</th>
                  <th className="px-5 py-3">Subjek</th>
                  <th className="px-5 py-3">Pelanggan</th>
                  <th className="px-5 py-3">Prioritas</th>
                  <th className="px-5 py-3">Dibuat</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id} className="border-b border-app last:border-0 hover:bg-muted/40">
                    <td className="px-5 py-3 text-[11px] font-mono font-bold text-main">
                      {ticket.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-5 py-3 max-w-[280px]">
                      <p className="text-xs font-bold text-main truncate" title={ticket.subject}>{ticket.subject}</p>
                      {ticket.description && (
                        <p className="text-[10px] text-muted-app truncate" title={ticket.description}>{ticket.description}</p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-xs font-bold text-main">{ticket.customer_name || '-'}</p>
                      <p className="text-[10px] text-muted-app">{ticket.customer_contact || ''}</p>
                    </td>
                    <td className="px-5 py-3">
                      <select value={ticket.priority}
                        onChange={(e) => updateTicket(ticket.id, { priority: e.target.value })}
                        className={`text-[10px] font-bold rounded-full px-3 py-1.5 outline-none cursor-pointer appearance-none ${PRIORITY_STYLE[ticket.priority] || ''}`}>
                        {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>
                    <td className="px-5 py-3 text-[11px] text-muted-app whitespace-nowrap">
                      {new Date(ticket.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-5 py-3">
                      <select value={ticket.status}
                        onChange={(e) => updateTicket(ticket.id, { status: e.target.value })}
                        className={`text-[10px] font-bold rounded-full px-3 py-1.5 outline-none cursor-pointer appearance-none ${STATUS_STYLE[ticket.status] || ''}`}>
                        {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="bg-card-app border border-app rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-main">New Ticket</h2>
                <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-muted rounded-lg text-muted-app">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Subjek *"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className="w-full bg-muted border border-transparent rounded-lg px-3 py-2 text-sm focus:bg-card-app focus:border-blue-500/50 outline-none transition-all text-main"
                />
                <textarea
                  placeholder="Deskripsi"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full bg-muted border border-transparent rounded-lg px-3 py-2 text-sm focus:bg-card-app focus:border-blue-500/50 outline-none transition-all text-main resize-none"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Nama pelanggan"
                    value={form.customer_name}
                    onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                    className="w-full bg-muted border border-transparent rounded-lg px-3 py-2 text-sm focus:bg-card-app focus:border-blue-500/50 outline-none transition-all text-main"
                  />
                  <input
                    type="text"
                    placeholder="Kontak (WA/telp)"
                    value={form.customer_contact}
                    onChange={(e) => setForm({ ...form, customer_contact: e.target.value })}
                    className="w-full bg-muted border border-transparent rounded-lg px-3 py-2 text-sm focus:bg-card-app focus:border-blue-500/50 outline-none transition-all text-main"
                  />
                </div>
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  className="w-full bg-muted border border-transparent rounded-lg px-3 py-2 text-sm focus:bg-card-app focus:border-blue-500/50 outline-none transition-all text-main cursor-pointer"
                >
                  {PRIORITIES.map(p => <option key={p} value={p}>Prioritas: {p}</option>)}
                </select>
              </div>

              <button
                onClick={createTicket}
                disabled={!form.subject.trim() || saving}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Simpan Ticket
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </LayoutShell>
  );
}
