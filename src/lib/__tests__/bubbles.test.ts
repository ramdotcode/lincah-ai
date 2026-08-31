import { describe, it, expect } from 'vitest';
import { splitBubbles, joinBubbles, scrubBotText, BUBBLE_DELIMITER, MAX_BUBBLES } from '../bubbles';

// Ronde 1 test bot: model melanggar larangan em dash di prompt (S2) dan
// menulis U+2011 (S3/S5) — pembersihan tipografi wajib deterministik di kode.
describe('scrubBotText', () => {
  it('em dash dengan spasi jadi koma', () => {
    expect(scrubBotText('Landing Page paling pas — satu halaman fokus jualan'))
      .toBe('Landing Page paling pas, satu halaman fokus jualan');
  });

  it('em dash tanpa spasi jadi koma', () => {
    expect(scrubBotText('cepat—murah—jadi')).toBe('cepat, murah, jadi');
  });

  it('en dash jadi strip biasa', () => {
    expect(scrubBotText('revisi 3–5 kali')).toBe('revisi 3-5 kali');
  });

  it('non-breaking hyphen U+2011 jadi strip biasa', () => {
    expect(scrubBotText('boleh kirim foto‑foto yang ada')).toBe('boleh kirim foto-foto yang ada');
  });

  it('kombinasi semua karakter sekaligus tetap natural', () => {
    expect(scrubBotText('Paketnya lengkap — domain, hosting 1–2 tahun, dan di‑upgrade kapan pun'))
      .toBe('Paketnya lengkap, domain, hosting 1-2 tahun, dan di-upgrade kapan pun');
  });

  it('tidak menghasilkan koma dobel bila em dash bertemu koma', () => {
    expect(scrubBotText('murah — , cepat')).toBe('murah, cepat');
  });

  it('em dash di awal baris tidak meninggalkan koma yatim', () => {
    expect(scrubBotText('— poin pertama\n— poin kedua')).toBe('poin pertama\npoin kedua');
  });

  it('teks bersih tidak berubah', () => {
    const s = 'Halo kak, makasih udah chat 🙌 Websitenya buat usaha apa kak?';
    expect(scrubBotText(s)).toBe(s);
  });
});

describe('splitBubbles memakai scrubber (titik terpusat semua channel)', () => {
  it('bubble hasil split sudah bebas em dash/en dash/U+2011', () => {
    const out = splitBubbles(`Paket pas — Landing Page${BUBBLE_DELIMITER}Foto‑foto bisa 1–2 hari`);
    expect(out).toEqual(['Paket pas, Landing Page', 'Foto-foto bisa 1-2 hari']);
    for (const b of out) {
      expect(b).not.toMatch(/[—–‑]/);
    }
  });
});

describe('splitBubbles', () => {
  it('mengembalikan satu bubble untuk teks tanpa delimiter', () => {
    expect(splitBubbles('Halo, ada yang bisa dibantu?')).toEqual(['Halo, ada yang bisa dibantu?']);
  });

  it('memecah teks pada delimiter dan men-trim tiap bubble', () => {
    expect(splitBubbles(`Halo kak! ${BUBBLE_DELIMITER} Paket Bisnis Rp 4.900.000 ya. ${BUBBLE_DELIMITER}\nMau saya jelaskan isinya?`)).toEqual([
      'Halo kak!',
      'Paket Bisnis Rp 4.900.000 ya.',
      'Mau saya jelaskan isinya?',
    ]);
  });

  it('membuang bagian kosong (delimiter di awal/akhir/dobel)', () => {
    expect(splitBubbles(`${BUBBLE_DELIMITER}Satu${BUBBLE_DELIMITER}${BUBBLE_DELIMITER}Dua${BUBBLE_DELIMITER}`)).toEqual(['Satu', 'Dua']);
  });

  it('menggabungkan kelebihan bubble ke bubble terakhir (maks default)', () => {
    const text = ['A', 'B', 'C', 'D', 'E', 'F'].join(BUBBLE_DELIMITER);
    const result = splitBubbles(text);
    expect(result).toHaveLength(MAX_BUBBLES);
    expect(result[MAX_BUBBLES - 1]).toBe('D\n\nE\n\nF');
  });

  it('menghormati maxBubbles custom', () => {
    expect(splitBubbles(`A${BUBBLE_DELIMITER}B${BUBBLE_DELIMITER}C`, 2)).toEqual(['A', 'B\n\nC']);
  });

  it('teks yang hanya berisi delimiter → fallback teks ter-trim', () => {
    expect(splitBubbles(`  ${BUBBLE_DELIMITER}  `)).toEqual(['|||']);
  });

  it('membuang bubble yang nyaris duplikat (parafrase kecil)', () => {
    const b1 = 'Selamat datang di WebCraft Studio! Kami adalah agensi pembuatan website yang berdiri sejak 2021 di Jakarta Selatan. Apa yang Anda butuhkan hari ini?';
    const b2 = 'Selamat datang di WebCraft Studio! Kami adalah agensi pembuatan website yang berdiri sejak 2021 di Jakarta Selatan. Apa yang Anda cari hari ini?';
    const b3 = 'Kami punya Paket Starter, Paket Bisnis, dan Paket Toko Online — mau saya jelaskan?';
    // b3 ikut tersaring scrubber tipografi: em dash → koma
    const b3Clean = 'Kami punya Paket Starter, Paket Bisnis, dan Paket Toko Online, mau saya jelaskan?';
    expect(splitBubbles([b1, b2, b3].join(BUBBLE_DELIMITER))).toEqual([b1, b3Clean]);
  });

  it('membuang bubble duplikat persis', () => {
    expect(splitBubbles(`Halo kak!${BUBBLE_DELIMITER}Halo kak!${BUBBLE_DELIMITER}Ada yang bisa dibantu?`)).toEqual([
      'Halo kak!',
      'Ada yang bisa dibantu?',
    ]);
  });

  it('tidak membuang bubble yang topiknya beda', () => {
    const bubbles = [
      'Paket Starter Rp 1.500.000 untuk landing page.',
      'Paket Bisnis Rp 4.500.000 untuk company profile 5 halaman.',
      'Mau saya bantu pilihkan sesuai kebutuhan?',
    ];
    expect(splitBubbles(bubbles.join(BUBBLE_DELIMITER))).toEqual(bubbles);
  });

  it('mempertahankan newline di dalam satu bubble', () => {
    expect(splitBubbles(`Daftar harga:\n- A 1000\n- B 2000${BUBBLE_DELIMITER}Mau pilih yang mana?`)).toEqual([
      'Daftar harga:\n- A 1000\n- B 2000',
      'Mau pilih yang mana?',
    ]);
  });
});

describe('joinBubbles', () => {
  it('menggabungkan bubble dengan baris kosong (tanpa delimiter)', () => {
    expect(joinBubbles(['Satu', 'Dua'])).toBe('Satu\n\nDua');
  });

  it('round-trip: split lalu join menghasilkan teks bersih', () => {
    const joined = joinBubbles(splitBubbles(`Halo${BUBBLE_DELIMITER}Kabar baik?`));
    expect(joined).toBe('Halo\n\nKabar baik?');
    expect(joined).not.toContain(BUBBLE_DELIMITER);
  });
});
