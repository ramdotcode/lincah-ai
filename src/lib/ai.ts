if (typeof window !== 'undefined') {
  throw new Error('This module can only be used on the server to protect API keys.');
}

import Groq from 'groq-sdk';
import * as Sentry from '@sentry/nextjs';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

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
}

// Model configuration based on ai_model selection
const MODEL_CONFIG = {
  standard: {
    main: 'llama-3.1-8b-instant',      // Faster, lightweight
    handoff: 'llama-3.1-8b-instant',
    temperature: 0.7,
  },
  advance: {
    main: 'llama-3.3-70b-versatile',   // More capable, better reasoning
    handoff: 'llama-3.1-8b-instant',
    temperature: 0.7,
  },
};

export async function processMessage(
  systemPrompt: string,
  history: Message[],
  userMessage: string,
  transferCondition: string,
  knowledgeSources: KnowledgeSource[] = [],
  aiModel: string = 'standard'
): Promise<ProcessMessageResult> {
  // 0. Limit history to save tokens
  const trimmedHistory = history.slice(-10);

  // Select model configuration
  const config = MODEL_CONFIG[aiModel as keyof typeof MODEL_CONFIG] || MODEL_CONFIG.standard;
  const mainModel = config.main;
  const handoffModel = config.handoff;
  const temperature = config.temperature;

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

  // Parallel requests to Groq with error handling
  const results = await Promise.allSettled([
    // 1. Generate response
    (async () => {
      const startTime = performance.now();
      try {
        const response = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: enhancedSystemPrompt },
            ...trimmedHistory,
            { role: 'user', content: userMessage },
          ],
          model: mainModel,
          temperature: temperature,
        });
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
            error_type: error instanceof Error && error.message.includes('429') ? 'rate_limit' :
                       error instanceof Error && error.message.includes('timeout') ? 'timeout' : 'other',
          },
          contexts: {
            groq_api: {
              model: mainModel,
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
            error_type: error instanceof Error && error.message.includes('429') ? 'rate_limit' :
                       error instanceof Error && error.message.includes('timeout') ? 'timeout' : 'other',
          },
          contexts: {
            groq_api: {
              model: handoffModel,
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

  if (results[0].status === 'fulfilled') {
    aiResponse = results[0].value.choices[0]?.message?.content || '';
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
  };
}
