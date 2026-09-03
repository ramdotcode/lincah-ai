// Batas jumlah balasan AI per percakapan — deterministik, di kode.
//
// Aturan "bot cuma N balasan inti lalu serahkan ke owner" dulu dititipkan ke
// transfer_condition, tapi handoff checker berjalan di model tier `fast` dan
// tidak sanggup menalar riwayat. Uji 3 Sep 2026: setelah harga keluar bot masih
// menjawab 3 pesan, sempat bilang "aku sambungin ke Rama" tanpa handoff beneran
// (status tetap active, tidak ada notif). Karena itu batasnya dihitung di sini,
// bukan diserahkan ke model.

/** Bentuk minimal satu entri history yang dibutuhkan penghitung. */
export interface CountableMessage {
  role?: string;
  /** Pesan follow-up otomatis (cron/followups) — bukan balasan atas pesan lead. */
  followup?: boolean;
  /** Balasan manual owner dari HP (from_me) yang disimpan sebagai assistant. */
  manual?: boolean;
  /** Welcome message yang cuma dirender di Playground/widget. */
  welcome?: boolean;
}

/**
 * Jumlah balasan AI yang benar-benar sudah dikirim ke pelanggan.
 *
 * Follow-up otomatis, balasan manual owner, dan welcome message TIDAK dihitung —
 * ketiganya tersimpan sebagai `assistant` tapi bukan giliran bicara bot.
 */
export function countAiReplies(history: CountableMessage[] | null | undefined): number {
  if (!Array.isArray(history)) return 0;
  return history.filter(
    (m) => m?.role === 'assistant' && !m.followup && !m.manual && !m.welcome,
  ).length;
}

/**
 * True bila balasan berikutnya harus jadi balasan TERAKHIR bot (pamit + handoff).
 * `maxAiReplies` null/0/negatif = tanpa batas.
 */
export function shouldForceHandoff(
  history: CountableMessage[] | null | undefined,
  maxAiReplies: number | null | undefined,
): boolean {
  const max = Number(maxAiReplies);
  if (!Number.isFinite(max) || max <= 0) return false;
  return countAiReplies(history) >= max;
}

// Jaring pengaman kedua: model kadang berpamitan sendiri tanpa checker bilang
// YES, dan percakapan menggantung di status active — pelanggan menunggu balasan
// yang tidak akan datang. Kalau teks balasan sudah pamit, perlakukan sebagai
// handoff. Frasa ini milik bot Ramcode; bot lain tidak memakainya, jadi aman
// dibiarkan aktif untuk semua bot.
export const HANDOFF_PHRASES: RegExp[] = [
  /sambungin\s+ke\s+rama/i,
  /sambungkan\s+ke\s+rama/i,
];

/** True bila teks balasan mengandung salah satu frasa pamit di HANDOFF_PHRASES. */
export function matchesHandoffPhrase(text: string | null | undefined): boolean {
  if (!text) return false;
  return HANDOFF_PHRASES.some((re) => re.test(text));
}
