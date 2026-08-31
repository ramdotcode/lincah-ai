// Logika murni pesan WhatsApp (Baileys), dipisah dari whatsapp-worker.mts
// supaya bisa di-unit-test tanpa menyalakan socket.

// Patch 3 (SETUP-Ramcode-CTWA §F): pesan tanpa teks (foto/dokumen/VN)
// jangan didiamkan — alur preview justru MEMINTA orang kirim foto.
// Caption dipakai kalau ada; stiker/reaction/protokol tetap diabaikan (null).
export function extractMessageText(message: any): string | null {
  if (!message) return null;
  const text = message.conversation || message.extendedTextMessage?.text || '';
  if (text) return text;
  if (message.imageMessage) return message.imageMessage.caption || '[pelanggan mengirim foto]';
  if (message.videoMessage) return message.videoMessage.caption || '[pelanggan mengirim video]';
  if (message.documentMessage) return '[pelanggan mengirim dokumen]';
  if (message.audioMessage) return '[pelanggan mengirim voice note]';
  return null;
}

// Patch 5 (SETUP-Ramcode-CTWA §F): payload CTWA Meta membawa info creative
// asal chat di contextInfo.externalAdReply. Ini satu-satunya jalan mengukur
// closing rate per creative, jangan dibuang.
export interface WaAdContext {
  title?: string;
  body?: string;
  source_id?: string;
  source_url?: string;
  ctwa_clid?: string;
}

export function extractAdContext(message: any): WaAdContext | null {
  if (!message || typeof message !== 'object') return null;
  // externalAdReply bisa menempel di extendedTextMessage, imageMessage, dll —
  // tergantung bentuk pesan pertama dari iklan. Periksa semua bagian pesan.
  let ad: any = null;
  for (const part of Object.values(message)) {
    const candidate = (part as any)?.contextInfo?.externalAdReply;
    if (candidate && typeof candidate === 'object') {
      ad = candidate;
      break;
    }
  }
  if (!ad) return null;

  const ctx: WaAdContext = {};
  if (ad.title) ctx.title = String(ad.title);
  if (ad.body) ctx.body = String(ad.body);
  if (ad.sourceId) ctx.source_id = String(ad.sourceId);
  if (ad.sourceUrl) ctx.source_url = String(ad.sourceUrl);
  if (ad.ctwaClid) ctx.ctwa_clid = String(ad.ctwaClid);
  return Object.keys(ctx).length ? ctx : null;
}
