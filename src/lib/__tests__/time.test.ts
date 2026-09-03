import { describe, it, expect } from 'vitest';
import { nowWibLabel, wibHour } from '@/lib/time';

describe('nowWibLabel', () => {
  it('menerjemahkan UTC ke jam WIB (UTC+7)', () => {
    const label = nowWibLabel(new Date('2026-09-03T07:05:00Z'));
    expect(label).toContain('14:05');
    expect(label).toContain('WIB');
  });

  it('menulis tanggal dalam bahasa Indonesia', () => {
    expect(nowWibLabel(new Date('2026-09-03T07:05:00Z'))).toBe(
      'Kamis, 3 September 2026, 14:05 WIB',
    );
  });
});

describe('wibHour', () => {
  it('mengembalikan 23 untuk 16:30 UTC (di luar jam kerja)', () => {
    expect(wibHour(new Date('2026-09-03T16:30:00Z'))).toBe(23);
  });

  it('mengembalikan 8 untuk 01:00 UTC (jam kerja)', () => {
    expect(wibHour(new Date('2026-09-03T01:00:00Z'))).toBe(8);
  });

  it('mengembalikan 0 untuk tengah malam WIB', () => {
    expect(wibHour(new Date('2026-09-03T17:00:00Z'))).toBe(0);
  });
});
