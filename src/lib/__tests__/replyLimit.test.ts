import { describe, it, expect } from 'vitest';
import { countAiReplies, shouldForceHandoff, matchesHandoffPhrase } from '@/lib/replyLimit';

describe('countAiReplies', () => {
  it('menghitung balasan assistant biasa', () => {
    expect(countAiReplies([
      { role: 'user' },
      { role: 'assistant' },
      { role: 'user' },
      { role: 'assistant' },
    ])).toBe(2);
  });

  it('tidak menghitung follow-up otomatis, balasan manual owner, dan welcome message', () => {
    expect(countAiReplies([
      { role: 'assistant', welcome: true },
      { role: 'user' },
      { role: 'assistant' },
      { role: 'assistant', followup: true },
      { role: 'assistant', manual: true },
    ])).toBe(1);
  });

  it('aman untuk history kosong / null', () => {
    expect(countAiReplies([])).toBe(0);
    expect(countAiReplies(null)).toBe(0);
    expect(countAiReplies(undefined)).toBe(0);
  });
});

describe('shouldForceHandoff', () => {
  const twoReplies = [
    { role: 'user' }, { role: 'assistant' },
    { role: 'user' }, { role: 'assistant' },
  ];

  it('belum ada balasan, max 2 → belum dipaksa', () => {
    expect(shouldForceHandoff([{ role: 'user' }], 2)).toBe(false);
  });

  it('1 balasan, max 2 → belum dipaksa', () => {
    expect(shouldForceHandoff([{ role: 'user' }, { role: 'assistant' }], 2)).toBe(false);
  });

  it('2 balasan, max 2 → dipaksa (balasan ke-3 = pamit)', () => {
    expect(shouldForceHandoff(twoReplies, 2)).toBe(true);
  });

  it('2 balasan + 1 follow-up, max 2 → tetap dipaksa (follow-up tidak dihitung)', () => {
    expect(shouldForceHandoff([...twoReplies, { role: 'assistant', followup: true }], 2)).toBe(true);
  });

  it('max null/0/negatif → tidak pernah dipaksa', () => {
    expect(shouldForceHandoff(twoReplies, null)).toBe(false);
    expect(shouldForceHandoff(twoReplies, undefined)).toBe(false);
    expect(shouldForceHandoff(twoReplies, 0)).toBe(false);
    expect(shouldForceHandoff(twoReplies, -1)).toBe(false);
  });
});

describe('matchesHandoffPhrase', () => {
  it('mengenali frasa pamit dengan variasi ejaan & spasi', () => {
    expect(matchesHandoffPhrase('Oke kak, aku sambungin ke Rama ya 🙏')).toBe(true);
    expect(matchesHandoffPhrase('Aku SAMBUNGKAN   ke rama sekarang')).toBe(true);
  });

  it('balasan biasa tidak ikut tertangkap', () => {
    expect(matchesHandoffPhrase('Websitenya buat usaha apa kak?')).toBe(false);
    expect(matchesHandoffPhrase('Nanti Rama yang lanjut bantu ya')).toBe(false);
    expect(matchesHandoffPhrase('')).toBe(false);
    expect(matchesHandoffPhrase(null)).toBe(false);
  });
});
