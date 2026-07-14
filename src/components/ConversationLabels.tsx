'use client';

// Panel label percakapan (CRM Fase 3, ala Cekat): pasang/lepas label pada satu
// percakapan, plus buat label baru. Maks 5 label per percakapan (selaras API).

import { useState } from 'react';
import { Tag, Plus, X, Loader2, Sparkles, Trash2 } from 'lucide-react';

export interface Label {
  id: string;
  name: string;
  color: string;
  ai_enabled?: boolean; // AI boleh pasang otomatis (butuh migrasi 0021)
}

export const LABEL_STYLE: Record<string, string> = {
  red: 'bg-red-500/10 text-red-500',
  orange: 'bg-orange-500/10 text-orange-500',
  amber: 'bg-amber-500/10 text-amber-600',
  emerald: 'bg-emerald-500/10 text-emerald-600',
  sky: 'bg-sky-500/10 text-sky-500',
  blue: 'bg-blue-500/10 text-blue-500',
  violet: 'bg-violet-500/10 text-violet-500',
  pink: 'bg-pink-500/10 text-pink-500',
};

const LABEL_DOT: Record<string, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
  sky: 'bg-sky-500',
  blue: 'bg-blue-500',
  violet: 'bg-violet-500',
  pink: 'bg-pink-500',
};

const COLORS = Object.keys(LABEL_DOT);
const MAX_LABELS = 5;

export default function ConversationLabels({
  conversationId,
  labels,
  allLabels,
  onLabelsChange,
  onLabelCreated,
  onLabelUpdated,
  onLabelDeleted,
}: {
  conversationId: string;
  labels: Label[]; // label yang terpasang di percakapan ini
  allLabels: Label[]; // semua label milik akun
  onLabelsChange: (labels: Label[]) => void;
  onLabelCreated: (label: Label) => void;
  onLabelUpdated?: (label: Label) => void;
  onLabelDeleted?: (labelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('blue');
  const [creating, setCreating] = useState(false);
  const [manage, setManage] = useState(false);
  const [busyLabelId, setBusyLabelId] = useState<string | null>(null);

  const toggleAi = async (label: Label) => {
    setBusyLabelId(label.id);
    try {
      const res = await fetch('/api/labels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: label.id, ai_enabled: !label.ai_enabled }),
      });
      if (res.ok) {
        const updated: Label = await res.json();
        onLabelUpdated?.(updated);
      }
    } finally {
      setBusyLabelId(null);
    }
  };

  const deleteLabel = async (label: Label) => {
    setBusyLabelId(label.id);
    try {
      const res = await fetch(`/api/labels?id=${label.id}`, { method: 'DELETE' });
      if (res.ok) {
        onLabelDeleted?.(label.id);
        if (labels.some(l => l.id === label.id)) {
          onLabelsChange(labels.filter(l => l.id !== label.id));
        }
      }
    } finally {
      setBusyLabelId(null);
    }
  };

  const applied = new Set(labels.map(l => l.id));
  const available = allLabels.filter(l => !applied.has(l.id));

  const saveSet = async (next: Label[]) => {
    setSaving(true);
    try {
      const res = await fetch('/api/conversations/labels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          label_ids: next.map(l => l.id),
        }),
      });
      if (res.ok) onLabelsChange(next);
    } finally {
      setSaving(false);
    }
  };

  const addLabel = (label: Label) => {
    if (labels.length >= MAX_LABELS) return;
    saveSet([...labels, label]);
  };

  const removeLabel = (label: Label) => {
    saveSet(labels.filter(l => l.id !== label.id));
  };

  const createLabel = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch('/api/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color: newColor }),
      });
      if (res.ok) {
        const label: Label = await res.json();
        onLabelCreated(label);
        setNewName('');
        if (labels.length < MAX_LABELS) {
          await saveSet([...labels, label]);
        }
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-bold text-muted-app uppercase tracking-widest flex items-center gap-1.5">
          <Tag className="w-3 h-3" /> Labels
        </h4>
        <button
          onClick={() => setOpen(!open)}
          disabled={saving}
          className="p-1 text-muted-app hover:text-blue-500 hover:bg-muted rounded-md transition-colors"
          aria-label="Add label"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Label terpasang */}
      <div className="flex flex-wrap gap-1.5">
        {labels.length === 0 ? (
          <span className="text-[10px] text-muted-app italic">No labels</span>
        ) : (
          labels.map((label) => (
            <span
              key={label.id}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${LABEL_STYLE[label.color] || LABEL_STYLE.blue}`}
            >
              {label.name}
              <button onClick={() => removeLabel(label)} className="hover:opacity-60" aria-label={`Remove ${label.name}`}>
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))
        )}
      </div>

      {/* Panel tambah/buat label */}
      {open && (
        <div className="border border-app rounded-xl p-3 space-y-3 bg-muted/30">
          {labels.length >= MAX_LABELS ? (
            <p className="text-[10px] text-amber-600 font-medium">Maksimal {MAX_LABELS} label per percakapan.</p>
          ) : available.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {available.map((label) => (
                <button
                  key={label.id}
                  onClick={() => addLabel(label)}
                  className={`px-2 py-0.5 rounded-full text-[9px] font-bold hover:opacity-70 transition-opacity ${LABEL_STYLE[label.color] || LABEL_STYLE.blue}`}
                >
                  + {label.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted-app italic">Semua label sudah terpasang. Buat baru di bawah.</p>
          )}

          <div className="pt-2 border-t border-app space-y-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createLabel()}
              placeholder="Label baru..."
              className="w-full bg-card-app border border-app rounded-lg px-2.5 py-1.5 text-[11px] outline-none focus:border-blue-500/50 transition-all text-main"
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewColor(color)}
                    className={`w-4 h-4 rounded-full ${LABEL_DOT[color]} ${newColor === color ? 'ring-2 ring-offset-1 ring-blue-500 ring-offset-card-app' : 'opacity-60 hover:opacity-100'} transition-all`}
                    aria-label={color}
                  />
                ))}
              </div>
              <button
                onClick={createLabel}
                disabled={creating || !newName.trim()}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1"
              >
                {creating && <Loader2 className="w-3 h-3 animate-spin" />}
                Buat
              </button>
            </div>
          </div>

          {/* Kelola label akun: toggle AI auto-label + hapus */}
          {allLabels.length > 0 && (
            <div className="pt-2 border-t border-app space-y-2">
              <button
                onClick={() => setManage(!manage)}
                className="text-[10px] font-bold text-muted-app hover:text-main transition-colors flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" /> Kelola label & AI otomatis {manage ? '▴' : '▾'}
              </button>
              {manage && (
                <div className="space-y-1.5">
                  <p className="text-[9px] text-muted-app leading-relaxed">
                    Nyalakan ✨ agar AI memasang label itu otomatis saat isi chat cocok.
                  </p>
                  {allLabels.map((label) => (
                    <div key={label.id} className="flex items-center justify-between gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${LABEL_STYLE[label.color] || LABEL_STYLE.blue}`}>
                        {label.name}
                      </span>
                      <span className="flex items-center gap-1">
                        <button
                          onClick={() => toggleAi(label)}
                          disabled={busyLabelId === label.id}
                          className={`p-1 rounded-md transition-colors ${
                            label.ai_enabled
                              ? 'text-violet-500 bg-violet-500/10'
                              : 'text-muted-app hover:text-violet-500 hover:bg-muted'
                          }`}
                          aria-label={`AI auto ${label.name}`}
                          title={label.ai_enabled ? 'AI otomatis: ON' : 'AI otomatis: OFF'}
                        >
                          {busyLabelId === label.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        </button>
                        <button
                          onClick={() => deleteLabel(label)}
                          disabled={busyLabelId === label.id}
                          className="p-1 text-muted-app hover:text-red-500 hover:bg-muted rounded-md transition-colors"
                          aria-label={`Hapus ${label.name}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
