'use client';

import { useState, useEffect, useCallback } from 'react';
import { Wrench, Package, Truck, ClipboardList, Loader2, Plus, Trash2, Zap } from 'lucide-react';

interface ToolRow {
  id?: string;
  tool_type: 'check_stock' | 'check_shipping' | 'create_order';
  enabled: boolean;
  config: Record<string, any>;
}

const DEFAULT_TOOLS: ToolRow[] = [
  { tool_type: 'check_stock', enabled: false, config: { products: [] } },
  { tool_type: 'check_shipping', enabled: false, config: { rates: [] } },
  { tool_type: 'create_order', enabled: false, config: {} },
];

const TOOL_META = {
  check_stock: {
    icon: Package,
    title: 'Cek Stok & Harga',
    desc: 'AI menjawab pertanyaan stok/harga dari daftar produk di bawah.',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
  },
  check_shipping: {
    icon: Truck,
    title: 'Cek Ongkir',
    desc: 'AI menjawab ongkos kirim dari tabel tarif per kota tujuan.',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
  },
  create_order: {
    icon: ClipboardList,
    title: 'Catat Pesanan',
    desc: 'AI mencatat pesanan (nama, barang, alamat) ke halaman Orders setelah pelanggan konfirmasi.',
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
  },
};

export default function BotTools({
  botId,
  toolsEnabled,
  onToggleTools,
}: {
  botId: string;
  toolsEnabled: boolean;
  onToggleTools: (enabled: boolean) => void;
}) {
  const [tools, setTools] = useState<ToolRow[]>(DEFAULT_TOOLS);
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState<string | null>(null);

  const fetchTools = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tools?botId=${botId}`);
      if (res.ok) {
        const rows: ToolRow[] = await res.json();
        // Gabungkan dengan default agar ketiga tool selalu tampil
        setTools(DEFAULT_TOOLS.map(d => rows.find(r => r.tool_type === d.tool_type) || d));
      }
    } finally {
      setLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    if (botId) fetchTools();
  }, [botId, fetchTools]);

  const saveTool = async (tool: ToolRow) => {
    setSavingType(tool.tool_type);
    try {
      const res = await fetch('/api/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...tool, bot_id: botId }),
      });
      if (res.ok) {
        const saved = await res.json();
        setTools(prev => prev.map(t => (t.tool_type === saved.tool_type ? saved : t)));
      }
    } finally {
      setSavingType(null);
    }
  };

  const updateLocal = (toolType: string, patch: Partial<ToolRow>) => {
    setTools(prev => prev.map(t => (t.tool_type === toolType ? { ...t, ...patch } : t)));
  };

  const updateConfigRows = (toolType: string, key: 'products' | 'rates', rows: any[]) => {
    setTools(prev =>
      prev.map(t =>
        t.tool_type === toolType ? { ...t, config: { ...t.config, [key]: rows } } : t
      )
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-12">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center">
          <Wrench className="w-6 h-6 text-orange-600" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-main">AI Tools</h3>
          <p className="text-[11px] text-muted-app">
            Beri AI kemampuan bertindak: cek stok, cek ongkir, dan catat pesanan. Tools berjalan di model Groq Llama 3.3 70B.
          </p>
        </div>
      </div>

      {/* Master toggle — disimpan lewat tombol Save Changes */}
      <div className="bg-card-app border border-app p-6 rounded-[2rem] flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-orange-500" />
          <div>
            <span className="text-xs font-bold text-main block">Aktifkan AI Tools</span>
            <span className="text-[10px] text-muted-app">Simpan dengan tombol Save Changes. Konfigurasi tiap tool tersimpan otomatis.</span>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox"
            className="sr-only peer"
            checked={toolsEnabled}
            onChange={(e) => onToggleTools(e.target.checked)}
          />
          <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div>
        </label>
      </div>

      {tools.map((tool) => {
        const meta = TOOL_META[tool.tool_type];
        const Icon = meta.icon;
        return (
          <div key={tool.tool_type} className="bg-card-app border border-app rounded-[2rem] p-6 space-y-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 ${meta.bg} rounded-xl flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${meta.color}`} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-main">{meta.title}</h4>
                  <p className="text-[10px] text-muted-app">{meta.desc}</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox"
                  className="sr-only peer"
                  checked={tool.enabled}
                  onChange={(e) => updateLocal(tool.tool_type, { enabled: e.target.checked })}
                />
                <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            {/* Config: product list */}
            {tool.tool_type === 'check_stock' && tool.enabled && (
              <div className="space-y-2 pt-3 border-t border-app">
                <div className="grid grid-cols-[1fr_100px_80px_32px] gap-2 text-[9px] uppercase font-bold text-muted-app tracking-widest px-1">
                  <span>Produk</span><span>Harga</span><span>Stok</span><span />
                </div>
                {(tool.config.products || []).map((p: any, i: number) => (
                  <div key={i} className="grid grid-cols-[1fr_100px_80px_32px] gap-2">
                    <input value={p.name || ''} placeholder="Nama produk"
                      onChange={(e) => {
                        const rows = [...(tool.config.products || [])];
                        rows[i] = { ...rows[i], name: e.target.value };
                        updateConfigRows('check_stock', 'products', rows);
                      }}
                      className="bg-white dark:bg-zinc-900 border border-app rounded-lg px-3 py-2 text-xs text-main outline-none focus:border-blue-400" />
                    <input value={p.price ?? ''} placeholder="150000"
                      onChange={(e) => {
                        const rows = [...(tool.config.products || [])];
                        rows[i] = { ...rows[i], price: e.target.value };
                        updateConfigRows('check_stock', 'products', rows);
                      }}
                      className="bg-white dark:bg-zinc-900 border border-app rounded-lg px-3 py-2 text-xs text-main outline-none focus:border-blue-400" />
                    <input value={p.stock ?? ''} placeholder="10"
                      onChange={(e) => {
                        const rows = [...(tool.config.products || [])];
                        rows[i] = { ...rows[i], stock: e.target.value };
                        updateConfigRows('check_stock', 'products', rows);
                      }}
                      className="bg-white dark:bg-zinc-900 border border-app rounded-lg px-3 py-2 text-xs text-main outline-none focus:border-blue-400" />
                    <button onClick={() => {
                        const rows = (tool.config.products || []).filter((_: any, j: number) => j !== i);
                        updateConfigRows('check_stock', 'products', rows);
                      }}
                      className="flex items-center justify-center text-red-400 hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button onClick={() => updateConfigRows('check_stock', 'products', [...(tool.config.products || []), { name: '', price: '', stock: '' }])}
                  className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 px-1 py-1">
                  <Plus className="w-3 h-3" /> Tambah produk
                </button>
              </div>
            )}

            {/* Config: shipping rates */}
            {tool.tool_type === 'check_shipping' && tool.enabled && (
              <div className="space-y-2 pt-3 border-t border-app">
                <div className="grid grid-cols-[1fr_110px_80px_32px] gap-2 text-[9px] uppercase font-bold text-muted-app tracking-widest px-1">
                  <span>Kota tujuan</span><span>Ongkir</span><span>ETA (hari)</span><span />
                </div>
                {(tool.config.rates || []).map((r: any, i: number) => (
                  <div key={i} className="grid grid-cols-[1fr_110px_80px_32px] gap-2">
                    <input value={r.destination || ''} placeholder="Jakarta"
                      onChange={(e) => {
                        const rows = [...(tool.config.rates || [])];
                        rows[i] = { ...rows[i], destination: e.target.value };
                        updateConfigRows('check_shipping', 'rates', rows);
                      }}
                      className="bg-white dark:bg-zinc-900 border border-app rounded-lg px-3 py-2 text-xs text-main outline-none focus:border-emerald-400" />
                    <input value={r.cost ?? ''} placeholder="20000"
                      onChange={(e) => {
                        const rows = [...(tool.config.rates || [])];
                        rows[i] = { ...rows[i], cost: e.target.value };
                        updateConfigRows('check_shipping', 'rates', rows);
                      }}
                      className="bg-white dark:bg-zinc-900 border border-app rounded-lg px-3 py-2 text-xs text-main outline-none focus:border-emerald-400" />
                    <input value={r.eta_days ?? ''} placeholder="2-3"
                      onChange={(e) => {
                        const rows = [...(tool.config.rates || [])];
                        rows[i] = { ...rows[i], eta_days: e.target.value };
                        updateConfigRows('check_shipping', 'rates', rows);
                      }}
                      className="bg-white dark:bg-zinc-900 border border-app rounded-lg px-3 py-2 text-xs text-main outline-none focus:border-emerald-400" />
                    <button onClick={() => {
                        const rows = (tool.config.rates || []).filter((_: any, j: number) => j !== i);
                        updateConfigRows('check_shipping', 'rates', rows);
                      }}
                      className="flex items-center justify-center text-red-400 hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button onClick={() => updateConfigRows('check_shipping', 'rates', [...(tool.config.rates || []), { destination: '', cost: '', eta_days: '' }])}
                  className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 px-1 py-1">
                  <Plus className="w-3 h-3" /> Tambah tarif
                </button>
              </div>
            )}

            {tool.tool_type === 'create_order' && tool.enabled && (
              <p className="text-[10px] text-muted-app pt-3 border-t border-app">
                Pesanan yang dicatat AI muncul di halaman <span className="font-bold">Orders</span>. AI diminta konfirmasi dulu ke pelanggan sebelum mencatat.
              </p>
            )}

            <div className="flex justify-end">
              <button onClick={() => saveTool(tool)}
                disabled={savingType === tool.tool_type}
                className="px-4 py-2 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-xl text-[11px] font-bold hover:opacity-80 transition-all disabled:opacity-40 flex items-center gap-2">
                {savingType === tool.tool_type && <Loader2 className="w-3 h-3 animate-spin" />}
                Simpan Tool
              </button>
            </div>
          </div>
        );
      })}

      <div className="h-20" />
    </div>
  );
}
