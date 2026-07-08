'use client';

import { useState, useEffect, useCallback } from 'react';
import LayoutShell from '@/components/LayoutShell';
import {
  Activity,
  Zap,
  Coins,
  GitBranch,
  AlertCircle,
  RefreshCw,
  Wifi,
  WifiOff,
  Clock,
  CheckCircle2,
} from 'lucide-react';

interface HourlyMessage {
  hour: string;
  count: number;
}

interface HealthData {
  hourlyMessages: HourlyMessage[];
  latency: { p50: number | null; p95: number | null; sample_count: number };
  totalTokensToday: number;
  handoffsToday: number;
  recentErrors: any[];
  bridge: {
    status: string;
    uptime_seconds?: number;
    sessions?: { bot_id: string; state: string; last_message_at: string; last_state_change_at: string }[];
    error?: string;
  };
}

function SessionStateBadge({ state }: { state: string }) {
  if (state === 'open') return (
    <span className="flex items-center gap-1 text-xs text-green-500 font-medium">
      <CheckCircle2 className="w-3.5 h-3.5" /> Connected
    </span>
  );
  if (state === 'connecting') return (
    <span className="flex items-center gap-1 text-xs text-yellow-500 font-medium">
      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Connecting
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
      <WifiOff className="w-3.5 h-3.5" /> Disconnected
    </span>
  );
}

function MiniBarChart({ data }: { data: HourlyMessage[] }) {
  if (!data || data.length === 0) return (
    <div className="flex items-center justify-center h-20 text-sm text-sub">No data yet</div>
  );
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex items-end gap-0.5 h-20 w-full">
      {data.map((d, i) => {
        const heightPct = (d.count / max) * 100;
        const hour = new Date(d.hour + ':00:00Z').toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end group relative" title={`${hour}: ${d.count} msg`}>
            <div
              className="w-full bg-blue-500/70 group-hover:bg-blue-500 rounded-t transition-colors"
              style={{ height: d.count === 0 ? '2px' : `${Math.max(heightPct, 4)}%` }}
            />
            {/* Tooltip */}
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-card-app border border-app rounded px-1.5 py-0.5 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              {d.count}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminHealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/health');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastRefreshed(new Date());
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60 * 1000); // Auto-refresh every 60s
    return () => clearInterval(interval);
  }, [fetchData]);

  const bridgeOk = data?.bridge?.status === 'ok';
  const bridgeDegraded = data?.bridge?.status === 'degraded';
  const bridgeUnreachable = data?.bridge?.status === 'unreachable' || data?.bridge?.status === 'error';

  return (
    <LayoutShell>
      <div className="max-w-5xl mx-auto py-10 px-6 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-main">System Health</h1>
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
            Failed to load health data: {error}
          </div>
        )}

        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card-app border border-app rounded-2xl p-5">
            <div className="flex items-center gap-2 text-sub text-sm mb-2">
              <Zap className="w-4 h-4" /> Latency p50
            </div>
            <div className="text-2xl font-bold text-main">
              {data?.latency.p50 != null ? `${data.latency.p50}ms` : '—'}
            </div>
            <div className="text-xs text-sub mt-1">
              p95: {data?.latency.p95 != null ? `${data.latency.p95}ms` : '—'}
            </div>
          </div>

          <div className="bg-card-app border border-app rounded-2xl p-5">
            <div className="flex items-center gap-2 text-sub text-sm mb-2">
              <Coins className="w-4 h-4" /> Tokens Today
            </div>
            <div className="text-2xl font-bold text-main">
              {data != null ? data.totalTokensToday.toLocaleString() : '—'}
            </div>
            <div className="text-xs text-sub mt-1">prompt + completion</div>
          </div>

          <div className="bg-card-app border border-app rounded-2xl p-5">
            <div className="flex items-center gap-2 text-sub text-sm mb-2">
              <GitBranch className="w-4 h-4" /> Handoffs Today
            </div>
            <div className="text-2xl font-bold text-main">
              {data != null ? data.handoffsToday : '—'}
            </div>
            <div className="text-xs text-sub mt-1">transfers to human</div>
          </div>

          <div className="bg-card-app border border-app rounded-2xl p-5">
            <div className="flex items-center gap-2 text-sub text-sm mb-2">
              <Activity className="w-4 h-4" /> Errors (24h)
            </div>
            <div className={`text-2xl font-bold ${data && data.recentErrors.length > 0 ? 'text-red-400' : 'text-main'}`}>
              {data != null ? data.recentErrors.length : '—'}
            </div>
            <div className="text-xs text-sub mt-1">ai_error + webhook_error</div>
          </div>
        </div>

        {/* Hourly Messages Chart */}
        <div className="bg-card-app border border-app rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-main mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4" /> Messages Per Hour (Last 24h)
          </h2>
          {loading && !data ? (
            <div className="flex items-center justify-center h-20 text-sub text-sm">Loading...</div>
          ) : (
            <MiniBarChart data={data?.hourlyMessages || []} />
          )}
          <div className="flex justify-between text-xs text-sub mt-2">
            <span>24h ago</span>
            <span>Now</span>
          </div>
        </div>

        {/* Bridge Status */}
        <div className="bg-card-app border border-app rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-main mb-4 flex items-center gap-2">
            {bridgeOk ? <Wifi className="w-4 h-4 text-green-500" /> :
             bridgeUnreachable ? <WifiOff className="w-4 h-4 text-red-500" /> :
             <Wifi className="w-4 h-4 text-yellow-500" />}
            WhatsApp Bridge
            {data?.bridge && (
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${
                bridgeOk ? 'bg-green-500/10 text-green-500' :
                bridgeDegraded ? 'bg-yellow-500/10 text-yellow-500' :
                'bg-red-500/10 text-red-500'
              }`}>
                {data.bridge.status.toUpperCase()}
              </span>
            )}
          </h2>

          {loading && !data ? (
            <div className="text-sub text-sm">Loading...</div>
          ) : bridgeUnreachable ? (
            <div className="text-sm text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Bridge unreachable: {data?.bridge?.error || 'Connection failed'}
            </div>
          ) : data?.bridge?.status === 'not_configured' ? (
            <div className="text-sm text-sub">Bridge URL not configured (set WHATSAPP_BRIDGE_URL in env).</div>
          ) : data?.bridge?.sessions && data.bridge.sessions.length > 0 ? (
            <div className="space-y-3">
              {data.bridge.sessions.map((s) => (
                <div key={s.bot_id} className="flex items-center justify-between p-3 bg-app rounded-xl border border-app">
                  <div>
                    <div className="text-sm font-medium text-main font-mono">{s.bot_id.slice(0, 8)}…</div>
                    <div className="text-xs text-sub mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Last message: {new Date(s.last_message_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
                    </div>
                  </div>
                  <SessionStateBadge state={s.state} />
                </div>
              ))}
              {data.bridge.uptime_seconds != null && (
                <p className="text-xs text-sub">
                  Bridge uptime: {Math.floor(data.bridge.uptime_seconds / 3600)}h {Math.floor((data.bridge.uptime_seconds % 3600) / 60)}m
                </p>
              )}
            </div>
          ) : (
            <div className="text-sm text-sub">No active sessions.</div>
          )}
        </div>

        {/* Recent Errors */}
        <div className="bg-card-app border border-app rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-main mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" /> Recent Errors
          </h2>
          {loading && !data ? (
            <div className="text-sub text-sm">Loading...</div>
          ) : !data?.recentErrors?.length ? (
            <div className="text-sm text-sub text-center py-6">
              No errors in the last 24 hours.
            </div>
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
