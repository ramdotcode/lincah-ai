// Logika pemilihan agent multi-agent routing (Fase C).
// Pure function tanpa I/O agar mudah dites — I/O ada di agentRouter.ts.

export interface RoutedAgent {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string | null;
  is_default: boolean;
  active: boolean;
}

export interface ResolveAgentInput {
  agents: RoutedAgent[];          // semua agent milik bot (boleh termasuk yang nonaktif)
  classifiedName: string | null;  // hasil router 8B, null kalau gagal/tidak dikenali
  activeAgentId: string | null;   // agent yang sedang menangani percakapan ini
}

// Urutan fallback: hasil router → agent aktif percakapan → agent default →
// agent pertama. null berarti pakai system prompt bot (single-agent behavior).
export function resolveAgent(input: ResolveAgentInput): RoutedAgent | null {
  const candidates = input.agents.filter(a => a.active);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  if (input.classifiedName) {
    const target = input.classifiedName.trim().toLowerCase();
    const matched = candidates.find(a => a.name.trim().toLowerCase() === target);
    if (matched) return matched;
  }

  if (input.activeAgentId) {
    const sticky = candidates.find(a => a.id === input.activeAgentId);
    if (sticky) return sticky;
  }

  const fallback = candidates.find(a => a.is_default);
  return fallback || candidates[0];
}
