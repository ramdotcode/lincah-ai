import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const now = new Date();
    const jakartaOffset = 7 * 60; // UTC+7
    const todayStart = new Date(now.getTime() + jakartaOffset * 60000);
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayStartUtc = new Date(todayStart.getTime() - jakartaOffset * 60000);

    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 1. Messages per hour (last 24h)
    const { data: hourlyData } = await supabaseAdmin
      .from('event_logs')
      .select('created_at')
      .eq('event_type', 'message_processed')
      .gte('created_at', oneDayAgo.toISOString());

    // Group by hour in JS
    const hourlyCounts: Record<string, number> = {};
    for (let i = 23; i >= 0; i--) {
      const hour = new Date(now.getTime() - i * 60 * 60 * 1000);
      const key = hour.toISOString().slice(0, 13); // "2026-07-09T10"
      hourlyCounts[key] = 0;
    }
    (hourlyData || []).forEach((row: any) => {
      const key = row.created_at.slice(0, 13);
      if (hourlyCounts[key] !== undefined) hourlyCounts[key]++;
    });

    // 2. Latency p50 & p95 (last 24h)
    const { data: latencyData } = await supabaseAdmin
      .from('event_logs')
      .select('latency_main_ms')
      .eq('event_type', 'message_processed')
      .gte('created_at', oneDayAgo.toISOString())
      .not('latency_main_ms', 'is', null);

    const latencies = (latencyData || [])
      .map((r: any) => r.latency_main_ms)
      .filter(Boolean)
      .sort((a: number, b: number) => a - b);

    const p50 = latencies.length > 0
      ? latencies[Math.floor(latencies.length * 0.5)]
      : null;
    const p95 = latencies.length > 0
      ? latencies[Math.floor(latencies.length * 0.95)]
      : null;

    // 3. Total tokens today
    const { data: tokenData } = await supabaseAdmin
      .from('event_logs')
      .select('prompt_tokens, completion_tokens')
      .eq('event_type', 'message_processed')
      .gte('created_at', todayStartUtc.toISOString());

    const totalTokens = (tokenData || []).reduce((sum: number, row: any) => {
      return sum + (row.prompt_tokens || 0) + (row.completion_tokens || 0);
    }, 0);

    // 4. Handoff count today
    const { count: handoffCount } = await supabaseAdmin
      .from('event_logs')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', 'message_processed')
      .eq('handoff_result', true)
      .gte('created_at', todayStartUtc.toISOString());

    // 5. Last 20 errors
    const { data: errors } = await supabaseAdmin
      .from('event_logs')
      .select('id, created_at, bot_id, channel, event_type, error_message')
      .in('event_type', ['ai_error', 'webhook_error'])
      .order('created_at', { ascending: false })
      .limit(20);

    // 6. Bridge status (fetch from bridge, server-side only)
    let bridgeStatus = null;
    const bridgeUrl = process.env.WHATSAPP_BRIDGE_URL;
    const healthToken = process.env.HEALTH_TOKEN;

    if (bridgeUrl && healthToken) {
      try {
        const res = await fetch(`${bridgeUrl}/health`, {
          headers: { 'x-health-token': healthToken },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          bridgeStatus = await res.json();
        } else {
          bridgeStatus = { status: 'error', error: `HTTP ${res.status}` };
        }
      } catch (err: any) {
        bridgeStatus = { status: 'unreachable', error: err.message };
      }
    } else {
      bridgeStatus = { status: 'not_configured' };
    }

    return NextResponse.json({
      hourlyMessages: Object.entries(hourlyCounts).map(([hour, count]) => ({ hour, count })),
      latency: { p50, p95, sample_count: latencies.length },
      totalTokensToday: totalTokens,
      handoffsToday: handoffCount || 0,
      recentErrors: errors || [],
      bridge: bridgeStatus,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
