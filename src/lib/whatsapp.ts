import { supabaseAdmin } from '@/lib/supabase';
import { cached, cacheKeys } from '@/lib/cache';

// Koneksi WhatsApp level akun (1 user = 1 nomor WA). Key sesi worker Baileys
// = user_id pemilik koneksi; key bot_id lama masih dikenali untuk transisi.

export interface WhatsAppConnection {
  id: string;
  user_id: string;
  bot_id: string;
  enabled: boolean;
  phone_number: string | null;
  bot_type: string;
  phone_id: string | null;
  access_token: string | null;
}

const CONNECTION_COLUMNS = 'id, user_id, bot_id, enabled, phone_number, bot_type, phone_id, access_token';

// Lookup dari payload worker: key sesi bisa user_id (baru) atau bot_id (sesi
// lama di VPS yang belum di-rename). Cached ~60s — dibaca tiap pesan masuk.
export async function findConnectionBySessionKey(sessionKey: string): Promise<WhatsAppConnection | null> {
  return cached(cacheKeys.waConnection(sessionKey), async () => {
    const { data } = await supabaseAdmin
      .from('whatsapp_connections')
      .select(CONNECTION_COLUMNS)
      .or(`user_id.eq.${sessionKey},bot_id.eq.${sessionKey}`)
      .maybeSingle();
    return data;
  });
}

export async function findConnectionByPhone(phone: string): Promise<WhatsAppConnection | null> {
  return cached(cacheKeys.waConnection(`phone:${phone}`), async () => {
    const { data } = await supabaseAdmin
      .from('whatsapp_connections')
      .select(CONNECTION_COLUMNS)
      .eq('phone_number', phone)
      .maybeSingle();
    return data;
  });
}

// Kirim pesan lewat bridge Baileys. Dicoba dengan key sesi baru (user_id)
// dulu; kalau sesi di VPS masih ber-key bot_id lama, fallback ke key lama.
export async function sendWhatsAppViaBridge(sessionKeys: (string | null | undefined)[], to: string, text: string): Promise<void> {
  const bridgeUrl = process.env.WHATSAPP_BRIDGE_URL || 'http://localhost:3001';
  const keys = sessionKeys.filter(Boolean) as string[];
  let lastError: Error | null = null;

  for (const key of keys) {
    try {
      const res = await fetch(`${bridgeUrl}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId: key, to, text }),
      });
      if (res.ok) return;
      const body = await res.text().catch(() => '');
      lastError = new Error(`Bridge send failed (key ${key}): ${res.status} ${body}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error('Bridge send failed: no session key available');
}
