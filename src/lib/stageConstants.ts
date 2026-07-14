// Konstanta pipeline stage (CRM Fase 7) — pure, tanpa I/O, dipakai server & client.
// conversations.stage menyimpan KEY stage (slug stabil). Label bebas diedit tanpa
// merusak data. Default 5 stage identik dengan perilaku lama (Fase A4).

export type StageType = 'open' | 'won' | 'lost';

export interface PipelineStageDef {
  key: string;
  label: string;
  color: string;
  position: number;
  type: StageType;
}

export const DEFAULT_STAGES: PipelineStageDef[] = [
  { key: 'new', label: 'New', color: 'blue', position: 0, type: 'open' },
  { key: 'interested', label: 'Interested', color: 'sky', position: 1, type: 'open' },
  { key: 'negotiating', label: 'Negotiating', color: 'amber', position: 2, type: 'open' },
  { key: 'won', label: 'Won', color: 'emerald', position: 3, type: 'won' },
  { key: 'lost', label: 'Lost', color: 'red', position: 4, type: 'lost' },
];

export const STAGE_COLORS = ['red', 'orange', 'amber', 'emerald', 'sky', 'blue', 'violet', 'pink'] as const;

// Kelas Tailwind per warna (teks, titik, badge) — dipakai Kanban/tabel/badge.
export const STAGE_COLOR_CLASS: Record<string, { text: string; dot: string; badge: string }> = {
  red: { text: 'text-red-500', dot: 'bg-red-500', badge: 'bg-red-500/10 text-red-500' },
  orange: { text: 'text-orange-500', dot: 'bg-orange-500', badge: 'bg-orange-500/10 text-orange-500' },
  amber: { text: 'text-amber-500', dot: 'bg-amber-500', badge: 'bg-amber-500/10 text-amber-600' },
  emerald: { text: 'text-emerald-500', dot: 'bg-emerald-500', badge: 'bg-emerald-500/10 text-emerald-600' },
  sky: { text: 'text-sky-500', dot: 'bg-sky-500', badge: 'bg-sky-500/10 text-sky-500' },
  blue: { text: 'text-blue-500', dot: 'bg-blue-500', badge: 'bg-blue-500/10 text-blue-500' },
  violet: { text: 'text-violet-500', dot: 'bg-violet-500', badge: 'bg-violet-500/10 text-violet-500' },
  pink: { text: 'text-pink-500', dot: 'bg-pink-500', badge: 'bg-pink-500/10 text-pink-500' },
};

export function stageColorClass(color: string | null | undefined) {
  return STAGE_COLOR_CLASS[color || 'blue'] || STAGE_COLOR_CLASS.blue;
}

// Slugify label bebas jadi key stabil (huruf/angka/dash). Dipakai saat buat stage baru.
export function slugifyStageKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// Urutan maju untuk auto-advance AI = stage 'open' (urut posisi) lalu 'won'.
// 'lost' tidak pernah di-set otomatis. Mengembalikan { order, lostKeys }.
export function buildStageOrder(stages: PipelineStageDef[]): { order: string[]; lostKeys: string[] } {
  const sorted = [...stages].sort((a, b) => a.position - b.position);
  const open = sorted.filter(s => s.type === 'open').map(s => s.key);
  const won = sorted.filter(s => s.type === 'won').map(s => s.key);
  const lostKeys = sorted.filter(s => s.type === 'lost').map(s => s.key);
  return { order: [...open, ...won], lostKeys };
}
