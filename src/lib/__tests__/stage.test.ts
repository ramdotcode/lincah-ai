import { describe, it, expect } from 'vitest';
import { shouldAdvanceStage } from '../stage';

const NOW = '2026-07-10T12:00:00Z';
const EARLIER = '2026-07-10T10:00:00Z';
const LATER = '2026-07-10T14:00:00Z';

const base = {
  currentStage: 'new',
  proposedStage: 'interested',
  stageUpdatedBy: null,
  stageUpdatedAt: null,
  lastCustomerMessageAt: NOW,
};

describe('shouldAdvanceStage', () => {
  it('menaikkan stage maju (new → interested)', () => {
    expect(shouldAdvanceStage(base)).toBe(true);
  });

  it('menaikkan stage lompat (new → won)', () => {
    expect(shouldAdvanceStage({ ...base, proposedStage: 'won' })).toBe(true);
  });

  it('menolak stage yang sama', () => {
    expect(shouldAdvanceStage({ ...base, currentStage: 'interested' })).toBe(false);
  });

  it('menolak penurunan stage (negotiating → interested)', () => {
    expect(shouldAdvanceStage({ ...base, currentStage: 'negotiating', proposedStage: 'interested' })).toBe(false);
  });

  it('menolak stage lost dari AI', () => {
    expect(shouldAdvanceStage({ ...base, proposedStage: 'lost' })).toBe(false);
  });

  it('menolak hasil klasifikasi null', () => {
    expect(shouldAdvanceStage({ ...base, proposedStage: null })).toBe(false);
  });

  it('menolak nilai stage tidak dikenal', () => {
    expect(shouldAdvanceStage({ ...base, proposedStage: 'maybe' })).toBe(false);
  });

  it('memperlakukan currentStage null sebagai new', () => {
    expect(shouldAdvanceStage({ ...base, currentStage: null })).toBe(true);
  });

  it('tidak menimpa stage manual tanpa pesan pelanggan baru', () => {
    expect(shouldAdvanceStage({
      ...base,
      currentStage: 'interested',
      proposedStage: 'negotiating',
      stageUpdatedBy: 'manual',
      stageUpdatedAt: LATER,           // admin geser setelah pesan terakhir
      lastCustomerMessageAt: NOW,
    })).toBe(false);
  });

  it('menimpa stage manual jika ada pesan pelanggan baru setelahnya', () => {
    expect(shouldAdvanceStage({
      ...base,
      currentStage: 'interested',
      proposedStage: 'negotiating',
      stageUpdatedBy: 'manual',
      stageUpdatedAt: EARLIER,         // pesan pelanggan datang setelah geser manual
      lastCustomerMessageAt: NOW,
    })).toBe(true);
  });

  it('menimpa stage AI kapan saja (forward)', () => {
    expect(shouldAdvanceStage({
      ...base,
      currentStage: 'interested',
      proposedStage: 'won',
      stageUpdatedBy: 'ai',
      stageUpdatedAt: LATER,
    })).toBe(true);
  });

  it('lead lost manual tidak dinaikkan tanpa pesan baru', () => {
    expect(shouldAdvanceStage({
      ...base,
      currentStage: 'lost',
      proposedStage: 'interested',
      stageUpdatedBy: 'manual',
      stageUpdatedAt: LATER,
      lastCustomerMessageAt: NOW,
    })).toBe(false);
  });

  it('lead lost bisa naik lagi kalau percakapan berlanjut', () => {
    expect(shouldAdvanceStage({
      ...base,
      currentStage: 'lost',
      proposedStage: 'interested',
      stageUpdatedBy: 'manual',
      stageUpdatedAt: EARLIER,
      lastCustomerMessageAt: NOW,
    })).toBe(true);
  });
});
