import { describe, it, expect } from 'vitest';
import { chunkText, shouldUseRag, totalKnowledgeChars, RAG_MIN_KNOWLEDGE_CHARS } from '../chunk';

describe('chunkText', () => {
  it('returns empty array for empty/blank text', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   ')).toEqual([]);
  });

  it('returns single chunk when text fits', () => {
    expect(chunkText('halo dunia', 100, 10)).toEqual(['halo dunia']);
  });

  it('splits long text into multiple chunks within max size', () => {
    const text = 'kalimat pendek. '.repeat(200); // ±3200 chars
    const chunks = chunkText(text, 800, 100);
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(800);
      expect(c.trim()).not.toBe('');
    }
  });

  it('prefers paragraph boundaries when available', () => {
    const para = 'a'.repeat(500);
    const text = `${para}\n\n${para}\n\n${para}`;
    const chunks = chunkText(text, 800, 100);
    // Potongan pertama harus berakhir di batas paragraf, bukan memotong tengah teks
    expect(chunks[0]).toBe(para);
  });

  it('keeps overlap so no content is lost between chunks', () => {
    const text = Array.from({ length: 100 }, (_, i) => `baris ke ${i} berisi informasi penting.`).join(' ');
    const chunks = chunkText(text, 400, 80);
    const joined = chunks.join(' ');
    // Semua baris tetap ada di gabungan chunk
    expect(joined).toContain('baris ke 0');
    expect(joined).toContain('baris ke 99');
  });

  it('always terminates on text without natural breakers', () => {
    const text = 'x'.repeat(5000);
    const chunks = chunkText(text, 800, 100);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBeLessThan(50);
  });
});

describe('shouldUseRag', () => {
  it('is false when knowledge is small', () => {
    expect(shouldUseRag([{ content: 'kecil' }])).toBe(false);
    expect(shouldUseRag([])).toBe(false);
  });

  it('is true when total knowledge exceeds threshold', () => {
    const big = { content: 'x'.repeat(RAG_MIN_KNOWLEDGE_CHARS + 1) };
    expect(shouldUseRag([big])).toBe(true);
  });

  it('sums across sources and ignores null content', () => {
    const half = { content: 'x'.repeat(Math.ceil(RAG_MIN_KNOWLEDGE_CHARS / 2) + 1) };
    expect(totalKnowledgeChars([half, { content: null }, half])).toBeGreaterThan(RAG_MIN_KNOWLEDGE_CHARS);
    expect(shouldUseRag([half, { content: null }, half])).toBe(true);
  });
});
