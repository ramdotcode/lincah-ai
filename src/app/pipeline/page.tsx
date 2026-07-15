'use client';

// Halaman kelola pipeline stage (CRM Fase 7) — level AKUN, dipakai semua bot.
// Dipindah dari tab Pipeline di Settings (per-bot) agar bisa diatur tanpa memilih bot dulu.

import { useState, useEffect } from 'react';
import LayoutShell from '@/components/LayoutShell';
import { Loader2 } from 'lucide-react';
import PipelineStages from '@/components/PipelineStages';
import { DEFAULT_STAGES, PipelineStageDef } from '@/lib/stageConstants';

export default function PipelinePage() {
  const [stages, setStages] = useState<PipelineStageDef[]>(DEFAULT_STAGES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/pipeline-stages');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length) setStages(data);
        }
      } catch { /* pakai default */ } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <LayoutShell>
      <div className="p-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <PipelineStages stages={stages} onChange={setStages} />
        )}
      </div>
    </LayoutShell>
  );
}
