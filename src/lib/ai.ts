if (typeof window !== 'undefined') {
  throw new Error('This module can only be used on the server to protect API keys.');
}

import * as Sentry from '@sentry/nextjs';
import { buildToolSchemas, executeTool, ToolContext } from '@/lib/tools';
import { BUBBLE_INSTRUCTION, splitBubbles, joinBubbles } from '@/lib/bubbles';

// Rantai fallback provider — semua OpenAI-compatible, urutan = prioritas.
// Groq (utama, tercepat) → Cerebras (free tier cepat) → OpenRouter (model :free).
// Nvidia NIM sengaja tidak dipakai (latensi terlalu tinggi).
// Provider tanpa API key di env otomatis dilewati.
const PROVIDERS = [
  {
    name: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: process.env.GROQ_API_KEY,
    models: { main: 'llama-3.3-70b-versatile', fast: 'llama-3.1-8b-instant' },
  },
  {
    // Free tier Cerebras (Jul 2026) hanya: gpt-oss-120b, zai-glm-4.7, gemma-4-31b
    // (5 RPM / 30K TPM / 1M token per hari per model)
    name: 'cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    apiKey: process.env.CEREBRAS_API_KEY,
    models: { main: 'gpt-oss-120b', fast: 'gemma-4-31b' },
  },
  {
    // Model :free OpenRouter (20 RPM / 200 req per hari); llama-3.3-70b:free
    // dihapus 19 Jul 2026, jadi pakai gpt-oss & llama kecil
    name: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
    models: { main: 'openai/gpt-oss-20b:free', fast: 'meta-llama/llama-3.2-3b-instruct:free' },
  },
];

// 'main' = balasan utama (70B-class), 'fast' = classifier YES/NO (8B-class)
type ModelTier = 'main' | 'fast';

interface ChatResult {
  data: any;        // JSON respons OpenAI-compatible (choices, usage, ...)
  provider: string; // provider yang akhirnya menjawab
  model: string;    // model yang dipakai provider tersebut
}

async function callProvider(
  provider: (typeof PROVIDERS)[number],
  tier: ModelTier,
  payload: any
): Promise<ChatResult> {
  const model = provider.models[tier];
  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({ model, ...payload }),
  });

  if (!res.ok) {
    const error = (await res.text()).slice(0, 300);
    throw new Error(`${provider.name} API error: ${res.status} - ${error}`);
  }

  return { data: await res.json(), provider: provider.name, model };
}

// Coba tiap provider berurutan (rate limit/error → lanjut ke berikutnya);
// lempar error terakhir bila semua gagal.
async function chatWithFallback(
  tier: ModelTier,
  payload: any,
  feature: string
): Promise<ChatResult> {
  // Untuk tes lokal: matikan provider tertentu tanpa menghapus API key-nya,
  // mis. AI_DISABLE_PROVIDERS=groq → langsung jatuh ke Cerebras/OpenRouter.
  const disabled = (process.env.AI_DISABLE_PROVIDERS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  const available = PROVIDERS.filter(p => p.apiKey && !disabled.includes(p.name));
  if (available.length === 0) {
    throw new Error('Tidak ada API key AI yang terkonfigurasi (GROQ_API_KEY / CEREBRAS_API_KEY / OPENROUTER_API_KEY)');
  }

  let lastError: unknown;
  for (const provider of available) {
    try {
      return await callProvider(provider, tier, payload);
    } catch (error) {
      lastError = error;
      Sentry.captureException(error, {
        tags: { provider: provider.name, model: provider.models[tier], feature },
      });
    }
  }
  throw lastError;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface KnowledgeSource {
  type: string;
  name: string;
  content: string;
}

export interface ProcessMessageResult {
  aiResponse: string;      // teks bersih (bubbles digabung '\n\n', tanpa penanda |||)
  bubbles: string[];       // balasan terpecah per bubble untuk dikirim berurutan per channel
  handoffTriggered: boolean;
  latencyMainMs?: number;
  latencyHandoffMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  modelUsed?: string;      // model that actually produced the reply (after fallback)
  usedFallback?: boolean;  // true bila Groq gagal dan Cerebras/OpenRouter mengambil alih
  errorMessage?: string;   // set when the main call failed entirely
  toolCallsMade?: number;  // number of tool executions during this reply (Fase D)
}

// Sent to the customer when every model attempt fails — never leave the bot silent
const FALLBACK_REPLY = 'Maaf, sistem sedang sibuk. Mohon coba beberapa saat lagi ya 🙏';

// Parameter default balasan utama (semua provider di rantai)
const MAIN_TEMPERATURE = 0.7;
const MAIN_MAX_TOKENS = 1024;

// Batas putaran tool: model boleh memanggil tools maksimal 3 ronde per balasan
const MAX_TOOL_ROUNDS = 3;

export async function processMessage(
  systemPrompt: string,
  history: Message[],
  userMessage: string,
  transferCondition: string,
  knowledgeSources: KnowledgeSource[] = [],
  aiModel: string = 'groq',
  toolContext?: ToolContext
): Promise<ProcessMessageResult> {
  // 0. Limit history to save tokens
  const trimmedHistory = history.slice(-10);

  // aiModel (pilihan provider lama per-bot: deepseek/zai/nvidia) tidak dipakai
  // lagi — semua balasan lewat rantai fallback Groq → Cerebras → OpenRouter.
  void aiModel;
  const temperature = MAIN_TEMPERATURE;
  const maxTokens = MAIN_MAX_TOKENS;

  // Group and Format Knowledge Context
  let knowledgeContext = '';
  if (knowledgeSources.length > 0) {
    const grouped = knowledgeSources.reduce((acc: any, curr) => {
      if (!acc[curr.type]) acc[curr.type] = [];
      acc[curr.type].push(curr);
      return acc;
    }, {});

    knowledgeContext = Object.entries(grouped)
      .map(([type, sources]: [string, any]) => {
        const title = type.toUpperCase();
        const content = sources.map((s: any) => `[Source: ${s.name}]\n${s.content}`).join('\n\n');
        return `### ${title}\n${content}`;
      })
      .join('\n\n');
  }

  // Construct enhanced system prompt with knowledge
  const enhancedSystemPrompt = `
${systemPrompt}

### BUSINESS KNOWLEDGE & CONTEXT
The following is the specialized knowledge about the business. Use this as your primary source of truth.
${knowledgeContext || 'No specific business data provided yet. Use general knowledge if appropriate or ask for clarification.'}
${BUBBLE_INSTRUCTION}
`.trim();

  // Measure latency for both parallel requests
  let latencyMainMs = 0;
  let latencyHandoffMs = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let modelUsed = PROVIDERS[0].models.main;
  let usedFallback = false;
  let toolCallsMade = 0;

  const toolSchemas = toolContext?.tools?.length ? buildToolSchemas(toolContext.tools) : [];

  // Parallel requests with error handling
  const results = await Promise.allSettled([
    // 1. Generate response
    (async () => {
      const startTime = performance.now();

      const mainMessages = [
        { role: 'system' as const, content: enhancedSystemPrompt },
        ...trimmedHistory,
        { role: 'user' as const, content: userMessage },
      ];

      // Tool use (Fase D): lewat rantai fallback juga — payload tools identik
      // untuk semua provider OpenAI-compatible di rantai.
      if (toolSchemas.length > 0 && toolContext) {
        const toolMessages: any[] = [...mainMessages];
        try {
          let result = await chatWithFallback('main', {
            messages: toolMessages,
            temperature,
            tools: toolSchemas,
            tool_choice: 'auto',
          }, 'tool_use');

          for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            const msg = result.data.choices[0]?.message;
            if (!msg?.tool_calls?.length) break;

            toolMessages.push(msg);
            for (const call of msg.tool_calls) {
              let args: any = {};
              try {
                args = JSON.parse(call.function.arguments || '{}');
              } catch {
                // biarkan args kosong; executor akan mengembalikan pesan error yang ramah
              }
              const toolResult = await executeTool(call.function.name, args, toolContext);
              toolCallsMade++;
              toolMessages.push({ role: 'tool', tool_call_id: call.id, content: toolResult });
            }

            // Ronde terakhir: paksa jawaban teks agar tidak menggantung di tool_calls
            const isLastRound = round === MAX_TOOL_ROUNDS - 1;
            result = await chatWithFallback('main', {
              messages: toolMessages,
              temperature,
              ...(isLastRound ? {} : { tools: toolSchemas, tool_choice: 'auto' }),
            }, 'tool_use');
          }

          latencyMainMs = Math.round(performance.now() - startTime);
          modelUsed = result.model;
          usedFallback = result.provider !== 'groq';
          if (result.data.usage) {
            promptTokens = result.data.usage.prompt_tokens;
            completionTokens = result.data.usage.completion_tokens;
          }
          return result;
        } catch (error) {
          latencyMainMs = Math.round(performance.now() - startTime);
          Sentry.captureException(error, {
            tags: { feature: 'tool_use', fallback_chain: 'exhausted' },
          });
          throw error;
        }
      }

      try {
        const result = await chatWithFallback('main', {
          messages: mainMessages,
          temperature,
          max_tokens: maxTokens,
        }, 'main_reply');

        latencyMainMs = Math.round(performance.now() - startTime);
        modelUsed = result.model;
        usedFallback = result.provider !== 'groq';
        // Capture tokens from main model
        if (result.data.usage) {
          promptTokens = result.data.usage.prompt_tokens;
          completionTokens = result.data.usage.completion_tokens;
        }
        return result;
      } catch (error) {
        latencyMainMs = Math.round(performance.now() - startTime);
        Sentry.captureException(error, {
          tags: {
            feature: 'main_reply',
            fallback_chain: 'exhausted',
            error_type: error instanceof Error && error.message.includes('429') ? 'rate_limit' :
                       error instanceof Error && error.message.includes('timeout') ? 'timeout' : 'other',
          },
          contexts: {
            ai_api: {
              message_count: trimmedHistory.length,
            },
          },
        });
        throw error;
      }
    })(),
    // 2. Check for handoff
    (async () => {
      const startTime = performance.now();
      try {
        // Model kecil (tier fast) cukup untuk cek YES/NO
        const result = await chatWithFallback('fast', {
          messages: [
            {
              role: 'system',
              content: `You are a handoff checker. Your job is to determine if the user's latest message or conversation context triggers the handoff condition.
Condition: "${transferCondition}"
Reply ONLY with "YES" or "NO".`,
            },
            ...trimmedHistory,
            { role: 'user', content: userMessage },
          ],
          temperature: 0,
        }, 'handoff_check');

        latencyHandoffMs = Math.round(performance.now() - startTime);
        return result;
      } catch (error) {
        latencyHandoffMs = Math.round(performance.now() - startTime);
        Sentry.captureException(error, {
          tags: {
            feature: 'handoff_check',
            fallback_chain: 'exhausted',
            error_type: error instanceof Error && error.message.includes('429') ? 'rate_limit' :
                       error instanceof Error && error.message.includes('timeout') ? 'timeout' : 'other',
          },
          contexts: {
            ai_api: {
              message_count: trimmedHistory.length,
            },
          },
        });
        throw error;
      }
    })(),
  ]);

  let aiResponse = '';
  let handoffTriggered = false;
  let errorMessage: string | undefined;

  if (results[0].status === 'fulfilled') {
    aiResponse = results[0].value.data.choices[0]?.message?.content || '';
  } else {
    errorMessage = results[0].reason instanceof Error ? results[0].reason.message : String(results[0].reason);
  }

  // Never leave the customer without a reply
  if (!aiResponse) {
    aiResponse = FALLBACK_REPLY;
  }

  if (results[1].status === 'fulfilled') {
    handoffTriggered = results[1].value.data.choices[0]?.message?.content?.toUpperCase().includes('YES') || false;
  }

  // Pecah balasan menjadi bubble (penanda ||| dari BUBBLE_INSTRUCTION);
  // aiResponse yang keluar selalu bersih tanpa penanda.
  const bubbles = splitBubbles(aiResponse);

  return {
    aiResponse: joinBubbles(bubbles),
    bubbles,
    handoffTriggered,
    latencyMainMs,
    latencyHandoffMs,
    promptTokens,
    completionTokens,
    modelUsed,
    usedFallback,
    errorMessage,
    toolCallsMade,
  };
}

export interface ConditionEvaluationResult {
  answer: string | null;      // null when the model failed
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  errorMessage?: string;
}

export interface HandoffCandidate {
  name: string;
  condition: string;
}

// Orchestration (parent-child): cek apakah salah satu kondisi handoff child
// terpenuhi. Default NONE — chat TIDAK pindah kecuali kondisinya jelas terpenuhi.
// Mirrors the handoff checker: tier fast (8B) via rantai fallback, temp 0.
// Never throws — a failed evaluation must not disturb the reply flow.
export async function evaluateAssignConditions(
  candidates: HandoffCandidate[],
  history: Message[],
  userMessage: string
): Promise<ConditionEvaluationResult> {
  const trimmedHistory = history.slice(-10);
  const startTime = performance.now();

  const candidateList = candidates
    .map(c => `- ${c.name}: assign when ${c.condition}`)
    .join('\n');
  const candidateNames = candidates.map(c => c.name).join(', ');

  try {
    const { data: response } = await chatWithFallback('fast', {
      messages: [
        {
          role: 'system',
          content: `You are a handoff supervisor for a customer service system. The current agent keeps handling the chat UNLESS one of these handoff conditions is clearly met by the customer's latest message:
${candidateList}
If a condition is clearly met, reply ONLY with that agent name, one of: ${candidateNames}.
If no condition is clearly met, or you are unsure, reply ONLY with: NONE.`,
        },
        ...trimmedHistory,
        { role: 'user', content: userMessage },
      ],
      temperature: 0,
    }, 'agent_handoff');

    const latencyMs = Math.round(performance.now() - startTime);
    const raw = response.choices[0]?.message?.content?.trim().toLowerCase() || '';

    if (!raw || raw === 'none' || raw.startsWith('none')) {
      return {
        answer: null,
        latencyMs,
        promptTokens: response.usage?.prompt_tokens,
        completionTokens: response.usage?.completion_tokens,
      };
    }

    // Cocokkan nama terpanjang dulu agar "Sales Support" tidak termakan "Sales"
    const match = [...candidates]
      .sort((a, b) => b.name.length - a.name.length)
      .find(c => raw.includes(c.name.trim().toLowerCase()));

    return {
      answer: match ? match.name : null,
      latencyMs,
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      errorMessage: match ? undefined : `Unrecognized handoff output: "${raw}"`,
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startTime);
    Sentry.captureException(error, {
      tags: { feature: 'agent_handoff', fallback_chain: 'exhausted' },
    });
    return {
      answer: null,
      latencyMs,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

// Orchestration: cek kondisi balik ke parent saat chat dipegang child.
// Default NO — chat tetap di child kecuali kondisinya jelas terpenuhi.
export async function evaluateRevertCondition(
  condition: string,
  history: Message[],
  userMessage: string
): Promise<ConditionEvaluationResult> {
  const trimmedHistory = history.slice(-10);
  const startTime = performance.now();

  try {
    const { data: response } = await chatWithFallback('fast', {
      messages: [
        {
          role: 'system',
          content: `You are a handoff supervisor for a customer service system. The chat is currently handled by a specialist agent. It should be returned to the main agent ONLY when this condition is clearly met: ${condition}
Based on the conversation and the customer's latest message, reply ONLY with YES (return to main agent) or NO (keep the specialist). If unsure, reply NO.`,
        },
        ...trimmedHistory,
        { role: 'user', content: userMessage },
      ],
      temperature: 0,
    }, 'agent_revert');

    const latencyMs = Math.round(performance.now() - startTime);
    const raw = response.choices[0]?.message?.content?.trim().toUpperCase() || '';

    return {
      answer: raw.startsWith('YES') ? 'YES' : 'NO',
      latencyMs,
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startTime);
    Sentry.captureException(error, {
      tags: { feature: 'agent_revert', fallback_chain: 'exhausted' },
    });
    return {
      answer: null,
      latencyMs,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface StageClassificationResult {
  stage: string | null;   // null when the model failed or answered garbage
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  errorMessage?: string;
}

const LEAD_STAGES = ['new', 'interested', 'negotiating', 'won', 'lost'];

const DEFAULT_STAGE_PROMPT = `You are a sales pipeline classifier for a customer service bot. Based on the conversation, classify the customer's buying stage.
Stages:
- new: just started, greeting, or asking generic questions
- interested: asking about products, prices, availability, or showing buying interest
- negotiating: discussing discounts, payment terms, delivery, or comparing options seriously
- won: confirmed purchase, paid, or committed to buy
- lost: explicitly declined, not interested, or bought elsewhere
Reply ONLY with one word: new, interested, negotiating, won, or lost.`;

// Mirrors the handoff checker: tier fast (8B) via rantai fallback, temp 0.
// Never throws — a failed classification must not disturb the reply flow.
// `stages` (Fase 7): daftar stage custom akun {key,label}. Bila diberikan, prompt
// dibangun dari label-nya & hasil dipetakan balik ke key. Tanpa itu → default 5 stage.
export async function classifyLeadStage(
  history: Message[],
  userMessage: string,
  stages?: Array<{ key: string; label: string }>
): Promise<StageClassificationResult> {
  const trimmedHistory = history.slice(-10);
  const startTime = performance.now();
  const useCustom = !!stages && stages.length > 0;

  try {
    const systemContent = useCustom
      ? `You are a sales pipeline classifier for a customer service bot. Based on the conversation, classify the customer's current stage into exactly one of these:
${stages!.map(s => `- ${s.label}`).join('\n')}
Reply ONLY with one stage label exactly as written above. If none clearly fit, reply: unknown.`
      : DEFAULT_STAGE_PROMPT;

    const { data: response } = await chatWithFallback('fast', {
      messages: [
        { role: 'system', content: systemContent },
        ...trimmedHistory,
        { role: 'user', content: userMessage },
      ],
      temperature: 0,
    }, 'stage_classification');

    const latencyMs = Math.round(performance.now() - startTime);
    const raw = response.choices[0]?.message?.content?.trim().toLowerCase() || '';
    const stage = useCustom
      ? (stages!.find(s => raw === s.label.toLowerCase() || raw.startsWith(s.label.toLowerCase()))?.key || null)
      : (LEAD_STAGES.find(s => raw === s || raw.startsWith(s)) || null);

    return {
      stage,
      latencyMs,
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      errorMessage: stage ? undefined : `Unrecognized stage output: "${raw}"`,
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startTime);
    Sentry.captureException(error, {
      tags: { feature: 'stage_classification', fallback_chain: 'exhausted' },
    });
    return {
      stage: null,
      latencyMs,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface LabelClassificationResult {
  labelIds: string[]; // subset dari kandidat yang menurut model relevan
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  errorMessage?: string;
}

// AI auto-label (CRM Fase 4): pilih label mana dari daftar kandidat yang jelas
// relevan dengan percakapan. Pola sama dengan classifyLeadStage: tier fast,
// temp 0, tidak pernah throw. Kandidat = label akun yang di-set ai_enabled.
export async function classifyLabels(
  history: Message[],
  userMessage: string,
  candidates: Array<{ id: string; name: string }>
): Promise<LabelClassificationResult> {
  const trimmedHistory = history.slice(-10);
  const startTime = performance.now();

  if (candidates.length === 0) {
    return { labelIds: [], latencyMs: 0 };
  }

  try {
    const labelList = candidates.map(c => `- ${c.name}`).join('\n');
    const { data: response } = await chatWithFallback('fast', {
      messages: [
        {
          role: 'system',
          content: `You are a conversation tagger for a customer service bot. Based on the conversation, decide which of the available labels CLEARLY apply.
Available labels:
${labelList}
Rules:
- Only pick labels that clearly match the conversation content. When in doubt, do not pick.
- Reply ONLY with the matching label names separated by commas, exactly as written above.
- If none apply, reply exactly: none`,
        },
        ...trimmedHistory,
        { role: 'user', content: userMessage },
      ],
      temperature: 0,
    }, 'label_classification');

    const latencyMs = Math.round(performance.now() - startTime);
    const raw: string = response.choices[0]?.message?.content?.trim().toLowerCase() || '';

    let labelIds: string[] = [];
    if (raw && raw !== 'none') {
      const picked = raw.split(',').map(s => s.trim()).filter(Boolean);
      labelIds = candidates
        .filter(c => picked.includes(c.name.toLowerCase()))
        .map(c => c.id);
    }

    return {
      labelIds,
      latencyMs,
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startTime);
    Sentry.captureException(error, {
      tags: { feature: 'label_classification', fallback_chain: 'exhausted' },
    });
    return {
      labelIds: [],
      latencyMs,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface FollowupGenerationResult {
  message: string | null; // null bila model gagal → pemanggil jatuh ke template
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  errorMessage?: string;
}

// AI-contextual follow-up (CRM Fase 5): susun satu pesan follow-up singkat dari
// riwayat percakapan, dengan nada mengikuti system prompt bot. Tier main (70B)
// untuk kualitas. Tidak pernah throw — pemanggil (cron) jatuh ke template bila null.

export async function generateFollowupMessage(
  history: Message[],
  opts: { systemPrompt?: string | null; customerName?: string | null }
): Promise<FollowupGenerationResult> {
  const trimmedHistory = history.slice(-12).filter(m => m.role === 'user' || m.role === 'assistant');
  const startTime = performance.now();

  if (trimmedHistory.length === 0) {
    return { message: null, latencyMs: 0, errorMessage: 'Riwayat kosong' };
  }

  const namePart = opts.customerName?.trim() ? ` Nama pelanggan: ${opts.customerName.trim()}.` : '';
  const tonePart = opts.systemPrompt?.trim()
    ? `Ikuti gaya bahasa & persona ini:\n"""${opts.systemPrompt.trim().slice(0, 800)}"""`
    : 'Gunakan bahasa Indonesia yang ramah, sopan, dan tidak kaku.';

  try {
    const { data: response } = await chatWithFallback('main', {
      messages: [
        {
          role: 'system',
          content: `Kamu menulis SATU pesan follow-up WhatsApp/Telegram untuk pelanggan yang belum membalas percakapan sebelumnya.${namePart}
${tonePart}

Aturan:
- Rujuk konteks percakapan (produk/kebutuhan yang tadi dibahas), jangan generik.
- Singkat: 1-2 kalimat, boleh 1 emoji. Ramah, tidak memaksa.
- Ini pesan pertama yang kamu KIRIM DULUAN, bukan balasan. Jangan awali dengan "Baik" / "Tentu".
- Balas HANYA teks pesan follow-up-nya. Tanpa tanda kutip, tanpa penjelasan.`,
        },
        ...trimmedHistory,
        { role: 'user', content: '[Sistem: pelanggan belum membalas. Tulis pesan follow-up sekarang.]' },
      ],
      temperature: 0.7,
      max_tokens: 200,
    }, 'followup_generation');

    const latencyMs = Math.round(performance.now() - startTime);
    const raw = response.choices[0]?.message?.content?.trim() || '';
    // Buang tanda kutip pembungkus bila model menambahkannya
    const message = raw.replace(/^["']|["']$/g, '').trim() || null;

    return {
      message,
      latencyMs,
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      errorMessage: message ? undefined : 'Model mengembalikan teks kosong',
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startTime);
    Sentry.captureException(error, {
      tags: { feature: 'followup_generation', fallback_chain: 'exhausted' },
    });
    return {
      message: null,
      latencyMs,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}
