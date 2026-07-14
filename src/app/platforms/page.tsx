'use client';

import { useState, useEffect } from 'react';
import LayoutShell from '@/components/LayoutShell';
import WhatsAppStatus from '@/components/WhatsAppStatus';
import { Link as LinkIcon, Save, Loader2, MessageSquare, Share2, Bot } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface WaConnection {
  bot_id: string;
  enabled: boolean;
  phone_number: string;
  bot_type: string;
  phone_id: string;
  access_token: string;
}

interface BotOption {
  id: string;
  name: string;
  widget_enabled?: boolean;
  [key: string]: unknown;
}

const EMPTY_CONNECTION: WaConnection = {
  bot_id: '',
  enabled: false,
  phone_number: '',
  bot_type: 'baileys',
  phone_id: '',
  access_token: '',
};

// Connected Platforms (level akun): WhatsApp terikat ke AKUN — satu akun satu
// nomor WA — lalu ditugaskan ke satu AI agent penjawab. Widget masih per-bot.
export default function PlatformsPage() {
  const [conn, setConn] = useState<WaConnection>(EMPTY_CONNECTION);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [bots, setBots] = useState<BotOption[]>([]);
  const [widgetBot, setWidgetBot] = useState<BotOption | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [waRes, botsRes] = await Promise.all([
          fetch('/api/platforms/whatsapp'),
          fetch('/api/bot'),
        ]);
        if (waRes.ok) {
          const data = await waRes.json();
          setSessionKey(data.session_key);
          if (data.connection) {
            setConn({
              bot_id: data.connection.bot_id || '',
              enabled: !!data.connection.enabled,
              phone_number: data.connection.phone_number || '',
              bot_type: data.connection.bot_type || 'baileys',
              phone_id: data.connection.phone_id || '',
              access_token: data.connection.access_token || '',
            });
          }
        }
        if (botsRes.ok) {
          const data = await botsRes.json();
          // Row bot lengkap: dipakai dropdown sekaligus save widget (POST /api/bot butuh objek utuh)
          const list: BotOption[] = Array.isArray(data) ? data : [data].filter(Boolean);
          setBots(list);
          setWidgetBot(list[0] || null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (conn.enabled && !conn.bot_id) {
        setError('Pilih AI agent yang menjawab WhatsApp dulu.');
        return;
      }
      const requests: Promise<Response>[] = [];
      if (conn.bot_id) {
        requests.push(fetch('/api/platforms/whatsapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(conn),
        }));
      }
      if (widgetBot) {
        requests.push(fetch('/api/bot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(widgetBot),
        }));
      }
      const results = await Promise.all(requests);
      const failed = results.find(r => !r.ok);
      if (failed) {
        const { error } = await failed.json().catch(() => ({ error: 'Gagal menyimpan' }));
        setError(error || 'Gagal menyimpan');
        return;
      }
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    } catch {
      setError('Tidak bisa terhubung ke server.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <LayoutShell>
      <div className="h-full overflow-y-auto p-8 bg-[#fcfcfc] dark:bg-zinc-950/50">
        <div className="max-w-2xl mx-auto space-y-12 pb-20">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
                <LinkIcon className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-main">Connected Platforms</h1>
                <p className="text-xs text-muted-app">Koneksi channel milik akunmu — satu akun satu nomor WhatsApp.</p>
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white rounded-xl text-xs font-bold hover:bg-blue-600 transition-all shadow-md disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {showSaved ? 'Saved!' : 'Save Changes'}
            </button>
          </div>

          {error && <p className="text-[11px] text-red-500 font-bold">{error}</p>}

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : (
            <>
              {/* WhatsApp Section — level akun */}
              <div className="bg-card-app border border-app rounded-[2.5rem] p-8 space-y-8 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#25D366]/10 rounded-full flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="w-6 h-6 fill-[#25D366]"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 .004 5.412 0 12.048c0 2.123.554 4.197 1.608 6.037L0 24l6.117-1.605a11.803 11.803 0 005.925 1.586h.005c6.637 0 12.05-5.414 12.05-12.051 0-3.213-1.25-6.232-3.522-8.504z"/></svg>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-main">WhatsApp</h4>
                      <p className="text-[11px] text-muted-app">Satu nomor WA untuk akun ini, dijawab oleh satu AI agent.</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox"
                      className="sr-only peer"
                      checked={conn.enabled}
                      onChange={(e) => setConn({ ...conn, enabled: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                <AnimatePresence>
                  {conn.enabled && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden space-y-6 pt-4 border-t border-app"
                    >
                      <div className="space-y-6">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest px-1 flex items-center gap-1.5">
                            <Bot className="w-3 h-3" /> AI Agent yang menjawab
                          </label>
                          <select
                            value={conn.bot_id}
                            onChange={(e) => setConn({ ...conn, bot_id: e.target.value })}
                            className="w-full bg-white dark:bg-zinc-900 border border-app rounded-xl px-4 py-2.5 text-xs text-main outline-none focus:border-emerald-500 shadow-sm"
                          >
                            <option value="">Pilih AI Agent</option>
                            {bots.map(b => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                          </select>
                          <p className="text-[10px] text-muted-app px-1">
                            Semua chat WA masuk dijawab agent ini (termasuk orchestration-nya kalau aktif).
                          </p>
                        </div>

                        <div className="space-y-4">
                          <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest px-1">Integration Type</label>
                          <div className="grid grid-cols-3 gap-4">
                            <button
                              onClick={() => setConn({ ...conn, bot_type: 'baileys' })}
                              className={`p-4 rounded-2xl border-2 text-left transition-all ${
                                (conn.bot_type || 'baileys') === 'baileys'
                                ? 'border-emerald-500 bg-emerald-50/50'
                                : 'border-app bg-white dark:bg-zinc-900'
                              }`}>
                              <p className="text-xs font-bold text-main">Local Baileys</p>
                              <p className="text-[9px] text-muted-app mt-1">Connect via QR Scan (Local Terminal)</p>
                            </button>
                            <button
                              onClick={() => setConn({ ...conn, bot_type: 'official' })}
                              className={`p-4 rounded-2xl border-2 text-left transition-all ${
                                conn.bot_type === 'official'
                                ? 'border-blue-500 bg-blue-50/50'
                                : 'border-app bg-white dark:bg-zinc-900'
                              }`}>
                              <p className="text-xs font-bold text-main">Meta Official</p>
                              <p className="text-[9px] text-muted-app mt-1">Cloud API (Ready for Scale)</p>
                            </button>
                          </div>
                        </div>

                        {/* Live Status for Baileys — sesi worker di-key per akun */}
                        {(conn.bot_type || 'baileys') === 'baileys' && sessionKey && (
                          <div className="pt-4 animate-in fade-in slide-in-from-top-4 duration-500">
                            <WhatsAppStatus botId={sessionKey} />
                          </div>
                        )}

                        <div className="space-y-4">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest px-1">WhatsApp Phone Number</label>
                            <input
                              type="text"
                              placeholder="e.g. 628123456789"
                              value={conn.phone_number}
                              onChange={(e) => setConn({ ...conn, phone_number: e.target.value })}
                              className="w-full bg-white dark:bg-zinc-900 border border-app rounded-xl px-4 py-2.5 text-xs text-main outline-none focus:border-emerald-500 shadow-sm"
                            />
                            <p className="text-[10px] text-muted-app px-1 italic">Use international format without &apos;+&apos;.</p>
                          </div>

                          {conn.bot_type === 'official' && (
                            <div className="space-y-4 pt-4 border-t border-app">
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest px-1">Phone Number ID</label>
                                <input
                                  type="text"
                                  value={conn.phone_id}
                                  onChange={(e) => setConn({ ...conn, phone_id: e.target.value })}
                                  className="w-full bg-white dark:bg-zinc-900 border border-app rounded-xl px-4 py-2.5 text-xs text-main outline-none focus:border-blue-500 shadow-sm"
                                />
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest px-1">Access Token</label>
                                <input
                                  type="password"
                                  value={conn.access_token}
                                  onChange={(e) => setConn({ ...conn, access_token: e.target.value })}
                                  className="w-full bg-white dark:bg-zinc-900 border border-app rounded-xl px-4 py-2.5 text-xs text-main outline-none focus:border-blue-500 shadow-sm"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Live Chat Widget Section — masih per-bot */}
              <div className="bg-card-app border border-app rounded-[2.5rem] p-8 space-y-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center">
                      <MessageSquare className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-main">Live Chat Widget</h4>
                      <p className="text-[11px] text-muted-app">Chat mengambang yang bisa dipasang di website mana pun.</p>
                    </div>
                  </div>
                  {widgetBot && (
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox"
                        className="sr-only peer"
                        checked={!!widgetBot.widget_enabled}
                        onChange={(e) => setWidgetBot({ ...widgetBot, widget_enabled: e.target.checked })}
                      />
                      <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                    </label>
                  )}
                </div>

                {!widgetBot ? (
                  <p className="text-[11px] text-muted-app">Belum ada AI agent. Buat dulu di halaman AI Agents.</p>
                ) : (
                  <div className="space-y-4 pt-4 border-t border-app">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest px-1 flex items-center gap-1.5">
                        <Bot className="w-3 h-3" /> AI Agent untuk widget
                      </label>
                      <select
                        value={widgetBot.id}
                        onChange={(e) => setWidgetBot(bots.find(b => b.id === e.target.value) || null)}
                        className="w-full bg-white dark:bg-zinc-900 border border-app rounded-xl px-4 py-2.5 text-xs text-main outline-none focus:border-blue-500 shadow-sm"
                      >
                        {bots.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>

                    {widgetBot.widget_enabled && (
                      <div className="space-y-3">
                        <p className="text-[11px] text-muted-app">
                          Simpan dulu dengan <span className="font-bold">Save Changes</span>, lalu tempel kode ini sebelum <span className="font-mono">&lt;/body&gt;</span> di website kamu:
                        </p>
                        <pre className="bg-zinc-900 text-emerald-400 text-[11px] rounded-xl p-4 overflow-x-auto font-mono leading-relaxed">
{`<script src="${typeof window !== 'undefined' ? window.location.origin : ''}/widget.js"
  data-bot-id="${widgetBot.id}" defer></script>`}
                        </pre>
                        <p className="text-[10px] text-muted-app">
                          Percakapan dari widget muncul di Live Monitoring dengan platform <span className="font-bold">webchat</span>. Orchestration, tools, dan handoff berlaku sama seperti channel lain.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Telegram Section (Existing but empty placeholder) */}
              <div className="bg-card-app border border-app rounded-[2.5rem] p-8 opacity-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center">
                      <Share2 className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-main">Telegram</h4>
                      <p className="text-[11px] text-muted-app">Standard Telegram Bot token.</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-muted-app">COMING SOON</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </LayoutShell>
  );
}
