'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Bot, Pencil, Trash2, Loader2, Plus, Save, Info, RotateCcw } from 'lucide-react';

interface Assignment {
  key: string;               // key lokal untuk React (id DB atau key baru)
  child_bot_id: string;
  child_name: string;
  assign_condition: string;
  position: { x: number; y: number } | null;
}

interface AvailableBot {
  id: string;
  name: string;
}

const PARENT_NODE_ID = 'parent';
const PARENT_DEFAULT_POS = { x: 320, y: 40 };
const childDefaultPos = (i: number) => ({ x: 100 + i * 300, y: 280 });

// ── Custom nodes ────────────────────────────────────────────────────────────

function ParentNode({ data }: NodeProps) {
  const d = data as { revertCondition: string; onEdit: () => void };
  return (
    <div className="w-[280px] rounded-2xl overflow-hidden shadow-lg border border-orange-200 dark:border-orange-900/40 bg-white dark:bg-zinc-900">
      <div className="bg-orange-500 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <RotateCcw className="w-4 h-4" />
          <span className="text-xs font-bold">Parent Agent</span>
        </div>
        <button onClick={d.onEdit} className="p-1 rounded-lg hover:bg-white/20 text-white" title="Edit kondisi balik ke parent">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="px-4 py-3">
        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-app">Assign back to parent condition</p>
        <p className="text-[11px] text-main mt-1 line-clamp-2">
          {d.revertCondition || 'No Revert To Parent Condition set'}
        </p>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-orange-500" />
    </div>
  );
}

function ChildNode({ data }: NodeProps) {
  const d = data as { name: string; condition: string; onEdit: () => void; onDelete: () => void };
  return (
    <div className="w-[280px] rounded-2xl overflow-hidden shadow-lg border border-emerald-200 dark:border-emerald-900/40 bg-white dark:bg-zinc-900">
      <Handle type="target" position={Position.Top} className="!bg-emerald-500" />
      <div className="bg-emerald-600 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <Bot className="w-4 h-4" />
          <span className="text-xs font-bold">Child Agent</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={d.onEdit} className="p-1 rounded-lg hover:bg-white/20 text-white" title="Edit assignment">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={d.onDelete} className="p-1 rounded-lg hover:bg-white/20 text-white" title="Hapus child">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="px-4 py-3 space-y-2">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-app">AI Agent</p>
          <p className="text-[11px] font-bold text-main mt-0.5">{d.name}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-app">Assign condition</p>
          <p className="text-[11px] text-main mt-0.5 line-clamp-2">{d.condition}</p>
        </div>
      </div>
    </div>
  );
}

const nodeTypes = { parent: ParentNode, child: ChildNode };

// ── Main component ──────────────────────────────────────────────────────────

export default function OrchestrationCanvas({ botId }: { botId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [revertCondition, setRevertCondition] = useState('');
  const [parentPosition, setParentPosition] = useState<{ x: number; y: number } | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [availableBots, setAvailableBots] = useState<AvailableBot[]>([]);

  // Dialog state
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [showRevertForm, setShowRevertForm] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null); // null = tambah baru
  const [formChildId, setFormChildId] = useState('');
  const [formCondition, setFormCondition] = useState('');
  const [revertDraft, setRevertDraft] = useState('');

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/orchestration?botId=${botId}`);
        if (!res.ok) throw new Error('Gagal memuat konfigurasi orchestration');
        const data = await res.json();
        if (cancelled) return;
        setEnabled(data.enabled);
        setRevertCondition(data.revert_to_parent_condition || '');
        setParentPosition(data.parent_position || null);
        setAvailableBots(data.available_bots || []);
        setAssignments(
          (data.assignments || []).map((a: {
            id: string;
            child_bot_id: string;
            child_name: string;
            assign_condition: string;
            position: { x: number; y: number } | null;
          }) => ({
            key: a.id,
            child_bot_id: a.child_bot_id,
            child_name: a.child_name,
            assign_condition: a.assign_condition,
            position: a.position || null,
          }))
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Gagal memuat');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [botId]);

  const openAdd = useCallback(() => {
    setEditingKey(null);
    setFormChildId('');
    setFormCondition('');
    setShowAssignForm(true);
  }, []);

  const openEdit = useCallback((key: string) => {
    setAssignments(current => {
      const a = current.find(x => x.key === key);
      if (a) {
        setEditingKey(key);
        setFormChildId(a.child_bot_id);
        setFormCondition(a.assign_condition);
        setShowAssignForm(true);
      }
      return current;
    });
  }, []);

  const deleteAssignment = useCallback((key: string) => {
    setAssignments(current => current.filter(a => a.key !== key));
    setDirty(true);
  }, []);

  // Bangun ulang node/edge tiap data berubah, pertahankan posisi hasil drag
  useEffect(() => {
    setNodes(prev => {
      const posOf = (id: string) => prev.find(n => n.id === id)?.position;
      const parentNode: Node = {
        id: PARENT_NODE_ID,
        type: 'parent',
        position: posOf(PARENT_NODE_ID) || parentPosition || PARENT_DEFAULT_POS,
        data: {
          revertCondition,
          onEdit: () => { setRevertDraft(revertCondition); setShowRevertForm(true); },
        },
      };
      const childNodes: Node[] = assignments.map((a, i) => ({
        id: a.key,
        type: 'child',
        position: posOf(a.key) || a.position || childDefaultPos(i),
        data: {
          name: a.child_name,
          condition: a.assign_condition,
          onEdit: () => openEdit(a.key),
          onDelete: () => deleteAssignment(a.key),
        },
      }));
      return [parentNode, ...childNodes];
    });
    setEdges(
      assignments.map(a => ({
        id: `e-${a.key}`,
        source: PARENT_NODE_ID,
        target: a.key,
        animated: true,
        style: { strokeDasharray: '6 4', stroke: '#10b981' },
      }))
    );
  }, [assignments, revertCondition, parentPosition, openEdit, deleteAssignment, setNodes, setEdges]);

  const handleSaveAssignment = () => {
    if (!formChildId || !formCondition.trim()) {
      setError('Pilih AI agent dan isi kondisinya.');
      return;
    }
    setError(null);
    const childName = availableBots.find(b => b.id === formChildId)?.name || 'Unknown';
    if (editingKey) {
      setAssignments(current => current.map(a =>
        a.key === editingKey
          ? { ...a, child_bot_id: formChildId, child_name: childName, assign_condition: formCondition.trim() }
          : a
      ));
    } else {
      setAssignments(current => [...current, {
        key: `new-${formChildId}`,
        child_bot_id: formChildId,
        child_name: childName,
        assign_condition: formCondition.trim(),
        position: null,
      }]);
    }
    setShowAssignForm(false);
    setDirty(true);
  };

  const handleSaveRevert = () => {
    setRevertCondition(revertDraft.trim());
    setShowRevertForm(false);
    setDirty(true);
  };

  const handleSaveConfiguration = async () => {
    setSaving(true);
    setError(null);
    try {
      const posOf = (id: string) => nodes.find(n => n.id === id)?.position || null;
      const res = await fetch('/api/orchestration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId,
          enabled,
          revert_to_parent_condition: revertCondition,
          parent_position: posOf(PARENT_NODE_ID),
          assignments: assignments.map(a => ({
            child_bot_id: a.child_bot_id,
            assign_condition: a.assign_condition,
            position: posOf(a.key),
          })),
        }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Gagal menyimpan konfigurasi' }));
        throw new Error(error || 'Gagal menyimpan konfigurasi');
      }
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  // Bot yang masih bisa dipilih: belum jadi child (kecuali yang sedang diedit)
  const selectableBots = useMemo(() => {
    const editing = editingKey ? assignments.find(a => a.key === editingKey) : null;
    const taken = new Set(assignments.map(a => a.child_bot_id));
    return availableBots.filter(b => !taken.has(b.id) || b.id === editing?.child_bot_id);
  }, [availableBots, assignments, editingKey]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header: toggle + actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-main">AI Agent Orchestration</h3>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox"
              className="sr-only peer"
              checked={enabled}
              onChange={(e) => { setEnabled(e.target.checked); setDirty(true); }}
            />
            <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
          </label>
          <span className={`text-[11px] font-bold ${enabled ? 'text-emerald-600' : 'text-muted-app'}`}>
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openAdd}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-md">
            <Plus className="w-3.5 h-3.5" />
            Add Child Agent
          </button>
          <button onClick={handleSaveConfiguration} disabled={saving || !dirty}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white rounded-xl text-xs font-bold hover:bg-blue-600 transition-all shadow-md disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Configuration
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-950/30 border-l-4 border-blue-400 rounded-xl px-4 py-3">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-main">
          Chat dipegang parent agent (bot ini) dan hanya dilempar ke child agent saat kondisinya terpenuhi.
          Child agent memakai prompt, knowledge, dan model milik bot-nya sendiri. Chat kembali ke parent saat
          kondisi &quot;assign back to parent&quot; terpenuhi.
        </p>
      </div>

      {error && <p className="text-[11px] text-red-500 font-bold">{error}</p>}

      {/* Canvas */}
      <div className="flex-1 min-h-[480px] border border-dashed border-app rounded-2xl overflow-hidden bg-white dark:bg-zinc-950">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={(changes) => {
            onNodesChange(changes);
            if (changes.some(c => c.type === 'position')) setDirty(true);
          }}
          nodesConnectable={false}
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
          fitView
          fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={2} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      {/* Add/Edit assignment dialog */}
      {showAssignForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowAssignForm(false)}>
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-5" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-sm font-bold text-main">{editingKey ? 'Edit Assignment' : 'Add Child Agent'}</h4>

            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest pl-1">
                AI Agent <span className="text-red-500">*</span>
              </label>
              <select
                value={formChildId}
                onChange={(e) => setFormChildId(e.target.value)}
                className="w-full bg-white dark:bg-zinc-950 border border-app rounded-xl px-4 py-2.5 text-xs text-main outline-none focus:border-emerald-500 shadow-sm">
                <option value="">Select an AI Agent</option>
                {selectableBots.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              {selectableBots.length === 0 && (
                <p className="text-[10px] text-muted-app pl-1">
                  Tidak ada bot lain yang tersedia. Buat bot baru dulu di dashboard untuk dijadikan child agent.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest pl-1">
                When to Assign <span className="text-red-500">*</span>
              </label>
              <textarea rows={3}
                value={formCondition}
                onChange={(e) => setFormCondition(e.target.value)}
                placeholder="Describe the condition for assigning this agent (e.g., when customer asks about products)"
                className="w-full bg-white dark:bg-zinc-950 border border-app rounded-xl px-4 py-2.5 text-xs text-main outline-none focus:border-emerald-500 shadow-sm leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={() => setShowAssignForm(false)}
                className="px-5 py-2 border border-app rounded-xl text-xs font-bold text-muted-app hover:text-main transition-all">
                Cancel
              </button>
              <button onClick={handleSaveAssignment} disabled={!formChildId || !formCondition.trim()}
                className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all disabled:opacity-50">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revert-to-parent dialog */}
      {showRevertForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowRevertForm(false)}>
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-5" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-sm font-bold text-main">Edit Return to Parent Condition</h4>

            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest pl-1">When to return to parent</label>
              <textarea rows={3}
                value={revertDraft}
                onChange={(e) => setRevertDraft(e.target.value)}
                placeholder="Describe when to return to parent"
                className="w-full bg-white dark:bg-zinc-950 border border-app rounded-xl px-4 py-2.5 text-xs text-main outline-none focus:border-orange-500 shadow-sm leading-relaxed"
              />
              <p className="text-[10px] text-muted-app pl-1">
                Kosongkan agar child terus memegang chat sampai kamu mengubahnya.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={() => setShowRevertForm(false)}
                className="px-5 py-2 border border-app rounded-xl text-xs font-bold text-muted-app hover:text-main transition-all">
                Cancel
              </button>
              <button onClick={handleSaveRevert}
                className="px-5 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold hover:bg-orange-600 transition-all">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
