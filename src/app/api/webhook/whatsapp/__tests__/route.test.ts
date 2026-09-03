import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// Semua I/O route di-mock; test fokus ke alur webhook: Patch 2 (from_me),
// Patch 1 (notif handoff Telegram), dan Patch 5 (ad_context CTWA).
const h = vi.hoisted(() => {
  // Mock supabaseAdmin berbasis tabel: select/single membaca `tables`,
  // insert/update terekam di `writes` untuk di-assert.
  const tables: Record<string, any> = {};
  const writes: Array<{ table: string; op: string; payload: any }> = [];
  const builder = (table: string) => {
    const b: any = {
      select: () => b,
      eq: () => b,
      in: () => b,
      order: () => b,
      insert: (payload: any) => { writes.push({ table, op: 'insert', payload }); return b; },
      update: (payload: any) => { writes.push({ table, op: 'update', payload }); return b; },
      single: async () => ({
        data: tables[table] ?? null,
        error: tables[table] ? null : { code: 'PGRST116' },
      }),
      maybeSingle: async () => ({ data: tables[table] ?? null, error: null }),
      // Query tanpa single() di-await langsung (mis. knowledge_sources)
      then: (resolve: any) => resolve({ data: tables[table] ?? null, error: null }),
    };
    return b;
  };
  return {
    tables,
    writes,
    builder,
    processMessage: vi.fn(),
    sendTelegramMessage: vi.fn(),
    checkRateLimit: vi.fn(),
  };
});

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: (t: string) => h.builder(t) },
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/ai', () => ({ processMessage: h.processMessage }));
vi.mock('@/lib/telegram', () => ({ sendTelegramMessage: h.sendTelegramMessage }));
vi.mock('@/lib/eventLog', () => ({ logEvent: vi.fn() }));
vi.mock('@/lib/rateLimit', () => ({
  checkRateLimit: h.checkRateLimit,
  RATE_LIMIT_REPLY: 'rate-limited',
}));
vi.mock('@/lib/stageClassifier', () => ({
  runStageClassification: vi.fn(async () => null),
}));
vi.mock('@/lib/labelClassifier', () => ({
  runLabelClassification: vi.fn(async () => null),
}));
vi.mock('@/lib/orchestrator', () => ({ resolveHandoff: vi.fn() }));
vi.mock('@/lib/tools', () => ({ fetchBotTools: vi.fn(async () => []) }));
vi.mock('@/lib/cache', () => ({
  cached: (_key: string, fn: () => any) => fn(),
  cacheKeys: {
    botById: (id: string) => `bot:${id}`,
    botByPhone: (p: string) => `botp:${p}`,
    knowledge: (id: string) => `k:${id}`,
  },
}));
vi.mock('@/lib/rag', () => ({
  shouldUseRag: () => false,
  retrieveKnowledge: vi.fn(async () => []),
}));
vi.mock('@/lib/whatsapp', () => ({
  findConnectionBySessionKey: vi.fn(async () => null),
  findConnectionByPhone: vi.fn(async () => null),
}));
vi.mock('@/lib/contacts', () => ({
  ensureContactForConversation: vi.fn(async () => null),
}));

import { POST } from '../route';

const ENV_KEYS = ['BRIDGE_SHARED_TOKEN', 'OWNER_CHAT_ID', 'TELEGRAM_BOT_TOKEN', 'SENTRY_TEST'] as const;
const envBackup: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) envBackup[k] = process.env[k];
afterAll(() => {
  for (const k of ENV_KEYS) {
    if (envBackup[k] === undefined) delete process.env[k];
    else process.env[k] = envBackup[k];
  }
});

const baseBot = {
  id: 'bot-1',
  user_id: 'user-1',
  system_prompt: 'prompt',
  transfer_condition: 'kondisi',
  ai_model: 'groq',
  orchestration_enabled: false,
  tools_enabled: false,
  stop_ai_after_handoff: true,
};

const baseConv = {
  id: 'conv-1',
  bot_id: 'bot-1',
  chat_id: '6281234567890',
  name: 'Budi',
  status: 'active',
  stage: 'interested',
  contact_id: 'contact-1',
  history: [{ role: 'user', content: 'halo' }],
  metadata: {},
};

const aiResultOk = {
  aiResponse: 'Siap kak 🙏',
  bubbles: ['Siap kak 🙏'],
  handoffTriggered: false,
  latencyMainMs: 10,
  latencyHandoffMs: 5,
  promptTokens: 1,
  completionTokens: 1,
  modelUsed: 'model-x',
  usedFallback: false,
  toolCallsMade: 0,
  errorMessage: null,
};

function makeReq(payload: any) {
  return new Request('http://localhost/api/webhook/whatsapp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }) as any;
}

function convUpdates() {
  return h.writes.filter((w) => w.table === 'conversations' && w.op === 'update');
}

beforeEach(() => {
  vi.clearAllMocks();
  h.writes.length = 0;
  for (const key of Object.keys(h.tables)) delete h.tables[key];
  for (const k of ENV_KEYS) delete process.env[k];
  h.tables.bots = { ...baseBot };
  h.tables.conversations = { ...baseConv, history: [...baseConv.history], metadata: {} };
  h.tables.knowledge_sources = [];
  h.checkRateLimit.mockResolvedValue({ limited: false });
  h.processMessage.mockResolvedValue({ ...aiResultOk });
  h.sendTelegramMessage.mockResolvedValue({ ok: true });
});

describe('Patch 2: payload from_me (balasan manual owner dari HP)', () => {
  it('disimpan sebagai assistant, status pending, AI tidak dipanggil, tanpa reply', async () => {
    const res = await POST(makeReq({
      bot_id: 'bot-1', from: '6281234567890', name: 'Rama',
      text: 'siap kak, aku kerjakan preview-nya', from_me: true,
    }));
    const body = await res.json();

    expect(body.reply).toBeUndefined();
    expect(body.ok).toBe(true);
    expect(h.processMessage).not.toHaveBeenCalled();

    const updates = convUpdates();
    expect(updates).toHaveLength(1);
    const patch = updates[0].payload;
    // `manual: true` menandai ini balasan owner, bukan balasan AI — supaya
    // tidak menghabiskan kuota max_ai_replies.
    expect(patch.history[patch.history.length - 1]).toEqual({
      role: 'assistant',
      content: 'siap kak, aku kerjakan preview-nya',
      manual: true,
    });
    expect(patch.status).toBe('pending');
    expect(patch.handoff_at).toBeTruthy();
    expect(patch.last_message_at).toBeTruthy();
  });

  it('percakapan yang sudah pending tidak diubah statusnya lagi', async () => {
    h.tables.conversations = { ...baseConv, status: 'pending', history: [] };
    await POST(makeReq({ bot_id: 'bot-1', from: '6281234567890', text: 'ok', from_me: true }));

    const patch = convUpdates()[0].payload;
    expect(patch.status).toBeUndefined();
    expect(patch.handoff_at).toBeUndefined();
    expect(patch.history[0]).toEqual({ role: 'assistant', content: 'ok', manual: true });
  });
});

describe('Patch 1: notifikasi Telegram saat handoff', () => {
  const payload = { bot_id: 'bot-1', from: '6281234567890', name: 'Budi', text: 'oke deal' };

  it('handoff → notif terkirim ke OWNER_CHAT_ID berisi nama, nomor, dan stage', async () => {
    process.env.OWNER_CHAT_ID = '99887766';
    process.env.TELEGRAM_BOT_TOKEN = 'token-tg';
    h.processMessage.mockResolvedValue({ ...aiResultOk, handoffTriggered: true });

    const res = await POST(makeReq(payload));
    const body = await res.json();

    expect(body.reply).toBe('Siap kak 🙏');
    expect(h.sendTelegramMessage).toHaveBeenCalledTimes(1);
    const [token, chatId, text] = h.sendTelegramMessage.mock.calls[0];
    expect(token).toBe('token-tg');
    expect(chatId).toBe('99887766');
    expect(text).toContain('HANDOFF');
    expect(text).toContain('Budi');
    expect(text).toContain('6281234567890');
    expect(text).toContain('interested');
  });

  it('gagal kirim notif TIDAK menggagalkan balasan', async () => {
    process.env.OWNER_CHAT_ID = '99887766';
    process.env.TELEGRAM_BOT_TOKEN = 'token-tg';
    h.processMessage.mockResolvedValue({ ...aiResultOk, handoffTriggered: true });
    h.sendTelegramMessage.mockRejectedValue(new Error('telegram down'));

    const res = await POST(makeReq(payload));
    const body = await res.json();

    expect(body.reply).toBe('Siap kak 🙏');
    // handoff tetap tercatat di conversations walau notif gagal
    const statusPatch = convUpdates().find((u) => u.payload.status === 'pending');
    expect(statusPatch).toBeTruthy();
  });

  it('tanpa handoff → tidak ada notif', async () => {
    process.env.OWNER_CHAT_ID = '99887766';
    process.env.TELEGRAM_BOT_TOKEN = 'token-tg';

    await POST(makeReq(payload));
    expect(h.sendTelegramMessage).not.toHaveBeenCalled();
  });

  it('env notif kosong → tidak ada notif, balasan tetap jalan', async () => {
    h.processMessage.mockResolvedValue({ ...aiResultOk, handoffTriggered: true });

    const res = await POST(makeReq(payload));
    const body = await res.json();

    expect(body.reply).toBe('Siap kak 🙏');
    expect(h.sendTelegramMessage).not.toHaveBeenCalled();
  });
});

describe('Patch 5: ad_context CTWA disimpan ke conversations.metadata', () => {
  const adContext = { title: 'Website Rp949rb', ctwa_clid: 'CLID123' };
  const payload = {
    bot_id: 'bot-1', from: '6281234567890', name: 'Budi',
    text: 'berapa harganya?', ad_context: adContext,
  };

  it('disimpan sekali di pesan pertama', async () => {
    await POST(makeReq(payload));

    const metaUpdate = convUpdates().find((u) => u.payload.metadata);
    expect(metaUpdate).toBeTruthy();
    expect(metaUpdate!.payload.metadata.ad_context).toEqual(adContext);
  });

  it('tidak menimpa ad_context yang sudah ada', async () => {
    h.tables.conversations = {
      ...baseConv,
      history: [],
      metadata: { ad_context: { title: 'Iklan Lama' } },
    };

    await POST(makeReq(payload));

    const metaUpdate = convUpdates().find((u) => u.payload.metadata);
    expect(metaUpdate).toBeUndefined();
  });

  it('pesan tanpa ad_context tidak menyentuh metadata', async () => {
    await POST(makeReq({ ...payload, ad_context: undefined }));

    const metaUpdate = convUpdates().find((u) => u.payload.metadata);
    expect(metaUpdate).toBeUndefined();
  });
});

describe('Batas balasan AI (bots.max_ai_replies)', () => {
  const payload = { bot_id: 'bot-1', from: '6281234567890', name: 'Budi', text: 'boleh nawar ga kak?' };

  // Dua balasan inti bot sudah keluar (sapa + harga)
  const historyDuaBalasan = [
    { role: 'user', content: 'halo' },
    { role: 'assistant', content: 'usahanya apa kak?' },
    { role: 'user', content: 'berapa harganya?' },
    { role: 'assistant', content: 'Rp949.000 kak, mau preview?' },
  ];

  function forceHandoffArg() {
    return h.processMessage.mock.calls[0]?.[7];
  }

  it('kuota belum habis → processMessage dipanggil tanpa force', async () => {
    h.tables.bots = { ...baseBot, max_ai_replies: 2 };
    h.tables.conversations = { ...baseConv, history: [{ role: 'user', content: 'halo' }] };

    await POST(makeReq(payload));

    expect(forceHandoffArg()).toEqual({ forceHandoff: false });
  });

  it('kuota habis → force, status pending, dan notif Telegram terkirim', async () => {
    process.env.OWNER_CHAT_ID = '99887766';
    process.env.TELEGRAM_BOT_TOKEN = 'token-tg';
    h.tables.bots = { ...baseBot, max_ai_replies: 2 };
    h.tables.conversations = { ...baseConv, history: [...historyDuaBalasan] };
    // processMessage yang di-force selalu mengembalikan handoffTriggered true
    h.processMessage.mockResolvedValue({ ...aiResultOk, handoffTriggered: true });

    const res = await POST(makeReq(payload));
    const body = await res.json();

    expect(forceHandoffArg()).toEqual({ forceHandoff: true });
    expect(body.reply).toBe('Siap kak 🙏');

    const statusPatch = convUpdates().find((u) => u.payload.status === 'pending');
    expect(statusPatch).toBeTruthy();
    expect(statusPatch!.payload.handoff_at).toBeTruthy();
    expect(h.sendTelegramMessage).toHaveBeenCalledTimes(1);
  });

  it('follow-up otomatis tidak menghabiskan kuota', async () => {
    h.tables.bots = { ...baseBot, max_ai_replies: 3 };
    h.tables.conversations = {
      ...baseConv,
      history: [...historyDuaBalasan, { role: 'assistant', content: 'masih dipertimbangkan kak?', followup: true }],
    };

    await POST(makeReq(payload));

    // 3 entri assistant, tapi satu di antaranya follow-up → baru 2 balasan
    expect(forceHandoffArg()).toEqual({ forceHandoff: false });
  });

  it('max_ai_replies null (bot lain) → tidak pernah di-force', async () => {
    h.tables.bots = { ...baseBot, max_ai_replies: null };
    h.tables.conversations = {
      ...baseConv,
      history: [...historyDuaBalasan, ...historyDuaBalasan],
    };

    await POST(makeReq(payload));

    expect(forceHandoffArg()).toEqual({ forceHandoff: false });
  });
});
