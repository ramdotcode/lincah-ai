import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWhatsAppViaBridge } from '@/lib/whatsapp';
import { sendTelegramMessage } from '@/lib/telegram';
import { formatRupiah } from '@/lib/xendit';
import { logEvent } from '@/lib/eventLog';

// Callback Xendit untuk pembayaran QRIS (event qr.payment, api-version
// 2022-07-31). Verifikasi via header x-callback-token = XENDIT_CALLBACK_TOKEN
// (webhook verification token di dashboard Xendit). Selalu balas 200 setelah
// terverifikasi agar Xendit tidak retry-storm; idempoten terhadap kiriman ulang.

export async function POST(req: NextRequest) {
  try {
    const expected = process.env.XENDIT_CALLBACK_TOKEN;
    if (!expected) {
      console.error('[Xendit] XENDIT_CALLBACK_TOKEN belum di-set — callback ditolak');
      return NextResponse.json({ error: 'Callback token not configured' }, { status: 503 });
    }
    if (req.headers.get('x-callback-token') !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    if (payload?.event !== 'qr.payment') {
      // Event lain (qr.expired dsb.) belum dipakai — ack saja
      return NextResponse.json({ ok: true });
    }

    const data = payload?.data || {};
    const status = String(data.status || '').toUpperCase();
    if (status !== 'SUCCEEDED') {
      return NextResponse.json({ ok: true });
    }

    // Cari baris payments: utamakan qr_id (external_id), fallback reference_id
    // (= payments.id yang kita kirim saat membuat QR)
    const qrId = data.qr_id || data.qr_code?.id || null;
    const referenceId = data.reference_id || data.qr_code?.reference_id || null;

    let payment: any = null;
    if (qrId) {
      const { data: row } = await supabaseAdmin
        .from('payments').select('*').eq('external_id', qrId).maybeSingle();
      payment = row;
    }
    if (!payment && referenceId) {
      const { data: row } = await supabaseAdmin
        .from('payments').select('*').eq('id', referenceId).maybeSingle();
      payment = row;
    }

    if (!payment) {
      console.error('[Xendit] Payment tidak ditemukan untuk callback:', { qrId, referenceId });
      return NextResponse.json({ ok: true });
    }
    if (payment.status === 'paid') {
      return NextResponse.json({ ok: true }); // kiriman ulang — sudah diproses
    }

    await supabaseAdmin
      .from('payments')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        raw: data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id);

    logEvent({
      bot_id: payment.bot_id,
      conversation_id: payment.conversation_id,
      channel: 'whatsapp',
      event_type: 'payment_paid',
      metadata: { payment_id: payment.id, amount: Number(payment.amount), provider: 'xendit' },
    });

    // Kabari pelanggan + catat di history percakapan (muncul di Monitor)
    const confirmText = `Pembayaran ${formatRupiah(Number(payment.amount))} sudah kami terima ✅ Terima kasih!`;

    if (payment.conversation_id) {
      const { data: conv } = await supabaseAdmin
        .from('conversations')
        .select('id, chat_id, platform, history, bot_id')
        .eq('id', payment.conversation_id)
        .maybeSingle();

      if (conv) {
        const { data: bot } = await supabaseAdmin
          .from('bots')
          .select('user_id, telegram_token')
          .eq('id', conv.bot_id)
          .maybeSingle();

        try {
          if (conv.platform === 'whatsapp') {
            await sendWhatsAppViaBridge([bot?.user_id, conv.bot_id], conv.chat_id, confirmText);
          } else if (conv.platform === 'telegram') {
            const token = bot?.telegram_token || process.env.TELEGRAM_BOT_TOKEN;
            if (token) await sendTelegramMessage(token, conv.chat_id, confirmText);
          }
          // widget: tidak ada kanal push — konfirmasi hanya tercatat di history
        } catch (sendError) {
          Sentry.captureException(sendError, {
            tags: { feature: 'xendit_webhook', error_type: 'confirm_send_failed' },
          });
        }

        await supabaseAdmin
          .from('conversations')
          .update({
            history: [...(conv.history || []), { role: 'assistant', content: confirmText }],
            last_message_at: new Date().toISOString(),
          })
          .eq('id', conv.id);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Xendit] Webhook error:', error);
    Sentry.captureException(error, { tags: { feature: 'xendit_webhook' } });
    // 200 agar Xendit tidak retry terus pada payload yang memang bermasalah
    return NextResponse.json({ ok: true });
  }
}
