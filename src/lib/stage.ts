// Aturan transisi stage CRM (Fase A4).
// Logika murni dipisah dari I/O supaya bisa di-unit-test.

export const STAGE_ORDER = ['new', 'interested', 'negotiating', 'won'];

export interface StageAdvanceInput {
  currentStage: string | null;
  proposedStage: string | null;
  stageUpdatedBy: string | null;      // 'ai' | 'manual' | null
  stageUpdatedAt: string | null;      // ISO timestamp
  lastCustomerMessageAt: string;      // ISO timestamp pesan pelanggan terbaru
}

// AI hanya boleh menaikkan stage:
// - forward-only (new → interested → negotiating → won); 'lost' tidak pernah otomatis
// - stage manual tidak ditimpa kecuali ada pesan pelanggan baru setelah stage_updated_at
export function shouldAdvanceStage(input: StageAdvanceInput): boolean {
  const { currentStage, proposedStage, stageUpdatedBy, stageUpdatedAt, lastCustomerMessageAt } = input;

  if (!proposedStage) return false;

  const currentIdx = STAGE_ORDER.indexOf(currentStage || 'new');
  const proposedIdx = STAGE_ORDER.indexOf(proposedStage);

  // 'lost' (atau nilai tak dikenal) tidak pernah di-set otomatis oleh AI
  if (proposedIdx === -1) return false;
  // stage 'lost' manual hanya boleh dinaikkan lagi lewat aturan manual-override di bawah
  if (currentIdx === -1 && currentStage === 'lost') {
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
