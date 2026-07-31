import { NextRequest } from 'next/server';
import QRCode from 'qrcode';
import { supabaseAdmin } from '@/lib/supabase';

// Render payload EMV QRIS (payments.qr_string) menjadi gambar PNG.
// Publik tanpa auth: id = uuid acak yang hanya diketahui penerima QR,
// dan isinya memang untuk dibagikan ke pelanggan.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return new Response('Not found', { status: 404 });
  }

  const { data: payment } = await supabaseAdmin
    .from('payments')
    .select('qr_string, status')
    .eq('id', id)
    .maybeSingle();

  if (!payment?.qr_string) {
    return new Response('Not found', { status: 404 });
  }

  const png = await QRCode.toBuffer(payment.qr_string, {
    type: 'png',
    width: 512,
    margin: 2,
    errorCorrectionLevel: 'M',
  });

  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
