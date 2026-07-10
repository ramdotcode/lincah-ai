'use client';

import { useState, useEffect, useCallback } from 'react';
import LayoutShell from '@/components/LayoutShell';
import {
  Coins,
  MessageSquare,
  AlertCircle,
  RefreshCw,
  ShieldAlert,
  Undo2,
  BarChart3,
} from 'lucide-react';

const MODEL_META: Record<string, { label: string; bar: string; dot: string }> = {
  groq: { label: 'Groq (Llama 3.3 70B)', bar: 'bg-blue-500/80', dot: 'bg-blue-500' },
  deepseek: { label: 'DeepSeek v4 Flash', bar: 'bg-purple-500/80', dot: 'bg-purple-500' },
  zai: { label: 'Z.AI GLM 5.2', bar: 'bg-orange-500/80', dot: 'bg-orange-500' },
  nvidia: { label: 'Nvidia Nemotron 550B', bar: 'bg-green-500/80', dot: 'bg-green-500' },
};

interface DayTokens {
  date: string;
  tokens: Record<string, number>;
}

interface ModelStat {
  model: string;
  messages: number;
  tokens: number;
  latencyP50: number | null;
  latencyP95: number | null;
  fallbacks: number;
}

interface UsageData {
  days: DayTokens[];
  modelStats: ModelStat[];
  totals: { messages: number; tokens: number; fallbacks: number; rateLimited: number; followupsSent: number; errors: number };
  recentErrors: any[];
}

function StackedDailyChart({ days }: { days: DayTokens[] }) {
  const dayTotal = (d: DayTokens) => Object.values(d.tokens).reduce((s, v) => s + v, 0);
  const max = Math.max(...days.map(dayTotal), 1);

  return (
    <div>
      <div className="flex items-end gap-2 h-40 w-full">
        {days.map((d) => {
          const total = dayTotal(d);
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center justify-end group relative h-full">
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-card-app border border-app rounded px-1.5 py-0.5 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                {total.toLocaleString()} tokens
              </div>
              <div
                className="w-full flex flex-col-reverse rounded-t overflow-hidden"
                style={{ height: total === 0 ? '2px' : `${Math.max((total / max) * 100, 4)}%` }}
              >
                {Object.keys(MODEL_META).map((key) => {
                  const v = d.tokens[key] || 0;
                  if (v === 0 || total === 0) return null;
                  return (
                    <div
                      key={key}
                      className={MODEL_META[key].bar}
                      style={{ height: `${(v / total) * 100}%` }}
                      title={`${MODEL_META[key].label}: ${v.toLocaleString()} tokens`}
                    />
                  );
                })}
              </div>
              <span className="text-[10px] text-sub mt-1.5">
                {new Date(d.date + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 mt-4">
        {Object.entries(MODEL_META).map(([key, meta]) => (
          <span key={key} className="flex items-center gap-1.5 text-xs text-sub">
            <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function AdminUsagePage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/usage');
      if (res.status === 403) {
        setForbidden(true);
        setError(null);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastRefreshed(new Date());
      setError(null);
      setForbidden(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (forbidden) {
    return (
      <LayoutShell>
        <div className="max-w-5xl mx-auto py-20 px-6 text-center space-y-3">
          <ShieldAlert className="w-10 h-10 text-red-400 mx-auto" />
          <h1 className="text-lg font-semibold text-main">Khusus Admin</h1>
          <p className="text-sm text-sub">Akun kamu tidak punya role admin untuk membuka halaman ini.</p>
        </div>
      </LayoutShell>
    );
  }

  return (
    <LayoutShell>
      <div className="max-w-5xl mx-auto py-10 px-6 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-main">AI Usage (7 Hari)</h1>
            <p className="text-sm text-sub mt-0.5">
              {lastRefreshed
                ? `Last updated ${lastRefreshed.toLocaleTimeString('id-ID')}`
                : 'Loading...'}
            </p>
          </div>
          <button
            onClick={() => { setLoading(true); fetchData(); }}
            disabled={loading}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-app bg-card-app hover:bg-app transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            Failed to load usage data: {error}
          </div>
        )}

        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-card-app border border-app rounded-2xl p-5">
            <div className="flex items-center gap-2 text-sub text-sm mb-2">
              <Coins className="w-4 h-4" /> Total Tokens
            </div>
            <div className="text-2xl font-bold text-main">
              {data ? data.totals.tokens.toLocaleString() : '—'}
            </div>
            <div className="text-xs text-sub mt-1">prompt + completion, 7 hari</div>
          </div>

          <div className="bg-card-app border border-app rounded-2xl p-5">
            <div className="flex items-center gap-2 text-sub text-sm mb-2">
              <MessageSquare className="w-4 h-4" /> Pesan Diproses
            </div>
            <div className="text-2xl font-bold text-main">
              {data ? data.totals.messages.toLocaleString() : '—'}
            </div>
            <div className="text-xs text-sub mt-1">semua channel</div>
          </div>

          <div className="bg-card-app border border-app rounded-2xl p-5">
            <div className="flex items-center gap-2 text-sub text-sm mb-2">
              <Undo2 className="w-4 h-4" /> Fallback ke Groq
            </div>
            <div className={`text-2xl font-bold ${data && data.totals.fallbacks > 0 ? 'text-yellow-400' : 'text-main'}`}>
              {data ? data.totals.fallbacks : '—'}
            </div>
            <div className="text-xs text-sub mt-1">NIM gagal, Groq mengambil alih</div>
          </div>

          <div className="bg-card-app border border-app rounded-2xl p-5">
            <div className="flex items-center gap-2 text-sub text-sm mb-2">
              <AlertCircle className="w-4 h-4" /> Errors / Rate Limited
            </div>
            <div className={`text-2xl font-bold ${data && (data.totals.errors > 0 || data.totals.rateLimited > 0) ? 'text-red-400' : 'text-main'}`}>
              {data ? `${data.totals.errors} / ${data.totals.rateLimited}` : '—'}
            </div>
            <div className="text-xs text-sub mt-1">ai+webhook errors / rate limited</div>
          </div>

          <div className="bg-card-app border border-app rounded-2xl p-5">
            <div className="flex items-center gap-2 text-sub text-sm mb-2">
              <MessageSquare className="w-4 h-4" /> Follow-up Terkirim
            </div>
            <div className="text-2xl font-bold text-main">
              {data ? data.totals.followupsSent.toLocaleString() : '—'}
            </div>
            <div className="text-xs text-sub mt-1">auto follow-up, 7 hari</div>
          </div>
        </div>

        {/* Daily Tokens Stacked Chart */}
        <div className="bg-card-app border border-app rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-main mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Token per Hari per Model
          </h2>
          {loading && !data ? (
            <div className="flex items-center justify-center h-40 text-sub text-sm">Loading...</div>
          ) : (
            <StackedDailyChart days={data?.days || []} />
          )}
        </div>

        {/* Per-Model Table */}
        <div className="bg-card-app border border-app rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-main mb-4">Statistik per Model</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-sub border-b border-app">
                  <th className="pb-2 pr-4 font-medium">Model</th>
                  <th className="pb-2 pr-4 font-medium text-right">Pesan</th>
                  <th className="pb-2 pr-4 font-medium text-right">Tokens</th>
                  <th className="pb-2 pr-4 font-medium text-right">Latency p50</th>
                  <th className="pb-2 pr-4 font-medium text-right">Latency p95</th>
                  <th className="pb-2 font-medium text-right">Fallback</th>
                </tr>
              </thead>
              <tbody>
                {(data?.modelStats || []).map((m) => (
                  <tr key={m.model} className="border-b border-app/50 last:border-0">
                    <td className="py-2.5 pr-4">
                      <span className="flex items-center gap-2 text-main">
                        <span className={`w-2.5 h-2.5 rounded-full ${MODEL_META[m.model]?.dot || 'bg-zinc-400'}`} />
                        {MODEL_META[m.model]?.label || m.model}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-right text-main">{m.messages.toLocaleString()}</td>
                    <td className="py-2.5 pr-4 text-right text-main">{m.tokens.toLocaleString()}</td>
                    <td className="py-2.5 pr-4 text-right text-sub">{m.latencyP50 != null ? `${m.latencyP50}ms` : '—'}</td>
                    <td className="py-2.5 pr-4 text-right text-sub">{m.latencyP95 != null ? `${m.latencyP95}ms` : '—'}</td>
                    <td className="py-2.5 text-right text-sub">{m.fallbacks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Errors */}
        <div className="bg-card-app border border-app rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-main mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" /> Error Terbaru (7 Hari)
          </h2>
          {loading && !data ? (
            <div className="text-sub text-sm">Loading...</div>
          ) : !data?.recentErrors?.length ? (
            <div className="text-sm text-sub text-center py-6">Tidak ada error dalam 7 hari terakhir. 🎉</div>
          ) : (
            <div className="space-y-2">
              {data.recentErrors.map((err) => (
                <div key={err.id} className="flex flex-col gap-1 p-3 bg-app rounded-xl border border-app">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        err.event_type === 'ai_error'
                          ? 'bg-orange-500/10 text-orange-400'
                          : 'bg-red-500/10 text-red-400'
                      }`}>
                        {err.event_type}
                      </span>
                      <span className="text-xs text-sub">{err.channel}</span>
                      {err.metadata?.ai_model && (
                        <span className="text-xs text-sub">· model: {err.metadata.ai_model}</span>
                      )}
                    </div>
                    <span className="text-xs text-sub">
                      {new Date(err.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
                    </span>
                  </div>
                  <p className="text-xs text-main font-mono truncate">
                    {err.error_message || '(no message)'}
                  </p>
                  <p className="text-xs text-sub font-mono">bot: {err.bot_id?.slice(0, 8)}…</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </LayoutShell>
  );
}
