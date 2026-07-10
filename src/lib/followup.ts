// Logika kandidat & template auto follow-up (Fase B).
// Logika murni dipisah dari I/O supaya bisa di-unit-test.

export const DEFAULT_FOLLOWUP_TEMPLATE =
  'Halo {nama}, sekadar menindaklanjuti percakapan kita sebelumnya. Apakah masih ada yang bisa kami bantu? 😊';

export interface FollowupBotConfig {
  followup_enabled: boolean | null;
  followup_delay_hours: number | null;
  followup_max_count: number | null;
  followup_stages: string[] | null;
}

export interface FollowupConversation {
  status: string;
  stage: string | null;
  last_message_at: string | null;
}

// Kandidat follow-up: percakapan active, stage termasuk konfigurasi,
// dan idle lebih lama dari delay. Pembatalan otomatis tercakup di sini:
// balasan pelanggan mem-bump last_message_at sehingga tidak lagi kandidat.
export function isFollowupCandidate(
  conv: FollowupConversation,
  bot: FollowupBotConfig,
  sentCount: number,
  now: Date = new Date()
): boolean {
  if (!bot.followup_enabled) return false;
  // Jangan follow-up percakapan pending (handoff) atau closed
  if (conv.status !== 'active') return false;

  const stages = bot.followup_stages?.length ? bot.followup_stages : ['interested', 'negotiating'];
  if (!stages.includes(conv.stage || 'new')) return false;

  if (sentCount >= (bot.followup_max_count ?? 2)) return false;

  if (!conv.last_message_at) return false;
  const delayMs = (bot.followup_delay_hours ?? 24) * 60 * 60 * 1000;
  const idleMs = now.getTime() - new Date(conv.last_message_at).getTime();
  return idleMs >= delayMs;
}

// Placeholder sederhana: {nama} → nama kontak
export function renderFollowupTemplate(
  template: string | null,
  vars: { nama?: string | null }
): string {
  const tpl = template?.trim() || DEFAULT_FOLLOWUP_TEMPLATE;
  return tpl.replaceAll('{nama}', vars.nama?.trim() || 'Kak');
}

// Jeda acak 5–30 detik antar pengiriman WA dalam satu batch
export function randomJitterMs(min = 5000, max = 30000): number {
  return Math.floor(min + Math.random() * (max - min));
}
