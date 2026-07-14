// Definisi & logika tool use (Fase D) — pure function tanpa I/O agar mudah dites.
// Eksekusi yang butuh DB/API eksternal ada di tools.ts.

export type ToolType = 'check_stock' | 'check_shipping' | 'create_order' | 'update_contact';

export interface BotTool {
  id: string;
  bot_id: string;
  tool_type: ToolType;
  enabled: boolean;
  config: Record<string, any>;
}

export interface ProductRow {
  name: string;
  price?: number | string;
  stock?: number | string;
}

export interface RateRow {
  destination: string;
  cost: number | string;
  eta_days?: number | string;
}

export interface OrderItem {
  name: string;
  qty: number;
}

// Skema function calling (format OpenAI/Groq) per jenis tool
const TOOL_SCHEMAS: Record<ToolType, any> = {
  check_stock: {
    type: 'function',
    function: {
      name: 'check_stock',
      description:
        'Cek ketersediaan stok dan harga produk. Gunakan saat pelanggan menanyakan stok, harga, atau ketersediaan barang.',
      parameters: {
        type: 'object',
        properties: {
          product_name: {
            type: 'string',
            description: 'Nama produk yang ditanyakan pelanggan (boleh sebagian nama)',
          },
        },
        required: ['product_name'],
      },
    },
  },
  check_shipping: {
    type: 'function',
    function: {
      name: 'check_shipping',
      description:
        'Cek ongkos kirim ke kota/daerah tujuan. Gunakan saat pelanggan menanyakan ongkir atau biaya pengiriman.',
      parameters: {
        type: 'object',
        properties: {
          destination: {
            type: 'string',
            description: 'Kota atau daerah tujuan pengiriman',
          },
        },
        required: ['destination'],
      },
    },
  },
  create_order: {
    type: 'function',
    function: {
      name: 'create_order',
      description:
        'Catat pesanan pelanggan. Gunakan HANYA setelah pelanggan jelas menyebutkan produk, jumlah, nama, dan alamat pengiriman. Konfirmasi dulu sebelum memanggil tool ini.',
      parameters: {
        type: 'object',
        properties: {
          customer_name: { type: 'string', description: 'Nama pelanggan' },
          items: {
            type: 'array',
            description: 'Daftar barang yang dipesan',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Nama produk' },
                qty: { type: 'number', description: 'Jumlah' },
              },
              required: ['name', 'qty'],
            },
          },
          address: { type: 'string', description: 'Alamat pengiriman lengkap' },
          notes: { type: 'string', description: 'Catatan tambahan (opsional)' },
        },
        required: ['customer_name', 'items', 'address'],
      },
    },
  },
  update_contact: {
    type: 'function',
    function: {
      name: 'update_contact',
      description:
        'Simpan atau perbarui data kontak pelanggan (nama, email, telepon, alamat, perusahaan, catatan kebutuhan). Panggil diam-diam setiap kali pelanggan menyebutkan informasi pribadi atau kebutuhannya — jangan minta izin dan jangan umumkan ke pelanggan.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nama pelanggan' },
          email: { type: 'string', description: 'Alamat email pelanggan' },
          phone: { type: 'string', description: 'Nomor telepon/WA pelanggan' },
          company: { type: 'string', description: 'Nama perusahaan/usaha pelanggan' },
          address: { type: 'string', description: 'Alamat pelanggan' },
          notes: { type: 'string', description: 'Kebutuhan, preferensi, atau catatan penting dari percakapan' },
        },
        required: [],
      },
    },
  },
};

// Susun daftar skema tools untuk dikirim ke model, dari baris bot_tools yang aktif
export function buildToolSchemas(tools: BotTool[]): any[] {
  return tools
    .filter(t => t.enabled && TOOL_SCHEMAS[t.tool_type])
    .map(t => TOOL_SCHEMAS[t.tool_type]);
}

// --- check_stock: cari produk di config (substring, case-insensitive) ---
export function searchProducts(products: ProductRow[], query: string): ProductRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return products.filter(p => p.name && p.name.toLowerCase().includes(q));
}

export function formatStockResult(matches: ProductRow[], query: string): string {
  if (matches.length === 0) {
    return `Produk "${query}" tidak ditemukan di daftar. Beri tahu pelanggan produk tidak tersedia atau minta nama yang lebih spesifik.`;
  }
  const lines = matches.slice(0, 5).map(p => {
    const price = p.price !== undefined && p.price !== '' ? `harga ${p.price}` : 'harga belum diatur';
    const stock = p.stock !== undefined && p.stock !== '' ? `stok ${p.stock}` : 'stok belum diatur';
    return `- ${p.name}: ${price}, ${stock}`;
  });
  return `Hasil pencarian "${query}":\n${lines.join('\n')}`;
}

// --- check_shipping: cari tarif statis di config (substring dua arah) ---
export function findShippingRate(rates: RateRow[], destination: string): RateRow | null {
  const d = destination.trim().toLowerCase();
  if (!d) return null;
  return (
    rates.find(r => {
      const dest = (r.destination || '').trim().toLowerCase();
      return dest && (dest === d || dest.includes(d) || d.includes(dest));
    }) || null
  );
}

export function formatShippingResult(rate: RateRow | null, destination: string): string {
  if (!rate) {
    return `Tarif pengiriman ke "${destination}" tidak ada di daftar. Beri tahu pelanggan bahwa ongkir ke sana perlu dicek manual oleh admin.`;
  }
  const eta = rate.eta_days ? `, estimasi ${rate.eta_days} hari` : '';
  return `Ongkir ke ${rate.destination}: ${rate.cost}${eta}.`;
}

// --- create_order: validasi argumen dari model sebelum ditulis ke DB ---
export interface ParsedOrder {
  customer_name: string;
  items: OrderItem[];
  address: string;
  notes: string | null;
}

export function parseOrderArgs(args: any): { order: ParsedOrder | null; error?: string } {
  if (!args || typeof args !== 'object') return { order: null, error: 'Argumen pesanan kosong.' };

  const name = typeof args.customer_name === 'string' ? args.customer_name.trim() : '';
  if (!name) return { order: null, error: 'customer_name wajib diisi.' };

  const address = typeof args.address === 'string' ? args.address.trim() : '';
  if (!address) return { order: null, error: 'address wajib diisi.' };

  if (!Array.isArray(args.items) || args.items.length === 0) {
    return { order: null, error: 'items wajib berisi minimal satu barang.' };
  }
  const items: OrderItem[] = [];
  for (const item of args.items) {
    const itemName = typeof item?.name === 'string' ? item.name.trim() : '';
    const qty = Number(item?.qty);
    if (!itemName || !Number.isFinite(qty) || qty <= 0) {
      return { order: null, error: 'Setiap item butuh name dan qty > 0.' };
    }
    items.push({ name: itemName, qty });
  }

  return {
    order: {
      customer_name: name,
      items,
      address,
      notes: typeof args.notes === 'string' && args.notes.trim() ? args.notes.trim() : null,
    },
  };
}

// --- update_contact: validasi argumen dari model sebelum ditulis ke DB ---
export interface ParsedContactFields {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  notes?: string;
}

const CONTACT_FIELD_MAX = 200;
const CONTACT_NOTES_MAX = 1000;

export function parseContactArgs(args: any): { fields: ParsedContactFields | null; error?: string } {
  if (!args || typeof args !== 'object') {
    return { fields: null, error: 'Argumen kontak kosong.' };
  }

  const fields: ParsedContactFields = {};
  const simpleKeys = ['name', 'email', 'phone', 'company', 'address'] as const;
  for (const key of simpleKeys) {
    const value = typeof args[key] === 'string' ? args[key].trim() : '';
    if (value) fields[key] = value.slice(0, CONTACT_FIELD_MAX);
  }
  const notes = typeof args.notes === 'string' ? args.notes.trim() : '';
  if (notes) fields.notes = notes.slice(0, CONTACT_NOTES_MAX);

  if (Object.keys(fields).length === 0) {
    return { fields: null, error: 'Minimal satu data kontak harus diisi.' };
  }
  return { fields };
}
