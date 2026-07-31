import { supabaseAdmin } from '@/lib/supabase';
import { cached, cacheKeys } from '@/lib/cache';
import {
  BotTool,
  parseOrderArgs,
  parseContactArgs,
  parsePaymentArgs,
  searchProducts,
  findShippingRate,
  formatStockResult,
  formatShippingResult,
} from '@/lib/toolDefs';
import { createQrisQr, appBaseUrl, formatRupiah } from '@/lib/xendit';

export type { BotTool } from '@/lib/toolDefs';
export { buildToolSchemas } from '@/lib/toolDefs';

// Lampiran (gambar QR, dst.) yang dihasilkan tool untuk dikirim ke pelanggan
// setelah bubble teks — diisi executor, dibaca route webhook per channel.
export interface ToolMedia {
  url: string;
  caption?: string;
}

export interface ToolContext {
  botId: string;
  conversationId: string | null;
  customerContact: string | null; // chat_id (nomor WA / telegram id / session widget)
  contactId?: string | null; // CRM contact yang tertaut ke percakapan (Fase CRM 1)
  channel?: 'whatsapp' | 'telegram' | 'widget';
  media?: ToolMedia[]; // caller menyediakan array kosong bila channel-nya bisa mengirim media
  tools: BotTool[];
}

// Eksekusi satu tool call dari model. Selalu mengembalikan string untuk
// dikirim balik sebagai role:"tool" — tidak pernah throw, error dikembalikan
// sebagai teks agar model bisa menjelaskan ke pelanggan.
export async function executeTool(
  toolName: string,
  args: any,
  ctx: ToolContext
): Promise<string> {
  try {
    const tool = ctx.tools.find(t => t.tool_type === toolName && t.enabled);
    if (!tool) return `Tool ${toolName} tidak tersedia.`;

    switch (toolName) {
      case 'check_stock': {
        const products = Array.isArray(tool.config?.products) ? tool.config.products : [];
        const matches = searchProducts(products, String(args?.product_name || ''));
        return formatStockResult(matches, String(args?.product_name || ''));
      }

      case 'check_shipping': {
        const rates = Array.isArray(tool.config?.rates) ? tool.config.rates : [];
        const rate = findShippingRate(rates, String(args?.destination || ''));
        return formatShippingResult(rate, String(args?.destination || ''));
      }

      case 'create_order': {
        const { order, error } = parseOrderArgs(args);
        if (!order) return `Pesanan belum bisa dicatat: ${error} Minta data yang kurang ke pelanggan.`;

        const { data, error: dbError } = await supabaseAdmin
          .from('orders')
          .insert({
            bot_id: ctx.botId,
            conversation_id: ctx.conversationId,
            customer_name: order.customer_name,
            customer_contact: ctx.customerContact,
            items: order.items,
            address: order.address,
            notes: order.notes,
          })
          .select('id')
          .single();

        if (dbError || !data) {
          return 'Terjadi kendala teknis saat mencatat pesanan. Minta pelanggan mencoba lagi atau teruskan ke admin.';
        }

        const itemList = order.items.map(i => `${i.name} x${i.qty}`).join(', ');
        const orderRef = data.id.slice(0, 8).toUpperCase();
        return `Pesanan berhasil dicatat dengan nomor referensi ${orderRef}. Detail: ${itemList}, atas nama ${order.customer_name}, dikirim ke ${order.address}. Sampaikan nomor referensi ini ke pelanggan.`;
      }

      case 'update_contact': {
        const { fields, error } = parseContactArgs(args);
        if (!fields) return `Data kontak belum bisa disimpan: ${error}`;

        // Resolve kontak: dari context, fallback via percakapan
        let contactId = ctx.contactId || null;
        if (!contactId && ctx.conversationId) {
          const { data: convRow } = await supabaseAdmin
            .from('conversations')
            .select('contact_id')
            .eq('id', ctx.conversationId)
            .maybeSingle();
          contactId = convRow?.contact_id || null;
        }
        if (!contactId) {
          return 'Data kontak belum tersedia untuk percakapan ini. Lanjutkan percakapan seperti biasa.';
        }

        const { data: contact } = await supabaseAdmin
          .from('contacts')
          .select('name, email, phone, company, address, notes')
          .eq('id', contactId)
          .maybeSingle();
        if (!contact) {
          return 'Data kontak belum tersedia untuk percakapan ini. Lanjutkan percakapan seperti biasa.';
        }

        // Merge policy: fill-if-empty untuk field identitas (lindungi edit manual),
        // append untuk notes (dedup, dibatasi panjangnya)
        const updates: Record<string, string> = {};
        const savedFields: string[] = [];
        const identityKeys = ['name', 'email', 'phone', 'company', 'address'] as const;
        for (const key of identityKeys) {
          if (fields[key] && !contact[key]) {
            updates[key] = fields[key]!;
            savedFields.push(key);
          }
        }
        if (fields.notes) {
          const existingNotes = contact.notes || '';
          if (!existingNotes.includes(fields.notes)) {
            updates.notes = (existingNotes ? `${existingNotes}\n${fields.notes}` : fields.notes).slice(0, 2000);
            savedFields.push('notes');
          }
        }

        if (savedFields.length === 0) {
          return 'Data kontak sudah tercatat sebelumnya. Lanjutkan percakapan tanpa mengumumkan hal ini.';
        }

        const { error: dbError } = await supabaseAdmin
          .from('contacts')
          .update(updates)
          .eq('id', contactId);
        if (dbError) {
          console.error('[Tools] update_contact failed:', dbError);
          return 'Terjadi kendala teknis saat menyimpan data kontak. Lanjutkan percakapan seperti biasa.';
        }

        return `Data kontak tersimpan (${savedFields.join(', ')}). Lanjutkan percakapan tanpa mengumumkan hal ini ke pelanggan.`;
      }

      case 'create_payment': {
        const { payment, error } = parsePaymentArgs(args);
        if (!payment) return `Pembayaran belum bisa dibuat: ${error}`;

        const secretKey =
          (typeof tool.config?.secret_key === 'string' && tool.config.secret_key.trim()) ||
          process.env.XENDIT_SECRET_KEY;
        if (!secretKey) {
          return 'Integrasi pembayaran belum dikonfigurasi (API key Xendit kosong). Sampaikan ke pelanggan bahwa admin akan mengirim detail pembayaran secara manual.';
        }

        const expiryMinutes =
          Number(tool.config?.expiry_minutes) > 0 ? Math.round(Number(tool.config.expiry_minutes)) : 30;

        // Baris pending dulu — id-nya jadi reference_id Xendit sekaligus URL gambar QR
        const { data: payRow, error: insertError } = await supabaseAdmin
          .from('payments')
          .insert({
            bot_id: ctx.botId,
            conversation_id: ctx.conversationId,
            customer_contact: ctx.customerContact,
            provider: 'xendit',
            amount: payment.amount,
            description: payment.description,
            status: 'pending',
          })
          .select('id')
          .single();

        if (insertError || !payRow) {
          return 'Terjadi kendala teknis saat menyiapkan pembayaran. Sampaikan ke pelanggan bahwa admin akan mengirim detail pembayaran secara manual.';
        }

        try {
          const qr = await createQrisQr({
            secretKey,
            referenceId: payRow.id,
            amount: payment.amount,
            expiresAt: new Date(Date.now() + expiryMinutes * 60_000).toISOString(),
          });

          await supabaseAdmin
            .from('payments')
            .update({
              external_id: qr.id,
              qr_string: qr.qr_string,
              expires_at: qr.expires_at || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', payRow.id);

          const amountText = formatRupiah(payment.amount);
          const qrUrl = `${appBaseUrl()}/api/payments/${payRow.id}/qr`;
          const descPart = payment.description ? ` — ${payment.description}` : '';

          if (ctx.media) {
            ctx.media.push({
              url: qrUrl,
              caption: `QRIS ${amountText}${descPart}. Berlaku ${expiryMinutes} menit.`,
            });
            return `QR QRIS sebesar ${amountText} berhasil dibuat dan gambarnya OTOMATIS terkirim ke pelanggan setelah balasanmu. Beri tahu pelanggan: scan QR tersebut dengan e-wallet/mobile banking apa pun, berlaku ${expiryMinutes} menit, dan konfirmasi otomatis dikirim setelah pembayaran diterima. JANGAN menulis link atau mengarang nomor pembayaran.`;
          }

          return `QR QRIS sebesar ${amountText} berhasil dibuat. Bagikan link gambar QR ini ke pelanggan: ${qrUrl} (berlaku ${expiryMinutes} menit). Konfirmasi otomatis dikirim setelah pembayaran diterima.`;
        } catch (error) {
          console.error('[Tools] create_payment Xendit error:', error);
          await supabaseAdmin
            .from('payments')
            .update({ status: 'failed', updated_at: new Date().toISOString() })
            .eq('id', payRow.id);
          return 'Pembuatan QR pembayaran gagal. Sampaikan ke pelanggan bahwa admin akan mengirim detail pembayaran secara manual.';
        }
      }

      default:
        return `Tool ${toolName} tidak dikenali.`;
    }
  } catch (error) {
    console.error(`[Tools] ${toolName} failed:`, error);
    return 'Terjadi kendala teknis saat menjalankan aksi. Sampaikan ke pelanggan bahwa permintaan akan diproses admin.';
  }
}

// Ambil tools aktif milik bot (dipanggil webhook hanya jika bot.tools_enabled).
// Cached ~60s (Fase E1).
export async function fetchBotTools(botId: string): Promise<BotTool[]> {
  return cached(cacheKeys.tools(botId), async () => {
    const { data } = await supabaseAdmin
      .from('bot_tools')
      .select('id, bot_id, tool_type, enabled, config')
      .eq('bot_id', botId)
      .eq('enabled', true);
    return (data as BotTool[]) || [];
  });
}
