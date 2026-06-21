if (typeof window !== 'undefined') {
  throw new Error('This module can only be used on the server to protect API keys.');
}

import Groq from 'groq-sdk';

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

export async function processMessage(
  systemPrompt: string,
  history: Message[],
  userMessage: string,
  transferCondition: string,
  knowledgeSources: KnowledgeSource[] = []
) {
  // 0. Limit history to save tokens
  const trimmedHistory = history.slice(-10);

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

  // Parallel requests to Groq
  const [responseAction, handoffAction] = await Promise.all([
    // 1. Generate response
    groq.chat.completions.create({
      messages: [
        { role: 'system', content: enhancedSystemPrompt },
        ...trimmedHistory,
        { role: 'user', content: userMessage },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
    }),
    // 2. Check for handoff
    groq.chat.completions.create({
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
      model: 'llama-3.1-8b-instant',
      temperature: 0,
    }),
  ]);

  const aiResponse = responseAction.choices[0]?.message?.content || '';
  const handoffTriggered = handoffAction.choices[0]?.message?.content?.toUpperCase().includes('YES') || false;

  return {
    aiResponse,
    handoffTriggered,
  };
}
