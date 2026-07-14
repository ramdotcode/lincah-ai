'use client';

import { useState, useEffect, useMemo } from 'react';
import LayoutShell from '@/components/LayoutShell';
import { format } from 'date-fns';
import {
  Search,
  History,
  User,
  LayoutGrid,
  Table as TableIcon,
  Send,
  MessageCircle
} from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { DEFAULT_STAGES, stageColorClass, PipelineStageDef } from '@/lib/stageConstants';

// Fallback awal sebelum /api/pipeline-stages termuat (identik perilaku lama)
const FALLBACK_STAGES: PipelineStageDef[] = DEFAULT_STAGES;

function formatRpCompact(n: number): string {
  if (n >= 1e9) return `Rp ${(n / 1e9).toFixed(1).replace('.0', '')}M`;
  if (n >= 1e6) return `Rp ${(n / 1e6).toFixed(1).replace('.0', '')}jt`;
  if (n >= 1e3) return `Rp ${Math.round(n / 1e3)}rb`;
  return `Rp ${n}`;
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === 'whatsapp') {
    return <MessageCircle className="w-3.5 h-3.5 text-green-500" aria-label="WhatsApp" />;
  }
  return <Send className="w-3.5 h-3.5 text-sky-500" aria-label="Telegram" />;
}

function LeadCard({ lead, dragging = false }: { lead: any; dragging?: boolean }) {
  return (
    <div className={`bg-card-app border border-app rounded-lg p-3 shadow-sm transition-colors ${
      dragging ? 'opacity-90 shadow-lg rotate-1' : 'hover:border-blue-500/40'
    }`}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 shrink-0 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 font-bold text-[10px]">
            {lead.name?.charAt(0) || <User className="w-3 h-3" />}
          </div>
          <p className="text-xs font-semibold text-main truncate">{lead.name || lead.chat_id}</p>
        </div>
        <PlatformIcon platform={lead.platform} />
      </div>
      {lead.last_message && (
        <p className="text-[11px] text-muted-app line-clamp-2 mb-1.5">{lead.last_message}</p>
      )}
      {Number(lead.deal_value) > 0 && (
        <p className="text-[10px] font-bold text-emerald-600 mb-1.5">{formatRpCompact(Number(lead.deal_value))}</p>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-app">
          {lead.last_message_at ? format(new Date(lead.last_message_at), 'MMM d, HH:mm') : '—'}
        </span>
        <button
          onClick={() => (window.location.href = `/monitor?id=${lead.id}`)}
          className="p-1 hover:bg-muted text-muted-app hover:text-blue-500 rounded transition-colors"
        >
          <History className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function DraggableCard({ lead }: { lead: any }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`touch-none cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-30' : ''}`}
    >
      <LeadCard lead={lead} />
    </div>
  );
}

function KanbanColumn({ stage, leads }: { stage: PipelineStageDef; leads: any[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });
  const c = stageColorClass(stage.color);
  const totalValue = leads.reduce((sum, l) => sum + (Number(l.deal_value) || 0), 0);
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-[220px] bg-muted rounded-xl p-3 transition-colors ${
        isOver ? 'ring-2 ring-blue-500/40' : ''
      }`}
    >
      <div className="flex items-center gap-2 mb-1 px-1">
        <span className={`w-2 h-2 rounded-full ${c.dot}`} />
        <h3 className={`text-xs font-bold uppercase tracking-wider ${c.text}`}>{stage.label}</h3>
        <span className="text-[10px] text-muted-app font-semibold ml-auto">{leads.length}</span>
      </div>
      {totalValue > 0 && (
        <p className="text-[10px] text-muted-app font-semibold mb-2 px-1">{formatRpCompact(totalValue)}</p>
      )}
      <div className="space-y-2 min-h-[60px]">
        {leads.map((lead) => (
          <DraggableCard key={lead.id} lead={lead} />
        ))}
      </div>
    </div>
  );
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'table' | 'kanban'>('table');
  const [search, setSearch] = useState('');
  const [activeLead, setActiveLead] = useState<any | null>(null);
  const [stages, setStages] = useState<PipelineStageDef[]>(FALLBACK_STAGES);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/conversations');
      if (res.ok) {
        const data = await res.json();
        setLeads(data || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
    // Stage pipeline akun (fail-open: tetap pakai default bila belum ada)
    (async () => {
      try {
        const res = await fetch('/api/pipeline-stages');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length) setStages(data);
        }
      } catch { /* pakai fallback */ }
    })();
  }, []);

  const firstStageKey = stages[0]?.key || 'new';

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) =>
      [l.name, l.username, l.chat_id, l.last_message]
        .some((v) => v && String(v).toLowerCase().includes(q))
    );
  }, [leads, search]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of stages) counts[s.key] = 0;
    for (const l of filteredLeads) counts[l.stage || firstStageKey] = (counts[l.stage || firstStageKey] || 0) + 1;
    return counts;
  }, [filteredLeads, stages, firstStageKey]);

  // Total nilai deal per stage (forecast pipeline, Fase 9)
  const stageValues = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const s of stages) totals[s.key] = 0;
    for (const l of filteredLeads) {
      const v = Number(l.deal_value) || 0;
      const key = l.stage || firstStageKey;
      totals[key] = (totals[key] || 0) + v;
    }
    return totals;
  }, [filteredLeads, stages, firstStageKey]);

  const updateDealValue = async (id: string, raw: string) => {
    const value = raw.trim() === '' ? null : Number(raw.replace(/[^\d]/g, ''));
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, deal_value: value } : l)));
    await fetch('/api/conversations/deal', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, deal_value: value }),
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveLead(leads.find((l) => l.id === event.active.id) || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveLead(null);
    const { active, over } = event;
    if (!over) return;
    const lead = leads.find((l) => l.id === active.id);
    const newStage = String(over.id);
    if (!lead || (lead.stage || firstStageKey) === newStage) return;

    const prevStage = lead.stage;
    // Optimistic update
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, stage: newStage } : l)));

    const res = await fetch('/api/conversations/stage', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lead.id, stage: newStage }),
    });
    if (!res.ok) {
      // Rollback jika gagal
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, stage: prevStage } : l)));
    }
  };

  const renderTable = () => (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-muted">
          <th className="px-6 py-3 font-semibold text-muted-app text-xs uppercase tracking-wider">Lead Info</th>
          <th className="px-6 py-3 font-semibold text-muted-app text-xs uppercase tracking-wider">Username</th>
          <th className="px-6 py-3 font-semibold text-muted-app text-xs uppercase tracking-wider">Stage</th>
          <th className="px-6 py-3 font-semibold text-muted-app text-xs uppercase tracking-wider">Deal Value</th>
          <th className="px-6 py-3 font-semibold text-muted-app text-xs uppercase tracking-wider">Status</th>
          <th className="px-6 py-3 font-semibold text-muted-app text-xs uppercase tracking-wider">Last Sync</th>
          <th className="px-6 py-3 font-semibold text-muted-app text-xs uppercase tracking-wider text-right">Action</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-app">
        {filteredLeads.length === 0 ? (
          <tr>
            <td colSpan={7} className="px-6 py-12 text-center text-muted-app text-sm italic">
              {loading ? 'Crunching data...' : 'No conversations found yet.'}
            </td>
          </tr>
        ) : (
          filteredLeads.map((lead) => {
            const stage = stages.find((s) => s.key === (lead.stage || firstStageKey)) || stages[0];
            return (
              <tr key={lead.id} className="hover:bg-muted transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 font-bold text-xs">
                      {lead.name?.charAt(0) || <User className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-main flex items-center gap-1.5">
                        {lead.name || 'Anonymous'} <PlatformIcon platform={lead.platform} />
                      </p>
                      <p className="text-[10px] text-muted-app">{lead.chat_id}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-muted-app text-sm">
                  @{lead.username || 'n/a'}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-muted ${stageColorClass(stage.color).text}`}>
                    {stage.label}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-muted-app">Rp</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      defaultValue={lead.deal_value ? Number(lead.deal_value).toLocaleString('id-ID') : ''}
                      placeholder="—"
                      onBlur={(e) => {
                        const raw = e.target.value.replace(/[^\d]/g, '');
                        const current = lead.deal_value ? String(lead.deal_value) : '';
                        if (raw !== current) updateDealValue(lead.id, raw);
                        e.target.value = raw ? Number(raw).toLocaleString('id-ID') : '';
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className="w-24 bg-transparent border-b border-transparent hover:border-app focus:border-blue-500/50 text-sm text-main outline-none py-0.5 transition-colors"
                    />
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    lead.status === 'active' ? 'bg-green-500/10 text-green-500' :
                    lead.status === 'pending' ? 'bg-amber-500/10 text-amber-500' :
                    'bg-muted text-muted-app'
                  }`}>
                    {lead.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-muted-app text-xs">
                  {format(new Date(lead.last_message_at), 'MMM d, HH:mm')}
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => window.location.href = `/monitor?id=${lead.id}`}
                    className="p-1.5 hover:bg-muted text-muted-app hover:text-blue-500 rounded-md transition-colors"
                  >
                    <History className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );

  const renderKanban = () => (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 p-4 overflow-x-auto">
        {stages.map((stage) => (
          <KanbanColumn
            key={stage.key}
            stage={stage}
            leads={filteredLeads.filter((l) => (l.stage || firstStageKey) === stage.key)}
          />
        ))}
      </div>
      <DragOverlay>
        {activeLead ? <LeadCard lead={activeLead} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );

  return (
    <LayoutShell>
      <div className="p-8">
        <header className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-main">Leads & CRM</h1>
            <p className="text-sm text-muted-app mt-1">
              Total {leads.length} conversations managed by AI.
              {(() => {
                const openVal = stages.filter(s => s.type === 'open').reduce((sum, s) => sum + (stageValues[s.key] || 0), 0);
                const wonVal = stages.filter(s => s.type === 'won').reduce((sum, s) => sum + (stageValues[s.key] || 0), 0);
                if (openVal + wonVal === 0) return null;
                return (
                  <span className="ml-1">
                    Pipeline <span className="font-semibold text-main">{formatRpCompact(openVal)}</span>
                    {wonVal > 0 && <> · Won <span className="font-semibold text-emerald-600">{formatRpCompact(wonVal)}</span></>}
                  </span>
                );
              })()}
            </p>
          </div>
          <div className="flex gap-2">
            <div className="flex bg-card-app border border-app rounded-lg p-0.5">
              <button
                onClick={() => setView('table')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors ${
                  view === 'table' ? 'bg-blue-600 text-white shadow-sm' : 'text-muted-app hover:text-main'
                }`}
              >
                <TableIcon className="w-4 h-4" /> Table
              </button>
              <button
                onClick={() => setView('kanban')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors ${
                  view === 'kanban' ? 'bg-blue-600 text-white shadow-sm' : 'text-muted-app hover:text-main'
                }`}
              >
                <LayoutGrid className="w-4 h-4" /> Kanban
              </button>
            </div>
          </div>
        </header>

        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-app">
          {stages.map((s, i) => (
            <span key={s.key} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted-app/50 mr-2">·</span>}
              <span className={`w-1.5 h-1.5 rounded-full ${stageColorClass(s.color).dot}`} />
              <span className="font-semibold text-main">{stageCounts[s.key] || 0}</span> {s.label.toLowerCase()}
            </span>
          ))}
        </div>

        <div className="bg-card-app border border-app rounded-xl overflow-hidden shadow-sm transition-colors">
          <div className="p-4 border-b border-app flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app w-4 h-4" />
              <input
                type="text"
                placeholder="Search leads..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-muted border border-transparent rounded-lg px-10 py-2 text-sm focus:bg-card-app focus:border-blue-500/50 outline-none transition-all text-main"
              />
            </div>
          </div>

          {view === 'table' ? renderTable() : renderKanban()}
        </div>
      </div>
    </LayoutShell>
  );
}
