// Helper waktu Asia/Jakarta (WIB). Dipakai untuk menyuntik "jam sekarang" ke
// system prompt bot supaya balasannya sadar konteks waktu (mis. janji "Rama
// bales sebentar lagi" vs "besok pagi"). Pakai Intl bawaan Node — tanpa
// dependency tambahan.

const WIB_LABEL_FORMAT = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const WIB_HOUR_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Jakarta',
  hour: 'numeric',
  hour12: false,
});

/**
 * Label tanggal + jam WIB, contoh: "Kamis, 3 September 2026, 14:05 WIB".
 *
 * Dirakit dari formatToParts, bukan format(), karena locale id-ID merangkai
 * jam sebagai "pukul 14.05" — bentuk itu gampang disalahbaca model.
 */
export function nowWibLabel(d: Date = new Date()): string {
  const parts = WIB_LABEL_FORMAT.formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${get('weekday')}, ${get('day')} ${get('month')} ${get('year')}, ${get('hour')}:${get('minute')} WIB`;
}

/** Jam WIB dalam angka 0-23. */
export function wibHour(d: Date = new Date()): number {
  return parseInt(WIB_HOUR_FORMAT.format(d), 10) % 24;
}
