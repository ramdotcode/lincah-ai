// Pemecahan balasan AI menjadi beberapa "bubble" chat (multi-message).
// Model diinstruksikan memisahkan pesan dengan penanda ||| (lihat BUBBLE_INSTRUCTION
// yang di-append ke system prompt di ai.ts). Helper ini pure & unit-tested —
// jangan import dari '@/lib/*' (vitest tidak resolve alias '@/').

export const BUBBLE_DELIMITER = '|||';

// Maksimal bubble per balasan — sisa gabung ke bubble terakhir agar tidak spam.
export const MAX_BUBBLES = 4;

// Ditambahkan ke system prompt utama (processMessage) supaya model tahu konvensinya.
// Instruksi behavior bot (ditulis admin di atas) SELALU menang: kalau behavior
// melarang memecah pesan, model tidak memakai delimiter dan hasilnya 1 bubble.
export const BUBBLE_INSTRUCTION = `
### GAYA PENGIRIMAN PESAN
Jika jawabanmu panjang (lebih dari ±2 kalimat), pecah menjadi 2-4 pesan pendek seperti gaya chat manusia, dipisahkan penanda ${BUBBLE_DELIMITER} (tiga garis tegak) di antara tiap pesan.
Jangan pakai ${BUBBLE_DELIMITER} untuk jawaban pendek, dan jangan memecah daftar harga/langkah yang lebih jelas dibaca utuh dalam satu pesan.
Jika instruksi perilaku di atas mengatur gaya pengiriman pesan secara berbeda (misal melarang memecah pesan atau menyuruh selalu memecah), IKUTI instruksi perilaku tersebut.`;

// Pecah teks balasan pada delimiter → array bubble bersih.
// Selalu mengembalikan minimal 1 bubble (teks asli ter-trim) — never empty.
export function splitBubbles(text: string, maxBubbles: number = MAX_BUBBLES): string[] {
  const parts = text
    .split(BUBBLE_DELIMITER)
    .map(p => p.trim())
    .filter(Boolean);

  if (parts.length === 0) return [text.trim()];
  if (parts.length <= maxBubbles) return parts;

  // Kelebihan bubble digabung ke bubble terakhir
  return [...parts.slice(0, maxBubbles - 1), parts.slice(maxBubbles - 1).join('\n\n')];
}

// Gabungan bersih untuk disimpan di history / dikirim ke bridge lama (tanpa |||).
export function joinBubbles(bubbles: string[]): string {
  return bubbles.join('\n\n');
}
