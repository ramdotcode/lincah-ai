'use client';

import { useState, useEffect } from 'react';
import LayoutShell from '@/components/LayoutShell';
import { 
  Plus, 
  Search, 
  History, 
  Settings as SettingsIcon, 
  Copy, 
  Trash2,
  X,
  Loader2,
  Bot
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const TEMPLATES = [
  { 
    id: 'customer_service', 
    name: 'Customer Service', 
    prompt: 'You are a helpful customer service AI. Your goal is to provide excellent support, answer questions accurately, and be polite. If you cannot help, kindly inform the user that a human agent will assist them soon.' 
  }
];

export default function AgentsPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newAgent, setNewAgent] = useState({
    name: '',
    templateId: 'customer_service'
  });

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bot');
      if (res.ok) {
        const data = await res.json();
        setAgents(data || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgent.name.trim()) return;

    setIsCreating(true);
    const template = TEMPLATES.find(t => t.id === newAgent.templateId);
    
    try {
      const res = await fetch('/api/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newAgent.name,
          system_prompt: template?.prompt || '',
          transfer_condition: 'User asks for a human, professional help, or expresses deep frustration.',
          stop_ai_after_handoff: true,
          silent_handoff: false
        }),
      });

      if (res.ok) {
        const created = await res.json();
        setAgents([created, ...agents]);
        setIsModalOpen(false);
        setNewAgent({ name: '', templateId: 'customer_service' });
      }
    } finally {
      setIsCreating(false);
    }
  };

  const deleteAgent = async (id: string) => {
      // For now just local delete logic to keep it fast, 
      // but in real app would need DELETE API
      if (confirm('Are you sure you want to delete this agent?')) {
          setAgents(agents.filter(a => a.id !== id));
      }
  };

  return (
    <LayoutShell>
      <div className="max-w-[1000px] mx-auto py-16 px-6 font-sans">
        <header className="text-center mb-12">
            <h1 className="text-3xl font-bold text-main tracking-tight">AI Agents</h1>
            <p className="text-sm text-muted-app mt-3 max-w-lg mx-auto leading-relaxed">
              This is the page where you can revisit the AI agents you created earlier. 
              Feel free to make changes and create as many chatbots as you want anytime!
            </p>
        </header>

        {/* Search & Actions */}
        <div className="flex justify-center items-center gap-2 mb-12">
           <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app w-4 h-4" />
              <input 
                type="text" 
                placeholder="Search AI agents..." 
                className="w-full bg-card-app border border-app rounded-full px-10 py-2.5 text-sm focus:border-blue-500/50 outline-none transition-all shadow-sm text-main"
              />
           </div>
           <button onClick={fetchAgents} className="p-2.5 bg-card-app border border-app rounded-lg hover:bg-muted text-muted-app transition-colors shadow-sm focus:rotate-180">
              <History className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
           </button>
        </div>

        {/* Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* List Agent Cards */}
          <AnimatePresence>
            {agents.map((agent) => (
                <motion.div 
                    key={agent.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    whileHover={{ y: -5 }}
                    className="bg-card-app border border-app rounded-[2rem] p-8 flex flex-col items-center shadow-sm hover:shadow-xl hover:shadow-gray-200/20 dark:hover:shadow-none transition-all"
                >
                <h3 className="font-bold text-main mb-6 text-lg tracking-tight truncate w-full text-center">{agent.name}</h3>
                
                <div className="w-16 h-16 rounded-full bg-muted-foreground/10 flex items-center justify-center mb-8 border-2 border-app shadow-inner">
                    <span className="text-xl font-bold text-muted-app">{agent.name.substring(0, 2).toUpperCase()}</span>
                </div>

                <div className="flex items-center gap-2 w-full mt-auto">
                    <button 
                        onClick={() => window.location.href = `/settings?id=${agent.id}`}
                        className="flex-1 px-4 py-2 bg-card-app border border-app rounded-lg text-xs font-bold text-main hover:bg-muted flex items-center justify-center gap-2 transition-all"
                    >
                        <SettingsIcon className="w-3.5 h-3.5" />
                        Settings
                    </button>
                    <button className="p-2 bg-card-app border border-app rounded-lg text-blue-500 hover:bg-blue-50 transition-all">
                        <Copy className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => deleteAgent(agent.id)}
                        className="p-2 bg-card-app border border-app rounded-lg text-red-500 hover:bg-red-50 transition-all"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
                </motion.div>
            ))}
          </AnimatePresence>

          {/* Create New Card (Moved to end) */}
          <motion.button 
            whileHover={{ y: -5 }}
            onClick={() => setIsModalOpen(true)}
            className="flex flex-col items-center justify-center bg-blue-600 rounded-[2rem] p-8 text-white shadow-xl shadow-blue-600/20 hover:bg-blue-700 transition-all group min-h-[300px]"
          >
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Plus className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold text-lg">Create New</span>
          </motion.button>
        </div>
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-card-app border border-app w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl relative z-10 overflow-hidden"
            >
              <div className="flex justify-between items-center mb-8">
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                        <Bot className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-main">New AI Agent</h2>
                        <p className="text-xs text-muted-app">Configure your agent&apos;s soul</p>
                    </div>
                 </div>
                 <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-muted rounded-full text-muted-app">
                    <X className="w-5 h-5" />
                 </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-app uppercase tracking-widest pl-1">Agent Name</label>
                  <input 
                    autoFocus
                    required
                    type="text"
                    value={newAgent.name}
                    onChange={(e) => setNewAgent({...newAgent, name: e.target.value})}
                    placeholder="e.g. Sales Assistant"
                    className="w-full bg-muted border border-transparent rounded-2xl px-5 py-3 text-sm focus:bg-card-app focus:border-blue-500/50 outline-none transition-all text-main"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-app uppercase tracking-widest pl-1">Template</label>
                  <select 
                    value={newAgent.templateId}
                    onChange={(e) => setNewAgent({...newAgent, templateId: e.target.value})}
                    className="w-full bg-muted border border-transparent rounded-2xl px-5 py-3 text-sm outline-none focus:bg-card-app focus:border-blue-500/50 transition-all text-main appearance-none cursor-pointer"
                  >
                    {TEMPLATES.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                    <option disabled>Helpdesk (Coming Soon)</option>
                    <option disabled>Sales (Coming Soon)</option>
                  </select>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-3 border border-app rounded-2xl text-sm font-bold text-muted-app hover:bg-muted transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isCreating || !newAgent.name}
                    className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all"
                  >
                    {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Create Agent
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </LayoutShell>
  );
}
