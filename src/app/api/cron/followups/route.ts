import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { supabaseAdmin } from '@/lib/supabase';
import { sendTelegramMessage } from '@/lib/telegram';
import { logEvent } from '@/lib/eventLog';
import { isFollowupCandidate, renderFollowupTemplate, randomJitterMs } from '@/lib/followup';
import { generateFollowupMessage } from '@/lib/ai';
import { sendWhatsAppViaBridge } from '@/lib/whatsapp';

// Batch WA dengan jitter 5–30 detik bisa memakan waktu beberapa menit
export const maxDuration = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Dipanggil Vercel Cron tiap 20 menit (lihat vercel.json).
// Scheduler dinamis: kandidat dihitung ulang tiap run dari last_message_at,
// jadi pelanggan yang membalas otomatis keluar dari daftar (pembatalan implisit).
export async function GET(req: NextRequest) {
  // Vercel Cron mengirim Authorization: Bearer ${CRON_SECRET}
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const summary = { candidates: 0, sent: 0, failed: 0, cancelled: 0, skipped_rate_limit: 0, ai_generated: 0, ai_fallback: 0 };

  try {
    // 1. Bot dengan follow-up aktif
    const { data: bots, error: botsError } = await supabaseAdmin
      .from('bots')
      .select('*')
      .eq('followup_enabled', true);
    if (botsError) throw botsError;

    for (const bot of bots || []) {
      const delayHours = bot.followup_delay_hours ?? 24;
      const cutoff = new Date(Date.now() - delayHours * 60 * 60 * 1000).toISOString();
      const stages = bot.followup_stages?.length ? bot.followup_stages : ['interested', 'negotiating'];

      // 2. Kandidat: active, idle melewati delay, WA/Telegram (webchat tak bisa di-push).
      //    Tanpa trigger label → filter stage di query (efisien). Dengan trigger label
      //    (Fase 8) → ambil lebih luas lalu saring stage-ATAU-label di aplikasi.
      const labelIds: string[] = bot.followup_label_ids || [];
      let convQuery = supabaseAdmin
        .from('conversations')
        .select('id, chat_id, platform, status, stage, name, customer_name, history, last_message_at')
        .eq('bot_id', bot.id)
        .eq('status', 'active')
        .in('platform', ['whatsapp', 'telegram'])
        .lt('last_message_at', cutoff)
        .limit(100);
      if (labelIds.length === 0) convQuery = convQuery.in('stage', stages);

      const { data: rawConvs, error: convsError } = await convQuery;
      if (convsError) throw convsError;
      let convs = rawConvs || [];
      if (!convs.length) continue;

      // Percakapan yang dipicu label (untuk melewati gate stage saat pengecekan kandidat)
      const labelTriggered = new Set<string>();
      if (labelIds.length > 0) {
        const { data: labelRows } = await supabaseAdmin
          .from('conversation_labels')
          .select('conversation_id')
          .in('conversation_id', convs.map(c => c.id))
          .in('label_id', labelIds);
        for (const r of labelRows || []) labelTriggered.add(r.conversation_id);
        // Simpan hanya yang stage-nya cocok ATAU punya label pemicu
        convs = convs.filter(c => stages.includes(c.stage) || labelTriggered.has(c.id));
      }
      if (!convs.length) continue;

      // 3. Hitung follow-up terkirim per conversation (untuk max_count)
      const convIds = convs.map((c) => c.id);
      const { data: sentRows } = await supabaseAdmin
        .from('followups')
        .select('conversation_id')
        .in('conversation_id', convIds)
        .eq('status', 'sent');
      const sentCounts: Record<string, number> = {};
      for (const row of sentRows || []) {
        sentCounts[row.conversation_id] = (sentCounts[row.conversation_id] || 0) + 1;
      }

      // 4. Rate limit WA per bot per jam (Fase B3)
      const waHourlyLimit = bot.followup_wa_hourly_limit ?? 10;
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count: waSentLastHour } = await supabaseAdmin
        .from('followups')
        .select('id, conversations!inner(bot_id, platform)', { count: 'exact', head: true })
        .eq('conversations.bot_id', bot.id)
        .eq('conversations.platform', 'whatsapp')
        .eq('status', 'sent')
        .gte('sent_at', hourAgo);
      let waBudget = Math.max(0, waHourlyLimit - (waSentLastHour || 0));

      let waSentInBatch = 0;
      for (const conv of convs) {
        const sentCount = sentCounts[conv.id] || 0;
        if (!isFollowupCandidate(conv, bot, sentCount, new Date(), { ignoreStage: labelTriggered.has(conv.id) })) continue;
        summary.candidates++;

        const isWA = conv.platform === 'whatsapp';
        if (isWA && waBudget <= 0) {
          summary.skipped_rate_limit++;
          continue;
        }

        // Jeda acak antar pengiriman WA dalam satu batch (jangan burst)
        if (isWA && waSentInBatch > 0) {
          await sleep(randomJitterMs());
        }

        // Cek ulang tepat sebelum kirim: pelanggan mungkin membalas selama jitter
        const { data: fresh } = await supabaseAdmin
          .from('conversations')
          .select('status, last_message_at')
          .eq('id', conv.id)
          .single();
        const stale =
          !fresh ||
          fresh.status !== 'active' ||
          fresh.last_message_at !== conv.last_message_at;

        // Catat attempt ke tabel followups
        const { data: followupRow } = await supabaseAdmin
          .from('followups')
          .insert({ conversation_id: conv.id, status: 'scheduled', attempt_number: sentCount + 1 })
          .select('id')
          .single();

        if (stale) {
          if (followupRow) {
            await supabaseAdmin.from('followups')
              .update({ status: 'cancelled' }).eq('id', followupRow.id);
          }
          summary.cancelled++;
          continue;
        }

        // Susun pesan: mode 'ai' → AI-kontekstual dari riwayat, fallback ke template
        // bila gagal/kosong; mode 'template' (default) → template statis {nama}.
        const customerName = conv.name || conv.customer_name;
        let text: string;
        let usedAi = false;
        if (bot.followup_mode === 'ai') {
          const gen = await generateFollowupMessage(conv.history || [], {
            systemPrompt: bot.system_prompt,
            customerName,
          });
          if (gen.message) {
            text = gen.message;
            usedAi = true;
            summary.ai_generated++;
          } else {
            text = renderFollowupTemplate(bot.followup_template, { nama: customerName });
            summary.ai_fallback++;
          }
        } else {
          text = renderFollowupTemplate(bot.followup_template, { nama: customerName });
        }

        try {
          if (isWA) {
            // Key sesi baru = user_id pemilik akun; bot.id lama untuk sesi belum migrasi
            await sendWhatsAppViaBridge([bot.user_id, bot.id], conv.chat_id, text);
            waBudget--;
            waSentInBatch++;
          } else {
            await sendTelegramMessage(
              bot.telegram_token || process.env.TELEGRAM_BOT_TOKEN!,
              conv.chat_id,
              text
            );
          }

          // Tandai terkirim + masukkan ke history dengan penanda follow-up (badge di Monitor).
          // last_message_at ikut di-bump supaya follow-up berikutnya menunggu delay lagi.
          if (followupRow) {
            await supabaseAdmin.from('followups')
              .update({ status: 'sent', sent_at: new Date().toISOString() })
              .eq('id', followupRow.id);
          }
          await supabaseAdmin.from('conversations').update({
            history: [...(conv.history || []), { role: 'assistant', content: text, followup: true }],
            last_message: text,
            last_message_at: new Date().toISOString(),
          }).eq('id', conv.id);

          logEvent({
            bot_id: bot.id,
            conversation_id: conv.id,
            channel: isWA ? 'whatsapp' : 'telegram',
            event_type: 'followup_sent',
            metadata: { attempt_number: sentCount + 1, stage: conv.stage, mode: usedAi ? 'ai' : 'template' },
          });
          summary.sent++;
        } catch (sendError) {
          // Gagal (mis. sesi WA disconnect): tandai failed, coba lagi di run berikutnya —
          // tidak ada retry loop di sini
          if (followupRow) {
            await supabaseAdmin.from('followups')
              .update({ status: 'failed' }).eq('id', followupRow.id);
          }
          logEvent({
            bot_id: bot.id,
            conversation_id: conv.id,
            channel: isWA ? 'whatsapp' : 'telegram',
            event_type: 'followup_failed',
            error_message: sendError instanceof Error ? sendError.message : String(sendError),
            metadata: { attempt_number: sentCount + 1 },
          });
          summary.failed++;
        }
      }
    }

    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error('Followup cron error:', error);
    Sentry.captureException(error, { tags: { feature: 'followup_cron' } });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error), ...summary },
      { status: 500 }
    );
  }
}
