import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase';
import { isAdmin } from '@/lib/roles';

const MODEL_KEYS = ['groq', 'deepseek', 'zai', 'nvidia'] as const;

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [processed, errors, rateLimited, followupsSent] = await Promise.all([
      supabaseAdmin
        .from('event_logs')
        .select('created_at, prompt_tokens, completion_tokens, latency_main_ms, metadata')
        .eq('event_type', 'message_processed')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: true })
        .limit(10000),
      supabaseAdmin
        .from('event_logs')
        .select('id, created_at, channel, event_type, error_message, bot_id, metadata')
        .in('event_type', ['ai_error', 'webhook_error'])
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(20),
      supabaseAdmin
        .from('event_logs')
        .select('id', { count: 'exact', head: true })
        .eq('event_type', 'rate_limited')
        .gte('created_at', sevenDaysAgo.toISOString()),
      supabaseAdmin
        .from('event_logs')
        .select('id', { count: 'exact', head: true })
        .eq('event_type', 'followup_sent')
        .gte('created_at', sevenDaysAgo.toISOString()),
    ]);

    const rows = processed.data || [];

    // Daily buckets (Jakarta time) for the stacked chart
    const jakartaDay = (iso: string) =>
      new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      days.push(jakartaDay(new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString()));
    }

    const emptyPerModel = () => Object.fromEntries(MODEL_KEYS.map(k => [k, 0]));
    const dailyTokens: Record<string, Record<string, number>> = Object.fromEntries(
      days.map(d => [d, emptyPerModel()])
    );

    const perModel: Record<string, { messages: number; tokens: number; latencies: number[]; fallbacks: number }> =
      Object.fromEntries(MODEL_KEYS.map(k => [k, { messages: 0, tokens: 0, latencies: [], fallbacks: 0 }]));

    for (const row of rows) {
      const meta = (row.metadata || {}) as Record<string, unknown>;
      const rawModel = typeof meta.ai_model === 'string' ? meta.ai_model : 'groq';
      // Events lama ('standard'/'advance') semuanya Groq-backed
      const model = (MODEL_KEYS as readonly string[]).includes(rawModel) ? rawModel : 'groq';
      const tokens = (row.prompt_tokens || 0) + (row.completion_tokens || 0);

      const day = jakartaDay(row.created_at);
      if (dailyTokens[day]) dailyTokens[day][model] += tokens;

      perModel[model].messages += 1;
      perModel[model].tokens += tokens;
      if (row.latency_main_ms != null) perModel[model].latencies.push(row.latency_main_ms);
      if (meta.used_fallback === true) perModel[model].fallbacks += 1;
    }

    const modelStats = MODEL_KEYS.map(key => {
      const m = perModel[key];
      const sorted = [...m.latencies].sort((a, b) => a - b);
      return {
        model: key,
        messages: m.messages,
        tokens: m.tokens,
        latencyP50: percentile(sorted, 50),
        latencyP95: percentile(sorted, 95),
        fallbacks: m.fallbacks,
      };
    });

    return NextResponse.json({
      days: days.map(d => ({ date: d, tokens: dailyTokens[d] })),
      modelStats,
      totals: {
        messages: rows.length,
        tokens: modelStats.reduce((s, m) => s + m.tokens, 0),
        fallbacks: modelStats.reduce((s, m) => s + m.fallbacks, 0),
        rateLimited: rateLimited.count || 0,
        followupsSent: followupsSent.count || 0,
        errors: errors.data?.length || 0,
      },
      recentErrors: errors.data || [],
    });
  } catch (error: any) {
    console.error('Admin Usage Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
