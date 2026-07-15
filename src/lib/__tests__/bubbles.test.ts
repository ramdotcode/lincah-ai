import { describe, it, expect } from 'vitest';
import { splitBubbles, joinBubbles, BUBBLE_DELIMITER, MAX_BUBBLES } from '../bubbles';

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
    expect(splitBubbles([b1, b2, b3].join(BUBBLE_DELIMITER))).toEqual([b1, b3]);
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
