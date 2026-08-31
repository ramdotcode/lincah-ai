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
Sesuaikan panjang jawaban dengan pesan pelanggan: sapaan atau pertanyaan singkat cukup dijawab SATU pesan singkat (1-2 kalimat), tanpa penanda apa pun.
HANYA jika jawabanmu memang perlu panjang (lebih dari ±2 kalimat), pecah menjadi 2-4 pesan pendek seperti gaya chat manusia, dipisahkan penanda ${BUBBLE_DELIMITER} (tiga garis tegak) di antara tiap pesan.
Tiap pesan harus MELANJUTKAN isi — JANGAN PERNAH mengulang, menulis ulang, atau memparafrase informasi yang sudah ada di pesan lain.
Jangan pakai ${BUBBLE_DELIMITER} untuk jawaban pendek, dan jangan memecah daftar harga/langkah yang lebih jelas dibaca utuh dalam satu pesan.
Jika instruksi perilaku di atas mengatur gaya pengiriman pesan secara berbeda (misal melarang memecah pesan atau menyuruh selalu memecah), IKUTI instruksi perilaku tersebut.`;

// Karakter tipografi yang dilarang di output bot (gaya ketikan WA, lihat
// system prompt). Ronde 1 test membuktikan larangan di prompt bisa dilanggar
// model (em dash di S2, U+2011 di S3/S5) — jadi dibersihkan deterministik di
// kode. HANYA untuk output bot; pesan pelanggan yang disimpan jangan disentuh.
export function scrubBotText(text: string): string {
  return text
    // em dash (—, dengan/tanpa spasi) → koma; [^\S\n] = spasi horizontal saja,
    // supaya pemisah baris/bubble tidak ikut tertelan
    .replace(/[^\S\n]*—[^\S\n]*/g, ', ')
    .replace(/–/g, '-')             // en dash (–) → strip biasa
    .replace(/‑/g, '-')             // non-breaking hyphen (‑) → strip biasa
    .replace(/,(\s*,)+/g, ',')           // koma dobel sisa substitusi
    .replace(/(^|\n)\s*,\s*/g, '$1')     // koma yatim di awal baris
    .replace(/ {2,}/g, ' ');             // spasi dobel
}

// Ambang kemiripan (Jaccard kata) untuk menganggap dua bubble duplikat.
const DUPLICATE_SIMILARITY = 0.8;

function wordSet(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean)
  );
}

// Kemiripan Jaccard 0..1 antar himpunan kata dua teks.
function similarity(a: string, b: string): number {
  const wa = wordSet(a);
  const wb = wordSet(b);
  if (!wa.size || !wb.size) return 0;
  let intersect = 0;
  for (const w of wa) if (wb.has(w)) intersect++;
  return intersect / (wa.size + wb.size - intersect);
}

// Pecah teks balasan pada delimiter → array bubble bersih.
// Bubble yang isinya nyaris sama dengan bubble sebelumnya dibuang (model kadang
// mengulang paragraf yang sama dengan parafrase kecil). Selalu mengembalikan
// minimal 1 bubble (teks asli ter-trim) — never empty.
export function splitBubbles(text: string, maxBubbles: number = MAX_BUBBLES): string[] {
  // Titik terpusat pembersihan output bot: semua balasan (semua channel)
  // lewat sini sebelum dikirim/disimpan.
  const clean = scrubBotText(text);
  const parts = clean
    .split(BUBBLE_DELIMITER)
    .map(p => p.trim())
    .filter(Boolean);

  if (parts.length === 0) return [clean.trim()];

  // Buang bubble yang duplikat/nyaris duplikat dengan bubble yang sudah lolos
  const deduped: string[] = [];
  for (const part of parts) {
    if (!deduped.some(kept => similarity(kept, part) >= DUPLICATE_SIMILARITY)) {
      deduped.push(part);
    }
  }

  if (deduped.length <= maxBubbles) return deduped;

  // Kelebihan bubble digabung ke bubble terakhir
  return [...deduped.slice(0, maxBubbles - 1), deduped.slice(maxBubbles - 1).join('\n\n')];
}

// Gabungan bersih untuk disimpan di history / dikirim ke bridge lama (tanpa |||).
export function joinBubbles(bubbles: string[]): string {
  return bubbles.join('\n\n');
}
