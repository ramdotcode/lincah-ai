'use client';

import { useState, useEffect } from 'react';
import LayoutShell from '@/components/LayoutShell';
import { ClipboardList, Loader2, RefreshCw } from 'lucide-react';

interface Order {
  id: string;
  bot_id: string;
  bot_name: string;
  customer_name: string | null;
  customer_contact: string | null;
  items: { name: string; qty: number }[];
  address: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

const STATUSES = ['new', 'confirmed', 'paid', 'shipped', 'done', 'cancelled'];

const STATUS_STYLE: Record<string, string> = {
  new: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600',
  confirmed: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600',
  paid: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600',
  shipped: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600',
  done: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500',
  cancelled: 'bg-red-100 dark:bg-red-900/40 text-red-500',
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/orders');
      if (res.ok) setOrders(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const updateStatus = async (id: string, status: string) => {
    const res = await fetch('/api/orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      setOrders(prev => prev.map(o => (o.id === id ? { ...o, status } : o)));
    }
  };

  return (
    <LayoutShell>
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center">
              <ClipboardList className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-main">Orders</h1>
              <p className="text-xs text-muted-app">Pesanan yang dicatat AI lewat tool Catat Pesanan.</p>
            </div>
          </div>
          <button onClick={fetchOrders}
            className="p-2.5 border border-app rounded-xl text-muted-app hover:text-main bg-card-app shadow-sm">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-card-app border border-dashed border-app rounded-2xl p-16 text-center">
            <p className="text-sm text-muted-app">
              Belum ada pesanan. Aktifkan tool <span className="font-bold">Catat Pesanan</span> di Settings → Tools agar AI bisa mencatat pesanan pelanggan.
            </p>
          </div>
        ) : (
          <div className="bg-card-app border border-app rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-app text-[10px] uppercase font-bold text-muted-app tracking-widest">
                  <th className="px-5 py-3">Ref</th>
                  <th className="px-5 py-3">Pelanggan</th>
                  <th className="px-5 py-3">Barang</th>
                  <th className="px-5 py-3">Alamat</th>
                  <th className="px-5 py-3">Bot</th>
                  <th className="px-5 py-3">Tanggal</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-app last:border-0 hover:bg-muted/40">
                    <td className="px-5 py-3 text-[11px] font-mono font-bold text-main">
                      {order.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-xs font-bold text-main">{order.customer_name || '-'}</p>
                      <p className="text-[10px] text-muted-app">{order.customer_contact || ''}</p>
                    </td>
                    <td className="px-5 py-3 text-[11px] text-main max-w-[200px]">
                      {(order.items || []).map(i => `${i.name} x${i.qty}`).join(', ') || '-'}
                    </td>
                    <td className="px-5 py-3 text-[11px] text-muted-app max-w-[220px] truncate" title={order.address || ''}>
                      {order.address || '-'}
                    </td>
                    <td className="px-5 py-3 text-[11px] text-muted-app">{order.bot_name}</td>
                    <td className="px-5 py-3 text-[11px] text-muted-app whitespace-nowrap">
                      {new Date(order.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-5 py-3">
                      <select value={order.status}
                        onChange={(e) => updateStatus(order.id, e.target.value)}
                        className={`text-[10px] font-bold rounded-full px-3 py-1.5 outline-none cursor-pointer appearance-none ${STATUS_STYLE[order.status] || ''}`}>
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </LayoutShell>
  );
}
