import { describe, it, expect } from 'vitest';
import {
  buildToolSchemas,
  searchProducts,
  findShippingRate,
  parseOrderArgs,
  formatStockResult,
  formatShippingResult,
  BotTool,
} from '../toolDefs';

const tool = (tool_type: BotTool['tool_type'], enabled = true, config = {}): BotTool => ({
  id: `t-${tool_type}`,
  bot_id: 'b1',
  tool_type,
  enabled,
  config,
});

describe('buildToolSchemas', () => {
  it('builds schemas only for enabled tools', () => {
    const schemas = buildToolSchemas([
      tool('check_stock'),
      tool('check_shipping', false),
      tool('create_order'),
    ]);
    const names = schemas.map(s => s.function.name);
    expect(names).toEqual(['check_stock', 'create_order']);
  });

  it('returns empty array when no tools', () => {
    expect(buildToolSchemas([])).toEqual([]);
  });
});

describe('searchProducts', () => {
  const products = [
    { name: 'Kaos Polos Hitam', price: 75000, stock: 20 },
    { name: 'Kaos Polos Putih', price: 75000, stock: 0 },
    { name: 'Hoodie Navy', price: 180000, stock: 5 },
  ];

  it('matches by case-insensitive substring', () => {
    expect(searchProducts(products, 'kaos polos')).toHaveLength(2);
    expect(searchProducts(products, 'HOODIE')).toHaveLength(1);
  });

  it('returns empty for no match or blank query', () => {
    expect(searchProducts(products, 'jaket')).toHaveLength(0);
    expect(searchProducts(products, '  ')).toHaveLength(0);
  });

  it('formats found and not-found results', () => {
    expect(formatStockResult(searchProducts(products, 'hoodie'), 'hoodie')).toContain('Hoodie Navy');
    expect(formatStockResult([], 'jaket')).toContain('tidak ditemukan');
  });
});

describe('findShippingRate', () => {
  const rates = [
    { destination: 'Jakarta', cost: 15000, eta_days: '1-2' },
    { destination: 'Bandung', cost: 12000 },
    { destination: 'Surabaya Kota', cost: 20000, eta_days: 3 },
  ];

  it('matches exact destination case-insensitively', () => {
    expect(findShippingRate(rates, 'jakarta')?.cost).toBe(15000);
  });

  it('matches partial destination both directions', () => {
    // Query lebih pendek dari data
    expect(findShippingRate(rates, 'Surabaya')?.cost).toBe(20000);
    // Query lebih panjang dari data
    expect(findShippingRate(rates, 'Bandung Barat')?.cost).toBe(12000);
  });

  it('returns null for unknown destination or blank query', () => {
    expect(findShippingRate(rates, 'Makassar')).toBeNull();
    expect(findShippingRate(rates, '')).toBeNull();
  });

  it('formats found and not-found results', () => {
    expect(formatShippingResult(rates[0], 'Jakarta')).toContain('15000');
    expect(formatShippingResult(null, 'Makassar')).toContain('perlu dicek manual');
  });
});

describe('parseOrderArgs', () => {
  const valid = {
    customer_name: 'Budi',
    items: [{ name: 'Kaos Polos Hitam', qty: 2 }],
    address: 'Jl. Merdeka 1, Jakarta',
  };

  it('accepts a valid order and trims fields', () => {
    const { order, error } = parseOrderArgs({ ...valid, customer_name: '  Budi  ', notes: ' ' });
    expect(error).toBeUndefined();
    expect(order?.customer_name).toBe('Budi');
    expect(order?.items).toEqual([{ name: 'Kaos Polos Hitam', qty: 2 }]);
    expect(order?.notes).toBeNull();
  });

  it('keeps non-empty notes', () => {
    const { order } = parseOrderArgs({ ...valid, notes: 'kirim siang' });
    expect(order?.notes).toBe('kirim siang');
  });

  it('rejects missing customer_name', () => {
    const { order, error } = parseOrderArgs({ ...valid, customer_name: '' });
    expect(order).toBeNull();
    expect(error).toContain('customer_name');
  });

  it('rejects missing address', () => {
    const { order, error } = parseOrderArgs({ ...valid, address: undefined });
    expect(order).toBeNull();
    expect(error).toContain('address');
  });

  it('rejects empty or invalid items', () => {
    expect(parseOrderArgs({ ...valid, items: [] }).order).toBeNull();
    expect(parseOrderArgs({ ...valid, items: [{ name: 'Kaos', qty: 0 }] }).order).toBeNull();
    expect(parseOrderArgs({ ...valid, items: [{ name: '', qty: 1 }] }).order).toBeNull();
    expect(parseOrderArgs({ ...valid, items: [{ name: 'Kaos', qty: 'dua' }] }).order).toBeNull();
  });

  it('coerces numeric string qty', () => {
    const { order } = parseOrderArgs({ ...valid, items: [{ name: 'Kaos', qty: '3' }] });
    expect(order?.items[0].qty).toBe(3);
  });

  it('rejects null/garbage args', () => {
    expect(parseOrderArgs(null).order).toBeNull();
    expect(parseOrderArgs('x').order).toBeNull();
  });
});
