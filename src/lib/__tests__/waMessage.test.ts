import { describe, it, expect } from 'vitest';
import { extractMessageText, extractAdContext } from '../waMessage';

describe('extractMessageText (Patch 3: penerjemah media → teks)', () => {
  it('teks biasa: conversation dan extendedTextMessage', () => {
    expect(extractMessageText({ conversation: 'Halo, berapa harganya?' }))
      .toBe('Halo, berapa harganya?');
    expect(extractMessageText({ extendedTextMessage: { text: 'travel umroh kak' } }))
      .toBe('travel umroh kak');
  });

  it('foto tanpa caption jadi teks penanda', () => {
    expect(extractMessageText({ imageMessage: { mimetype: 'image/jpeg' } }))
      .toBe('[pelanggan mengirim foto]');
  });

  it('foto dengan caption memakai caption-nya', () => {
    expect(extractMessageText({ imageMessage: { caption: 'ini logo usahaku kak' } }))
      .toBe('ini logo usahaku kak');
  });

  it('video, dokumen, dan voice note punya penanda masing-masing', () => {
    expect(extractMessageText({ videoMessage: {} })).toBe('[pelanggan mengirim video]');
    expect(extractMessageText({ videoMessage: { caption: 'video tokonya' } })).toBe('video tokonya');
    expect(extractMessageText({ documentMessage: { fileName: 'brosur.pdf' } }))
      .toBe('[pelanggan mengirim dokumen]');
    expect(extractMessageText({ audioMessage: { seconds: 12 } }))
      .toBe('[pelanggan mengirim voice note]');
  });

  it('stiker/reaction/protokol diabaikan (null)', () => {
    expect(extractMessageText({ stickerMessage: {} })).toBeNull();
    expect(extractMessageText({ reactionMessage: { text: '👍' } })).toBeNull();
    expect(extractMessageText({ protocolMessage: {} })).toBeNull();
    expect(extractMessageText(null)).toBeNull();
    expect(extractMessageText(undefined)).toBeNull();
  });
});

describe('extractAdContext (Patch 5: creative iklan CTWA)', () => {
  const adReply = {
    title: 'Website Rp949rb - Ramcode',
    body: 'Preview gratis, bayar kalau cocok',
    sourceId: '1203986',
    sourceUrl: 'https://fb.me/xyz',
    ctwaClid: 'CLID123',
  };

  it('membaca externalAdReply dari extendedTextMessage', () => {
    const ctx = extractAdContext({
      extendedTextMessage: { text: 'halo', contextInfo: { externalAdReply: adReply } },
    });
    expect(ctx).toEqual({
      title: 'Website Rp949rb - Ramcode',
      body: 'Preview gratis, bayar kalau cocok',
      source_id: '1203986',
      source_url: 'https://fb.me/xyz',
      ctwa_clid: 'CLID123',
    });
  });

  it('membaca externalAdReply dari bagian pesan lain (mis. imageMessage)', () => {
    const ctx = extractAdContext({
      imageMessage: { caption: 'iklan', contextInfo: { externalAdReply: adReply } },
    });
    expect(ctx?.ctwa_clid).toBe('CLID123');
  });

  it('hanya menyertakan field yang tersedia', () => {
    const ctx = extractAdContext({
      extendedTextMessage: { text: 'halo', contextInfo: { externalAdReply: { title: 'Iklan A' } } },
    });
    expect(ctx).toEqual({ title: 'Iklan A' });
  });

  it('pesan biasa tanpa iklan menghasilkan null', () => {
    expect(extractAdContext({ conversation: 'halo' })).toBeNull();
    expect(extractAdContext({ extendedTextMessage: { text: 'halo', contextInfo: {} } })).toBeNull();
    expect(extractAdContext({ extendedTextMessage: { text: 'halo', contextInfo: { externalAdReply: {} } } })).toBeNull();
    expect(extractAdContext(null)).toBeNull();
  });
});
