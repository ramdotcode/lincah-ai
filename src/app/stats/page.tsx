'use client';

import { useState, useEffect } from 'react';
import LayoutShell from '@/components/LayoutShell';
import {
  BarChart3,
  Loader2,
  RefreshCw,
  MessageSquare,
  Bot,
  Clock,
  Send,
  ClipboardList,
  Wallet,
  TrendingUp,
} from 'lucide-react';
import { DEFAULT_STAGES, stageColorClass } from '@/lib/stageConstants';

interface StageDef { key: string; label: string; color: string; }

interface Stats {
  totalConversations: number;
  pendingHandoffs: number;
  aiResponses: number;
  followupsSent: number;
  totalOrders: number;
  pipelineValue?: number;
  wonValue?: number;
  stages: Record<string, number>;
  stageDefs?: StageDef[];
  daily: { date: string; conversations: number; aiResponses: number }[];
}

const FALLBACK_STAGE_DEFS: StageDef[] = DEFAULT_STAGES.map(s => ({ key: s.key, label: s.label, color: s.color }));

function formatRp(n: number): string {
  if (n >= 1e9) return `Rp ${(n / 1e9).toFixed(1).replace('.0', '')}M`;
  if (n >= 1e6) return `Rp ${(n / 1e6).toFixed(1).replace('.0', '')}jt`;
  if (n >= 1e3) return `Rp ${Math.round(n / 1e3)}rb`;
  return `Rp ${n}`;
}

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stats');
      if (res.ok) setStats(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const stageDefs = stats?.stageDefs?.length ? stats.stageDefs : FALLBACK_STAGE_DEFS;
  const totalStaged = stats
    ? stageDefs.reduce((sum, s) => sum + (stats.stages?.[s.key] || 0), 0)
    : 0;
  const maxDaily = stats
    ? Math.max(1, ...stats.daily.map(d => Math.max(d.conversations, d.aiResponses)))
    : 1;

  return (
    <LayoutShell>
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-main">Analytics</h1>
              <p className="text-xs text-muted-app">Ringkasan performa percakapan dan AI dalam 14 hari terakhir.</p>
            </div>
          </div>
          <button onClick={fetchStats}
            className="p-2.5 border border-app rounded-xl text-muted-app hover:text-main bg-card-app shadow-sm">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : !stats ? (
          <div className="bg-card-app border border-dashed border-app rounded-2xl p-16 text-center">
            <p className="text-sm text-muted-app">Gagal memuat statistik. Coba refresh.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatCard icon={MessageSquare} color="text-blue-600 bg-blue-500/10"
                label="Percakapan" value={stats.totalConversations} />
              <StatCard icon={Bot} color="text-emerald-600 bg-emerald-500/10"
                label="Respons AI" value={stats.aiResponses} />
              <StatCard icon={Clock} color="text-amber-600 bg-amber-500/10"
                label="Menunggu Agent" value={stats.pendingHandoffs} />
              <StatCard icon={Send} color="text-purple-600 bg-purple-500/10"
                label="Follow-up Terkirim" value={stats.followupsSent} />
              <StatCard icon={ClipboardList} color="text-rose-600 bg-rose-500/10"
                label="Pesanan" value={stats.totalOrders} />
            </div>

            {/* Forecast nilai deal (Fase 9) */}
            <div className="grid grid-cols-2 gap-4">
              <StatCard icon={Wallet} color="text-sky-600 bg-sky-500/10"
                label="Nilai Pipeline (belum closing)" value={formatRp(stats.pipelineValue || 0)} />
              <StatCard icon={TrendingUp} color="text-emerald-600 bg-emerald-500/10"
                label="Nilai Menang (won)" value={formatRp(stats.wonValue || 0)} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-card-app border border-app rounded-2xl p-6 shadow-sm">
                <h2 className="text-sm font-bold text-main mb-1">Aktivitas Harian</h2>
                <p className="text-[11px] text-muted-app mb-5">Percakapan baru vs respons AI per hari.</p>
                {stats.daily.length === 0 ? (
                  <p className="text-xs text-muted-app py-10 text-center">Belum ada data.</p>
                ) : (
                  <>
                    <div className="flex items-end gap-1.5 h-40">
                      {stats.daily.map(d => (
                        <div key={d.date} className="flex-1 flex items-end justify-center gap-0.5 group relative">
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-main text-card-app text-[10px] px-2 py-1 rounded-lg whitespace-nowrap z-10">
                            {formatDay(d.date)}: {d.conversations} chat, {d.aiResponses} AI
                          </div>
                          <div className="w-1/3 bg-blue-500 rounded-t"
                            style={{ height: `${(d.conversations / maxDaily) * 100}%`, minHeight: d.conversations ? 3 : 1 }} />
                          <div className="w-1/3 bg-emerald-500 rounded-t"
                            style={{ height: `${(d.aiResponses / maxDaily) * 100}%`, minHeight: d.aiResponses ? 3 : 1 }} />
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between mt-2 text-[9px] text-muted-app">
                      <span>{formatDay(stats.daily[0].date)}</span>
                      <span>{formatDay(stats.daily[stats.daily.length - 1].date)}</span>
                    </div>
                    <div className="flex gap-4 mt-3 text-[10px] text-muted-app">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> Percakapan baru
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Respons AI
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className="bg-card-app border border-app rounded-2xl p-6 shadow-sm">
                <h2 className="text-sm font-bold text-main mb-1">Lead Funnel</h2>
                <p className="text-[11px] text-muted-app mb-5">Sebaran percakapan per stage pipeline.</p>
                <div className="space-y-4">
                  {stageDefs.map(stage => {
                    const count = stats.stages?.[stage.key] || 0;
                    const pct = totalStaged ? Math.round((count / totalStaged) * 100) : 0;
                    return (
                      <div key={stage.key}>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="font-bold text-main">{stage.label}</span>
                          <span className="text-muted-app">{count} ({pct}%)</span>
                        </div>
                        <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${stageColorClass(stage.color).dot}`}
                            style={{ width: `${pct}%`, minWidth: count ? 6 : 0 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </LayoutShell>
  );
}

function StatCard({ icon: Icon, color, label, value }: {
  icon: any; color: string; label: string; value: number | string;
}) {
  return (
    <div className="bg-card-app border border-app rounded-2xl p-5 shadow-sm">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${color}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <p className="text-2xl font-bold text-main leading-none">
        {typeof value === 'number' ? value.toLocaleString('id-ID') : value}
      </p>
      <p className="text-[11px] text-muted-app mt-1.5">{label}</p>
    </div>
  );
}

function formatDay(key: string) {
  return new Date(key + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}
