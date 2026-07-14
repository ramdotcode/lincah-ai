import { describe, it, expect } from 'vitest';
import { ChildAssignment, currentHolder, findAssignmentByName } from '../orchestration';

const child = (id: string, name: string): ChildAssignment => ({
  id: `assign-${id}`,
  assign_condition: `when customer asks about ${name}`,
  child: { id, name, system_prompt: null, ai_model: null },
});

const assignments = [child('b1', 'Sales'), child('b2', 'Sales Support'), child('b3', 'Billing')];

describe('currentHolder', () => {
  it('null saat parent yang pegang (tidak ada active child)', () => {
    expect(currentHolder(assignments, null)).toBeNull();
  });

  it('menemukan assignment pemegang chat', () => {
    expect(currentHolder(assignments, 'b3')?.child.name).toBe('Billing');
  });

  it('kembali ke parent saat assignment child sudah dihapus', () => {
    expect(currentHolder(assignments, 'b-deleted')).toBeNull();
  });

  it('aman saat daftar assignment kosong', () => {
    expect(currentHolder([], 'b1')).toBeNull();
  });
});

describe('findAssignmentByName', () => {
  it('null saat evaluator menjawab NONE (name null) — chat tidak pindah', () => {
    expect(findAssignmentByName(assignments, null)).toBeNull();
  });

  it('match exact, case-insensitive, abaikan spasi pinggir', () => {
    expect(findAssignmentByName(assignments, '  billing ')?.child.id).toBe('b3');
  });

  it('nama yang saling substring tidak salah pilih: "sales support" → Sales Support', () => {
    expect(findAssignmentByName(assignments, 'sales support')?.child.id).toBe('b2');
  });

  it('jawaban dengan embel-embel tetap ter-match ke nama terpanjang yang cocok', () => {
    expect(findAssignmentByName(assignments, 'assign to sales support team')?.child.id).toBe('b2');
  });

  it('nama tak dikenal → null (tetap di pemegang sekarang)', () => {
    expect(findAssignmentByName(assignments, 'Marketing')).toBeNull();
  });
});
