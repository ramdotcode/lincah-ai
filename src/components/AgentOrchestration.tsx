'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Plus, Pencil, Trash2, Loader2, Zap, Users } from 'lucide-react';

interface Agent {
  id: string;
  bot_id: string;
  name: string;
  description: string | null;
  system_prompt: string | null;
  is_default: boolean;
  active: boolean;
}

interface AgentFormState {
  id?: string;
  name: string;
  description: string;
  system_prompt: string;
  is_default: boolean;
}

const EMPTY_FORM: AgentFormState = { name: '', description: '', system_prompt: '', is_default: false };

export default function AgentOrchestration({
  botId,
  multiAgentEnabled,
  onToggleMultiAgent,
}: {
  botId: string;
  multiAgentEnabled: boolean;
  onToggleMultiAgent: (enabled: boolean) => void;
}) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AgentFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agents?botId=${botId}`);
      if (res.ok) setAgents(await res.json());
    } finally {
      setLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    if (botId) fetchAgents();
  }, [botId, fetchAgents]);

  const handleSaveAgent = async () => {
    if (!form.name.trim()) {
      setError('Nama agent wajib diisi.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, bot_id: botId }),
      });
      if (res.ok) {
        setShowForm(false);
        setForm(EMPTY_FORM);
        await fetchAgents();
      } else {
        const { error } = await res.json().catch(() => ({ error: 'Gagal menyimpan agent' }));
        setError(error || 'Gagal menyimpan agent');
      }
    } catch {
      setError('Tidak bisa terhubung ke server.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAgent = async (id: string) => {
    if (!confirm('Hapus agent ini? Percakapan yang sedang ditangani agent ini akan kembali ke prompt utama bot.')) return;
    const res = await fetch(`/api/agents?id=${id}`, { method: 'DELETE' });
    if (res.ok) await fetchAgents();
  };

  const handleToggleActive = async (agent: Agent) => {
    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...agent, active: !agent.active }),
    });
    if (res.ok) await fetchAgents();
  };

  const startEdit = (agent: Agent) => {
    setForm({
      id: agent.id,
      name: agent.name,
      description: agent.description || '',
      system_prompt: agent.system_prompt || '',
      is_default: agent.is_default,
    });
    setError(null);
    setShowForm(true);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-12">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-main">Multi-Agent Routing</h3>
          <p className="text-[11px] text-muted-app">
            Satu nomor bisa punya beberapa AI agent (mis. Sales, Support, Billing). Router otomatis memilih agent yang tepat untuk tiap chat.
          </p>
        </div>
      </div>

      {/* Toggle on/off — disimpan lewat tombol Save Changes */}
      <div className="bg-card-app border border-app p-6 rounded-[2rem] flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-purple-500" />
          <div>
            <span className="text-xs font-bold text-main block">Aktifkan Multi-Agent Routing</span>
            <span className="text-[10px] text-muted-app">Simpan dengan tombol Save Changes. Tanpa agent aktif, bot memakai prompt utama.</span>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox"
            className="sr-only peer"
            checked={multiAgentEnabled}
            onChange={(e) => onToggleMultiAgent(e.target.checked)}
          />
          <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
        </label>
      </div>

      {/* Agent list */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-main flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-500" />
            Daftar Agent ({agents.length})
          </h4>
          <button
            onClick={() => { setForm(EMPTY_FORM); setError(null); setShowForm(true); }}
            className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 transition-all shadow-md"
          >
            <Plus className="w-3.5 h-3.5" />
            Tambah Agent
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
          </div>
        ) : agents.length === 0 ? (
          <div className="bg-card-app border border-dashed border-app rounded-2xl p-8 text-center">
            <p className="text-xs text-muted-app">
              Belum ada agent. Tambahkan minimal 2 agent (mis. Sales dan Support) agar routing berjalan.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => (
              <div key={agent.id} className={`bg-card-app border border-app rounded-2xl p-5 flex items-start justify-between gap-4 shadow-sm ${!agent.active ? 'opacity-50' : ''}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-main">{agent.name}</span>
                    {agent.is_default && (
                      <span className="text-[9px] font-bold uppercase tracking-wider bg-purple-100 dark:bg-purple-900/40 text-purple-600 px-2 py-0.5 rounded-full">Default</span>
                    )}
                    {!agent.active && (
                      <span className="text-[9px] font-bold uppercase tracking-wider bg-muted text-muted-app px-2 py-0.5 rounded-full">Nonaktif</span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-app mt-1 line-clamp-2">
                    {agent.description || 'Tanpa deskripsi — router butuh deskripsi untuk memilih agent ini.'}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleToggleActive(agent)}
                    title={agent.active ? 'Nonaktifkan' : 'Aktifkan'}
                    className="p-2 hover:bg-muted rounded-xl text-muted-app">
                    <Zap className={`w-3.5 h-3.5 ${agent.active ? 'text-emerald-500' : ''}`} />
                  </button>
                  <button onClick={() => startEdit(agent)} className="p-2 hover:bg-muted rounded-xl text-muted-app">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDeleteAgent(agent.id)} className="p-2 hover:bg-muted rounded-xl text-red-400 hover:text-red-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div className="bg-card-app border border-app rounded-[2rem] p-6 space-y-5 shadow-sm">
          <h4 className="text-xs font-bold text-main">{form.id ? 'Edit Agent' : 'Agent Baru'}</h4>

          <div className="space-y-2">
            <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest pl-1">Nama agent</label>
            <input type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="mis. Sales"
              className="w-full bg-white dark:bg-zinc-900 border border-app rounded-xl px-4 py-2.5 text-xs text-main outline-none focus:border-purple-500 shadow-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest pl-1">Deskripsi tugas (dipakai router)</label>
            <textarea rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="mis. Menangani pertanyaan harga, promo, dan calon pembeli baru"
              className="w-full bg-white dark:bg-zinc-900 border border-app rounded-xl px-4 py-2.5 text-xs text-main outline-none focus:border-purple-500 shadow-sm"
            />
            <p className="text-[10px] text-muted-app pl-1">Router membaca deskripsi ini untuk memutuskan chat masuk ke agent mana. Buat spesifik.</p>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest pl-1">System prompt agent</label>
            <textarea rows={5}
              value={form.system_prompt}
              onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
              placeholder="Kamu adalah sales assistant yang ramah..."
              className="w-full bg-white dark:bg-zinc-900 border border-app rounded-xl px-4 py-2.5 text-xs text-main outline-none focus:border-purple-500 shadow-sm leading-relaxed"
            />
            <p className="text-[10px] text-muted-app pl-1">Kosongkan untuk memakai prompt utama bot.</p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer pl-1">
            <input type="checkbox"
              checked={form.is_default}
              onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
              className="w-3.5 h-3.5 accent-purple-600"
            />
            <span className="text-[11px] text-main font-medium">Jadikan agent default (dipakai saat router ragu)</span>
          </label>

          {error && <p className="text-[11px] text-red-500 font-bold">{error}</p>}

          <div className="flex items-center gap-2 pt-2">
            <button onClick={handleSaveAgent} disabled={saving}
              className="px-5 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 transition-all disabled:bg-purple-300 flex items-center gap-2">
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              {form.id ? 'Simpan Perubahan' : 'Tambah Agent'}
            </button>
            <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setError(null); }}
              className="px-5 py-2 border border-app rounded-xl text-xs font-bold text-muted-app hover:text-main transition-all">
              Batal
            </button>
          </div>
        </div>
      )}

      <div className="h-20" />
    </div>
  );
}
