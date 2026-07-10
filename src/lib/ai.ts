if (typeof window !== 'undefined') {
  throw new Error('This module can only be used on the server to protect API keys.');
}

import Groq from 'groq-sdk';
import * as Sentry from '@sentry/nextjs';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Nvidia NIM client using fetch
const nvidiaClient = {
  baseUrl: process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_NIM_API_KEY,
  
  async chatCompletions(payload: any) {
    if (!this.apiKey) {
      throw new Error('NVIDIA_NIM_API_KEY is not configured');
    }
    
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Nvidia NIM API error: ${response.status} - ${error}`);
    }

    return response.json();
  },
};

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
  aiResponse: string;
  handoffTriggered: boolean;
  latencyMainMs?: number;
  latencyHandoffMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  modelUsed?: string;      // model that actually produced the reply (after fallback)
  usedFallback?: boolean;  // true if NIM failed and Groq took over
  errorMessage?: string;   // set when the main call failed entirely
}

// Sent to the customer when every model attempt fails — never leave the bot silent
const FALLBACK_REPLY = 'Maaf, sistem sedang sibuk. Mohon coba beberapa saat lagi ya 🙏';

// Model configuration based on ai_model selection.
// Handoff detection always runs on Groq (fast) regardless of main provider.
const HANDOFF_MODEL = 'llama-3.1-8b-instant';

const MODEL_CONFIG = {
  groq: {
    provider: 'groq',
    main: 'llama-3.3-70b-versatile',    // Groq's most capable model
    temperature: 0.7,
    maxTokens: 1024,
  },
  deepseek: {
    provider: 'nvidia',
    main: 'deepseek-ai/deepseek-v4-flash',  // DeepSeek v4 Flash via NIM
    temperature: 0.7,
    maxTokens: 4096, // reasoning model: needs headroom for thinking + answer
  },
  zai: {
    provider: 'nvidia',
    main: 'z-ai/glm-5.2',                   // Z.AI GLM 5.2 via NIM
    temperature: 0.7,
    maxTokens: 1024,
  },
  nvidia: {
    provider: 'nvidia',
    main: 'nvidia/nemotron-3-ultra-550b-a55b', // Nvidia Nemotron 3 Ultra
    temperature: 0.7,
    maxTokens: 1024,
  },
};

export async function processMessage(
  systemPrompt: string,
  history: Message[],
  userMessage: string,
  transferCondition: string,
  knowledgeSources: KnowledgeSource[] = [],
  aiModel: string = 'groq'
): Promise<ProcessMessageResult> {
  // 0. Limit history to save tokens
  const trimmedHistory = history.slice(-10);

  // Select model configuration
  const config = MODEL_CONFIG[aiModel as keyof typeof MODEL_CONFIG] || MODEL_CONFIG.groq;
  const mainModel = config.main;
  const handoffModel = HANDOFF_MODEL;
  const temperature = config.temperature;
  const maxTokens = config.maxTokens;
  const provider = config.provider;

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
`.trim();

  // Measure latency for both parallel requests
  let latencyMainMs = 0;
  let latencyHandoffMs = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let modelUsed = mainModel;
  let usedFallback = false;

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

      const callMain = (prov: string, model: string) =>
        prov === 'nvidia'
          ? nvidiaClient.chatCompletions({
              model,
              messages: mainMessages,
              temperature: temperature,
              max_tokens: maxTokens,
            })
          : groq.chat.completions.create({
              messages: mainMessages,
              model,
              temperature: temperature,
            });

      try {
        let response;

        try {
          response = await callMain(provider, mainModel);
        } catch (error) {
          // NIM down or rate-limited: retry once via Groq so the bot still replies
          if (provider !== 'nvidia') throw error;

          Sentry.captureException(error, {
            tags: { model: mainModel, provider: provider, fallback: 'groq' },
          });
          usedFallback = true;
          modelUsed = MODEL_CONFIG.groq.main;
          response = await callMain('groq', MODEL_CONFIG.groq.main);
        }

        latencyMainMs = Math.round(performance.now() - startTime);
        // Capture tokens from main model
        if (response.usage) {
          promptTokens = response.usage.prompt_tokens;
          completionTokens = response.usage.completion_tokens;
        }
        return response;
      } catch (error) {
        latencyMainMs = Math.round(performance.now() - startTime);
        Sentry.captureException(error, {
          tags: {
            model: mainModel,
            provider: provider,
            error_type: error instanceof Error && error.message.includes('429') ? 'rate_limit' :
                       error instanceof Error && error.message.includes('timeout') ? 'timeout' : 'other',
          },
          contexts: {
            ai_api: {
              model: mainModel,
              provider: provider,
              ai_model_selected: aiModel,
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
        // Always via Groq: NIM free tier is too slow for a YES/NO check
        const response = await groq.chat.completions.create({
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
          model: handoffModel,
          temperature: 0,
        });

        latencyHandoffMs = Math.round(performance.now() - startTime);
        return response;
      } catch (error) {
        latencyHandoffMs = Math.round(performance.now() - startTime);
        Sentry.captureException(error, {
          tags: {
            model: handoffModel,
            provider: 'groq',
            error_type: error instanceof Error && error.message.includes('429') ? 'rate_limit' :
                       error instanceof Error && error.message.includes('timeout') ? 'timeout' : 'other',
          },
          contexts: {
            ai_api: {
              model: handoffModel,
              provider: provider,
              ai_model_selected: aiModel,
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
    aiResponse = results[0].value.choices[0]?.message?.content || '';
  } else {
    errorMessage = results[0].reason instanceof Error ? results[0].reason.message : String(results[0].reason);
  }

  // Never leave the customer without a reply
  if (!aiResponse) {
    aiResponse = FALLBACK_REPLY;
  }

  if (results[1].status === 'fulfilled') {
    handoffTriggered = results[1].value.choices[0]?.message?.content?.toUpperCase().includes('YES') || false;
  }

  return {
    aiResponse,
    handoffTriggered,
    latencyMainMs,
    latencyHandoffMs,
    promptTokens,
    completionTokens,
    modelUsed,
    usedFallback,
    errorMessage,
  };
}

export interface StageClassificationResult {
  stage: string | null;   // null when the model failed or answered garbage
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  errorMessage?: string;
}

const LEAD_STAGES = ['new', 'interested', 'negotiating', 'won', 'lost'];

// Mirrors the handoff checker: always Groq 8B, temp 0, one-word answer.
// Never throws — a failed classification must not disturb the reply flow.
export async function classifyLeadStage(
  history: Message[],
  userMessage: string
): Promise<StageClassificationResult> {
  const trimmedHistory = history.slice(-10);
  const startTime = performance.now();

  try {
    const response = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are a sales pipeline classifier for a customer service bot. Based on the conversation, classify the customer's buying stage.
Stages:
- new: just started, greeting, or asking generic questions
- interested: asking about products, prices, availability, or showing buying interest
- negotiating: discussing discounts, payment terms, delivery, or comparing options seriously
- won: confirmed purchase, paid, or committed to buy
- lost: explicitly declined, not interested, or bought elsewhere
Reply ONLY with one word: new, interested, negotiating, won, or lost.`,
        },
        ...trimmedHistory,
        { role: 'user', content: userMessage },
      ],
      model: HANDOFF_MODEL,
      temperature: 0,
    });

    const latencyMs = Math.round(performance.now() - startTime);
    const raw = response.choices[0]?.message?.content?.trim().toLowerCase() || '';
    const stage = LEAD_STAGES.find(s => raw === s || raw.startsWith(s)) || null;

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
      tags: { model: HANDOFF_MODEL, provider: 'groq', feature: 'stage_classification' },
    });
    return {
      stage: null,
      latencyMs,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}
