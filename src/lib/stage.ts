// Aturan transisi stage CRM (Fase A4, diperluk untuk stage custom Fase 7).
// Logika murni dipisah dari I/O supaya bisa di-unit-test.

// Default order/lost (perilaku lama) dipakai bila konfigurasi stage tidak diberikan.
export const STAGE_ORDER = ['new', 'interested', 'negotiating', 'won'];
const DEFAULT_LOST = ['lost'];

export interface StageConfig {
  order: string[];    // stage 'open' urut posisi, diikuti 'won' (tidak termasuk 'lost')
  lostKeys: string[]; // stage bertipe 'lost'
}

export interface StageAdvanceInput {
  currentStage: string | null;
  proposedStage: string | null;
  stageUpdatedBy: string | null;      // 'ai' | 'manual' | null
  stageUpdatedAt: string | null;      // ISO timestamp
  lastCustomerMessageAt: string;      // ISO timestamp pesan pelanggan terbaru
}

// AI hanya boleh menaikkan stage:
// - forward-only mengikuti urutan config.order; stage 'lost' tidak pernah otomatis
// - stage manual tidak ditimpa kecuali ada pesan pelanggan baru setelah stage_updated_at
export function shouldAdvanceStage(
  input: StageAdvanceInput,
  config: StageConfig = { order: STAGE_ORDER, lostKeys: DEFAULT_LOST }
): boolean {
  const { currentStage, proposedStage, stageUpdatedBy, stageUpdatedAt, lastCustomerMessageAt } = input;
  const { order, lostKeys } = config;

  if (!proposedStage) return false;

  const currentIdx = order.indexOf(currentStage || order[0] || 'new');
  const proposedIdx = order.indexOf(proposedStage);

  // Stage 'lost' (atau nilai tak dikenal) tidak pernah di-set otomatis oleh AI
  if (proposedIdx === -1) return false;

  // Stage 'lost' manual hanya boleh dinaikkan lagi lewat aturan manual-override di bawah
  if (currentIdx === -1 && lostKeys.includes(currentStage || '')) {
    if (stageUpdatedBy === 'manual' && stageUpdatedAt &&
        new Date(lastCustomerMessageAt) <= new Date(stageUpdatedAt)) {
      return false;
    }
    return true; // percakapan berlanjut setelah di-lost manual → boleh naik lagi
  }

  // Forward-only: tidak boleh turun atau tetap
  if (proposedIdx <= currentIdx) return false;

  // Proteksi manual: hanya timpa jika percakapan berlanjut setelah perubahan manual
  if (stageUpdatedBy === 'manual' && stageUpdatedAt &&
      new Date(lastCustomerMessageAt) <= new Date(stageUpdatedAt)) {
    return false;
  }

  return true;
}
