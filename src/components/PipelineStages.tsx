'use client';

// Kelola pipeline stage custom (CRM Fase 7): tambah, ubah label/warna/tipe,
// urutkan (naik/turun), hapus. Stage tersimpan level akun (bukan per bot).

import { useState } from 'react';
import { Loader2, Plus, Trash2, ChevronUp, ChevronDown, Kanban } from 'lucide-react';
import { PipelineStageDef, STAGE_COLORS, stageColorClass, StageType } from '@/lib/stageConstants';

const TYPE_LABEL: Record<StageType, string> = { open: 'Aktif', won: 'Menang', lost: 'Kalah' };

export default function PipelineStages({
  stages,
  onChange,
}: {
  stages: PipelineStageDef[];
  onChange: (stages: PipelineStageDef[]) => void;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('violet');
  const [creating, setCreating] = useState(false);

  const patchStage = async (key: string, updates: Partial<PipelineStageDef>) => {
    setBusyKey(key);
    try {
      const res = await fetch('/api/pipeline-stages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, ...updates }),
      });
      if (res.ok) {
        const updated = await res.json();
        onChange(stages.map(s => (s.key === key ? updated : s)));
      }
    } finally {
      setBusyKey(null);
    }
  };

  const reorder = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= stages.length) return;
    const next = [...stages];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next.map((s, i) => ({ ...s, position: i })));
    await fetch('/api/pipeline-stages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: next.map(s => s.key) }),
    });
  };

  const removeStage = async (key: string) => {
    if (stages.length <= 1) return;
    setBusyKey(key);
    try {
      const res = await fetch(`/api/pipeline-stages?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
      if (res.ok) onChange(stages.filter(s => s.key !== key));
    } finally {
      setBusyKey(null);
    }
  };

  const createStage = async () => {
    const label = newLabel.trim();
    if (!label) return;
    setCreating(true);
    try {
      const res = await fetch('/api/pipeline-stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, color: newColor, type: 'open' }),
      });
      if (res.ok) {
        const created = await res.json();
        onChange([...stages, created]);
        setNewLabel('');
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center">
          <Kanban className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-main">Pipeline Stages</h3>
          <p className="text-[11px] text-muted-app">
            Tahapan lead di halaman Leads. Berlaku untuk semua bot di akun ini. AI ikut memakai stage ini.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {stages.map((stage, i) => {
          const c = stageColorClass(stage.color);
          return (
            <div key={stage.key} className="bg-card-app border border-app rounded-2xl p-3 flex items-center gap-3 shadow-sm">
              {/* Reorder */}
              <div className="flex flex-col">
                <button onClick={() => reorder(i, -1)} disabled={i === 0}
                  className="text-muted-app hover:text-main disabled:opacity-20 transition-colors">
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => reorder(i, 1)} disabled={i === stages.length - 1}
                  className="text-muted-app hover:text-main disabled:opacity-20 transition-colors">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.dot}`} />

              {/* Label editable */}
              <input
                defaultValue={stage.label}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== stage.label) patchStage(stage.key, { label: v });
                }}
                className="flex-1 bg-transparent border-b border-transparent focus:border-blue-500/50 text-sm text-main outline-none py-1 min-w-0"
              />

              {/* Warna */}
              <div className="flex items-center gap-1">
                {STAGE_COLORS.map(color => (
                  <button key={color} onClick={() => patchStage(stage.key, { color })}
                    className={`w-3.5 h-3.5 rounded-full ${stageColorClass(color).dot} ${
                      stage.color === color ? 'ring-2 ring-offset-1 ring-blue-500 ring-offset-card-app' : 'opacity-50 hover:opacity-100'
                    } transition-all`}
                    aria-label={color} />
                ))}
              </div>

              {/* Tipe */}
              <select
                value={stage.type}
                onChange={(e) => patchStage(stage.key, { type: e.target.value as StageType })}
                className="bg-muted border border-app rounded-lg px-2 py-1 text-[11px] text-main outline-none focus:border-blue-500/50"
              >
                {(['open', 'won', 'lost'] as StageType[]).map(t => (
                  <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                ))}
              </select>

              <button
                onClick={() => removeStage(stage.key)}
                disabled={busyKey === stage.key || stages.length <= 1}
                className="p-1.5 text-muted-app hover:text-red-500 hover:bg-muted rounded-md transition-colors disabled:opacity-30"
                aria-label="Hapus stage"
              >
                {busyKey === stage.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </div>
          );
        })}
      </div>

      {/* Tambah stage */}
      <div className="bg-card-app border border-app rounded-2xl p-4 flex items-center gap-3 shadow-sm">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createStage()}
          placeholder="Nama stage baru (mis. Survey, DP, Akad)..."
          className="flex-1 bg-muted border border-transparent rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500/50 text-main"
        />
        <div className="flex items-center gap-1">
          {STAGE_COLORS.map(color => (
            <button key={color} onClick={() => setNewColor(color)}
              className={`w-3.5 h-3.5 rounded-full ${stageColorClass(color).dot} ${
                newColor === color ? 'ring-2 ring-offset-1 ring-blue-500 ring-offset-card-app' : 'opacity-50 hover:opacity-100'
              } transition-all`}
              aria-label={color} />
          ))}
        </div>
        <button
          onClick={createStage}
          disabled={creating || !newLabel.trim()}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-40 flex items-center gap-1.5"
        >
          {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Tambah
        </button>
      </div>

      <p className="text-[10px] text-muted-app leading-relaxed">
        Tipe <span className="font-bold">Menang/Kalah</span> = tahap akhir (won/lost); AI tidak pernah otomatis menandai
        <span className="font-bold"> Kalah</span>. Menghapus stage memindahkan lead-nya ke stage pertama.
      </p>
    </div>
  );
}
