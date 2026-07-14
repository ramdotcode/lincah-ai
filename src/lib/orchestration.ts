// Logika murni orchestration parent-child (pengganti multi-agent routing lama).
// Pure function tanpa I/O agar mudah dites — I/O ada di orchestrator.ts.

export interface ChildBot {
  id: string;
  name: string;
  system_prompt: string | null;
  ai_model: string | null;
}

export interface ChildAssignment {
  id: string;
  assign_condition: string;
  child: ChildBot;
}

// Pemegang chat saat ini: assignment yang child-nya = active_child_bot_id.
// null berarti parent yang pegang (termasuk saat assignment-nya sudah dihapus).
export function currentHolder(
  assignments: ChildAssignment[],
  activeChildBotId: string | null
): ChildAssignment | null {
  if (!activeChildBotId) return null;
  return assignments.find(a => a.child.id === activeChildBotId) || null;
}

// Cocokkan jawaban evaluator (nama bot child) ke assignment-nya.
// Nama terpanjang menang agar "Sales Support" tidak termakan "Sales".
export function findAssignmentByName(
  assignments: ChildAssignment[],
  name: string | null
): ChildAssignment | null {
  if (!name) return null;
  const target = name.trim().toLowerCase();
  const exact = assignments.find(a => a.child.name.trim().toLowerCase() === target);
  if (exact) return exact;
  return (
    [...assignments]
      .sort((a, b) => b.child.name.length - a.child.name.length)
      .find(a => target.includes(a.child.name.trim().toLowerCase())) || null
  );
}
