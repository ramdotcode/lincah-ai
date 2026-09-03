import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
// ai.ts → tools.ts → supabase (butuh env). Test ini tidak menyentuh tool use.
vi.mock('@/lib/tools', () => ({
  buildToolSchemas: () => [],
  executeTool: vi.fn(),
}));

// PROVIDERS dirakit saat modul di-import, jadi API key harus terpasang duluan
// dan ai.ts di-import dinamis di beforeAll.
const envBackup = { ...process.env };
let processMessage: typeof import('@/lib/ai').processMessage;

beforeAll(async () => {
  process.env.GROQ_API_KEY = 'test-key';
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.AI_DISABLE_PROVIDERS;
  ({ processMessage } = await import('@/lib/ai'));
});

afterAll(() => {
  process.env = envBackup;
});

// Balasan OpenAI-compatible palsu. `content` dipakai untuk balasan utama,
// dan untuk checker cukup "YES"/"NO".
function reply(content: string) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }),
  };
}

/** Payload yang dikirim ke tiap panggilan fetch (urutan sesuai pemanggilan). */
function bodies(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map((c: unknown[]) => JSON.parse((c[1] as { body: string }).body));
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('processMessage: forceHandoff', () => {
  it('menyisipkan instruksi balasan terakhir, melewati checker, dan handoff pasti true', async () => {
    fetchMock.mockResolvedValue(reply('Siap kak, aku sambungin ke Rama ya 🙏'));

    const result = await processMessage(
      'PROMPT BOT',
      [{ role: 'user', content: 'halo' }, { role: 'assistant', content: 'halo kak' }],
      'oke deh',
      'kondisi handoff',
      [],
      'groq',
      undefined,
      { forceHandoff: true },
    );

    // Hanya 1 request: balasan utama. Checker (tier fast) tidak dipanggil.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [payload] = bodies(fetchMock);
    expect(payload.messages[0].content).toContain('### INI BALASAN TERAKHIRMU');
    expect(payload.messages[0].content).toContain('### WAKTU SEKARANG');
    expect(result.handoffTriggered).toBe(true);
  });

  it('tanpa forceHandoff: checker dipanggil dan instruksi tidak disisipkan', async () => {
    fetchMock
      .mockResolvedValueOnce(reply('Websitenya buat usaha apa kak?'))
      .mockResolvedValueOnce(reply('NO'));

    const result = await processMessage(
      'PROMPT BOT', [], 'halo', 'kondisi handoff', [], 'groq',
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodies(fetchMock)[0].messages[0].content).not.toContain('INI BALASAN TERAKHIRMU');
    expect(result.handoffTriggered).toBe(false);
  });
});

describe('processMessage: jaring pengaman frasa pamit', () => {
  it('bot bilang "sambungin ke Rama" tapi checker NO → tetap handoff', async () => {
    fetchMock
      .mockResolvedValueOnce(reply('Oke kak, aku sambungin ke Rama ya 🙏'))
      .mockResolvedValueOnce(reply('NO'));

    const result = await processMessage(
      'PROMPT BOT', [], 'boleh nawar?', 'kondisi handoff', [], 'groq',
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.handoffTriggered).toBe(true);
  });

  it('balasan biasa + checker NO → tidak handoff', async () => {
    fetchMock
      .mockResolvedValueOnce(reply('Paket Landing Page Rp949.000 kak, mau dibuatkan preview?'))
      .mockResolvedValueOnce(reply('NO'));

    const result = await processMessage(
      'PROMPT BOT', [], 'berapa harganya?', 'kondisi handoff', [], 'groq',
    );

    expect(result.handoffTriggered).toBe(false);
  });
});
