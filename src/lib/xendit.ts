if (typeof window !== 'undefined') {
  throw new Error('This module can only be used on the server to protect API keys.');
}

// Klien Xendit QR Codes API (QRIS dinamis). Mode test = secret key
// xnd_development_...; pembayaran disimulasikan dari dashboard/API simulate.
// Dipakai tool create_payment (tools.ts) dan /api/webhook/xendit.

const XENDIT_BASE_URL = 'https://api.xendit.co';
const XENDIT_API_VERSION = '2022-07-31';

export interface XenditQrCode {
  id: string;          // qr_...
  reference_id: string;
  qr_string: string;   // payload EMV — dirender jadi gambar QR di sisi kita
  amount: number;
  status: string;      // ACTIVE saat baru dibuat
  expires_at?: string;
}

export async function createQrisQr(opts: {
  secretKey: string;
  referenceId: string;
  amount: number;
  expiresAt: string;
}): Promise<XenditQrCode> {
  const res = await fetch(`${XENDIT_BASE_URL}/qr_codes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(`${opts.secretKey}:`).toString('base64')}`,
      'api-version': XENDIT_API_VERSION,
    },
    body: JSON.stringify({
      reference_id: opts.referenceId,
      type: 'DYNAMIC',
      currency: 'IDR',
      amount: opts.amount,
      expires_at: opts.expiresAt,
    }),
  });

  if (!res.ok) {
    const error = (await res.text()).slice(0, 300);
    throw new Error(`Xendit API error: ${res.status} - ${error}`);
  }

  return res.json();
}

// Base URL publik app — untuk menyusun link gambar QR yang dikirim ke pelanggan
export function appBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

export function formatRupiah(amount: number): string {
  return `Rp${Math.round(amount).toLocaleString('id-ID')}`;
}
