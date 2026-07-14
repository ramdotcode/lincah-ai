'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import LayoutShell from '@/components/LayoutShell';
import { 
  ChevronLeft, 
  Settings, 
  BookOpen, 
  Share2, 
  RefreshCw, 
  Play, 
  Save,
  Loader2,
  MoreVertical,
  MessageSquare,
  Clock,
  Sparkles,
  Zap,
  HandMetal,
  Tag,
  Kanban,
  Cpu
} from 'lucide-react';
import { motion } from 'framer-motion';
import KnowledgeSources from '@/components/KnowledgeSources';
import OrchestrationCanvas from '@/components/OrchestrationCanvas';
import BotTools from '@/components/BotTools';
import PipelineStages from '@/components/PipelineStages';
import { DEFAULT_STAGES, PipelineStageDef } from '@/lib/stageConstants';

function SettingsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const botId = searchParams.get('id');
  
  const [activeTab, setActiveTab] = useState('General');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [bot, setBot] = useState<any>(null);
  const [stages, setStages] = useState<PipelineStageDef[]>(DEFAULT_STAGES);
  const [labels, setLabels] = useState<Array<{ id: string; name: string; color: string }>>([]);

  // State for Simulator
  const [testMessage, setTestMessage] = useState('');
  const [isTestLoading, setIsTestLoading] = useState(false);
  const [handoffOccurred, setHandoffOccurred] = useState(false);
  const [chatHistory, setChatHistory] = useState([
    { role: 'assistant', content: 'Hi! I am your AI assistant. How can I help you today?' }
  ]);

  const fetchBot = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bot`);
      if (res.ok) {
        const dataArray = await res.json();
        const found = Array.isArray(dataArray) 
            ? dataArray.find((b: any) => b.id === botId) 
            : dataArray;
        setBot(found);
        
        // If bot has a welcome message, update history
        if (found?.welcome_message) {
            setChatHistory([{ role: 'assistant', content: found.welcome_message }]);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (botId) fetchBot();
  }, [botId]);

  // Stage pipeline akun (Fase 7) — level akun, dipakai tab Pipeline & selector Followups
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/pipeline-stages');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length) setStages(data);
        }
      } catch { /* pakai default */ }
    })();
    // Label akun (Fase 8) — untuk trigger follow-up by label
    (async () => {
      try {
        const res = await fetch('/api/labels');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setLabels(data);
        }
      } catch { /* label belum ada */ }
    })();
  }, []);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!testMessage.trim() || isTestLoading || (handoffOccurred && bot.stop_ai_after_handoff)) return;

    const userMsg = testMessage;
    setTestMessage('');
    const newHistory = [...chatHistory, { role: 'user', content: userMsg }];
    setChatHistory(newHistory as any);
    setIsTestLoading(true);

    try {
        const res = await fetch('/api/ai/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                botId: bot.id,
                systemPrompt: bot.system_prompt,
                history: chatHistory.slice(-5), // Only last 5 messages for context
                message: userMsg,
                transferCondition: bot.transfer_condition,
                aiModel: bot.ai_model || 'groq'
            })
        });

        if (res.ok) {
            const { aiResponse, handoffTriggered } = await res.json();
            
            if (handoffTriggered) {
                setHandoffOccurred(true);
            }

            setChatHistory(prev => [
                ...prev, 
                { 
                    role: 'assistant', 
                    content: handoffTriggered 
                        ? `🚨 [HANDOFF TRIGGERED]\n\n${aiResponse}` 
                        : aiResponse 
                }
            ] as any);
        } else {
            const { error } = await res.json().catch(() => ({ error: null }));
            setChatHistory(prev => [
                ...prev,
                { role: 'assistant', content: `⚠️ Gagal memproses pesan${error ? `: ${error}` : ''}. Coba lagi ya.` }
            ] as any);
        }
    } catch {
        setChatHistory(prev => [
            ...prev,
            { role: 'assistant', content: '⚠️ Tidak bisa terhubung ke server. Cek koneksi lalu coba lagi.' }
        ] as any);
    } finally {
        setIsTestLoading(false);
    }
  };

  const handleResetChat = () => {
    if (bot?.welcome_message) {
        setChatHistory([{ role: 'assistant', content: bot.welcome_message }]);
    } else {
        setChatHistory([{ role: 'assistant', content: 'Hi! I am your AI assistant. How can I help you today?' }]);
    }
    setTestMessage('');
    setHandoffOccurred(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bot),
      });
      if (res.ok) {
        const updatedBot = await res.json();
        setBot(updatedBot);
        
        // Proper React feedback
        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );

  if (!bot) return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-muted-app font-medium">Bot not found or select an agent first.</p>
        <button onClick={() => router.push('/agents')} className="text-blue-500 font-bold hover:underline">Back to Agents</button>
    </div>
  );

  const tabs = [
    { name: 'General', icon: Settings },
    { name: 'Knowledge Sources', icon: BookOpen },
    { name: 'Integrations', icon: Share2 },
    { name: 'Pipeline', icon: Kanban },
    { name: 'Followups', icon: Clock },
    { name: 'Evaluation', icon: MessageSquare },
    { name: 'Orchestration', icon: Sparkles },
  ];

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950 transition-colors">
      {/* Sub Header */}
      <div className="px-6 py-3 border-b border-app flex items-center justify-between bg-white dark:bg-zinc-950 z-20">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push('/agents')}
            className="flex items-center gap-1 text-[11px] font-bold text-muted-app hover:text-main px-2.5 py-1.5 border border-app rounded-lg transition-all bg-card-app shadow-sm"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <div className="flex flex-col">
              <h1 className="text-sm font-bold text-main leading-none">{bot.name}</h1>
              <span className="text-[10px] text-muted-app font-medium">Draft Bot</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
            <button 
                id="save-btn"
                onClick={handleSave}
                disabled={saving || showSaved}
                className={`px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg w-[140px] justify-center ${
                    showSaved ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20'
                } disabled:bg-blue-300`}
            >
                {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : showSaved ? (
                    '✓ Saved!'
                ) : (
                    <>
                        <Save className="w-3.5 h-3.5" />
                        Save Changes
                    </>
                )}
            </button>
            <button className="p-2 hover:bg-muted border border-app rounded-xl text-muted-app">
                <MoreVertical className="w-4 h-4" />
            </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex justify-center border-b border-app bg-white dark:bg-zinc-950 overflow-x-auto no-scrollbar">
        <div className="flex gap-8 px-6">
            {tabs.map((tab) => (
                <button
                    key={tab.name}
                    onClick={() => setActiveTab(tab.name)}
                    className={`flex items-center gap-2 py-4 px-2 text-xs font-bold transition-all relative whitespace-nowrap ${
                        activeTab === tab.name ? 'text-blue-600' : 'text-muted-app hover:text-main'
                    }`}
                >
                    <tab.icon className="w-4 h-4" />
                    {tab.name}
                    {activeTab === tab.name && (
                        <motion.div layoutId="tabUnderline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                    )}
                </button>
            ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Editor */}
        {activeTab === 'General' ? (
        <div className="flex-1 overflow-y-auto p-12 bg-[#fcfcfc] dark:bg-zinc-950/50">
            <div className="max-w-2xl mx-auto space-y-16">
                {/* behavior header */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-cyan-500">
                        <Sparkles className="w-4 h-4" />
                        <h3 className="font-bold text-sm uppercase tracking-wider">AI Agent Behavior</h3>
                    </div>
                    <p className="text-xs text-muted-app">This is the AI Prompt that defines the AI&apos;s speaking style and identity.</p>
                    <div className="relative">
                        <textarea 
                            value={bot.system_prompt}
                            onChange={(e) => setBot({...bot, system_prompt: e.target.value})}
                            className="w-full min-h-[250px] bg-white dark:bg-zinc-900 border border-app rounded-2xl p-6 text-sm text-main focus:border-cyan-400 outline-none transition-all shadow-sm leading-relaxed"
                            placeholder="You are a helpful customer service assistant..."
                        />
                        <div className="absolute bottom-4 right-6 text-[10px] text-muted-app font-bold">
                            {bot.system_prompt?.length || 0} / 15000
                        </div>
                    </div>
                </div>

                {/* Welcome Message */}
                <div className="space-y-4">
                    <h3 className="text-main font-bold text-sm flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-blue-500" />
                        Welcome Message 
                    </h3>
                    <textarea 
                        rows={2}
                        value={bot.welcome_message || ''}
                        onChange={(e) => setBot({...bot, welcome_message: e.target.value})}
                        placeholder="Hi! How can I help you today?"
                        className="w-full bg-white dark:bg-zinc-900 border border-app rounded-2xl p-4 text-sm text-main focus:border-blue-400 outline-none transition-all shadow-sm"
                    />
                </div>

                {/* Agent Transfer Conditions */}
                <div className="space-y-4">
                    <div className="flex flex-col gap-1">
                        <h3 className="text-main font-bold text-sm flex items-center gap-2">
                            <HandMetal className="w-4 h-4 text-amber-500" />
                            Agent Transfer Conditions
                        </h3>
                        <p className="text-[11px] text-muted-app leading-relaxed">
                            Define conditions that trigger the AI to transfer the chat to a human agent. 
                            Chat status will become <span className="font-bold text-amber-600">Pending</span> and appear in the Assigned folder.
                        </p>
                    </div>
                    <textarea 
                        rows={3}
                        value={bot.transfer_condition}
                        onChange={(e) => setBot({...bot, transfer_condition: e.target.value})}
                        placeholder="User asks for human help, expresses frustration, or talks about complex issues..."
                        className="w-full bg-white dark:bg-zinc-900 border border-app rounded-2xl p-4 text-sm text-main focus:border-amber-400 outline-none transition-all shadow-sm"
                    />
                </div>

                {/* Toggles Group */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-card-app border border-app p-6 rounded-[2rem] flex flex-col gap-4 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Zap className="w-4 h-4 text-purple-500" />
                                <span className="text-xs font-bold text-main">Stop AI after Handoff</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" 
                                    className="sr-only peer" 
                                    checked={bot.stop_ai_after_handoff} 
                                    onChange={(e) => setBot({...bot, stop_ai_after_handoff: e.target.checked})} 
                                />
                                <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>
                        <p className="text-[10px] text-muted-app leading-relaxed">
                            Stop the AI from sending messages after the chat status changes to Pending.
                        </p>
                    </div>

                    <div className="bg-card-app border border-app p-6 rounded-[2rem] flex flex-col gap-4 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <RefreshCw className="w-4 h-4 text-emerald-500" />
                                <span className="text-xs font-bold text-main">Silent Agent Handoff</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" 
                                    className="sr-only peer" 
                                    checked={bot.silent_handoff} 
                                    onChange={(e) => setBot({...bot, silent_handoff: e.target.checked})} 
                                />
                                <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>
                        <p className="text-[10px] text-muted-app leading-relaxed">
                            AI silently transfers the conversation to an agent with no further AI replies.
                        </p>
                    </div>
                </div>

                {/* AI Actions Section */}
                <div className="space-y-6">
                    <h3 className="text-main font-bold text-sm flex items-center gap-2">
                        <Zap className="w-4 h-4 text-orange-500" />
                        AI Actions
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest pl-1">Change Conversation Label</label>
                            <select className="w-full bg-card-app border border-app rounded-xl px-4 py-2.5 text-xs outline-none focus:border-blue-500/50 appearance-none cursor-pointer">
                                <option>No Change</option>
                                <option>Priority</option>
                                <option>Sales Lead</option>
                                <option>Support</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest pl-1">Change Pipeline Status</label>
                            <select className="w-full bg-card-app border border-app rounded-xl px-4 py-2.5 text-xs outline-none focus:border-blue-500/50 appearance-none cursor-pointer">
                                <option>No Change</option>
                                <option>New Lead</option>
                                <option>Qualifying</option>
                                <option>Closed Won</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* AI Model Selection */}
                <div className="space-y-6 pt-10 border-t border-app">
                    <h3 className="text-main font-bold text-sm flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-zinc-500" />
                        AI Model Settings
                    </h3>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <button 
                            onClick={() => setBot({...bot, ai_model: 'groq'})}
                            className={`p-6 rounded-[2rem] border-2 text-left transition-all ${
                            !['deepseek', 'zai', 'nvidia'].includes(bot.ai_model)
                            ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-900/10'
                            : 'border-app bg-card-app hover:border-gray-300'
                        }`}>
                            <div className="flex justify-between items-start mb-4">
                                <span className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-xl text-blue-600">
                                    <Zap className="w-4 h-4" />
                                </span>
                                {!['deepseek', 'zai', 'nvidia'].includes(bot.ai_model) && <div className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center">
                                    <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                                </div>}
                            </div>
                            <h4 className="text-sm font-bold text-main">Groq</h4>
                            <p className="text-[10px] text-muted-app mt-1">Llama 3.3 70B · tercepat (±2 dtk)</p>
                        </button>

                        <button 
                            onClick={() => setBot({...bot, ai_model: 'deepseek'})}
                            className={`p-6 rounded-[2rem] border-2 text-left transition-all ${
                            bot.ai_model === 'deepseek' 
                            ? 'border-purple-600 bg-purple-50/50 dark:bg-purple-900/10' 
                            : 'border-app bg-card-app hover:border-gray-300'
                        }`}>
                            <div className="flex justify-between items-start mb-4">
                                <span className="p-2 bg-purple-100 dark:bg-purple-900/40 rounded-xl text-purple-600">
                                    <Sparkles className="w-4 h-4" />
                                </span>
                                {bot.ai_model === 'deepseek' && <div className="w-4 h-4 rounded-full bg-purple-600 flex items-center justify-center">
                                    <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                                </div>}
                            </div>
                            <h4 className="text-sm font-bold text-main">DeepSeek</h4>
                            <p className="text-[10px] text-muted-app mt-1">v4 Flash · reasoning, lambat (±10 dtk)</p>
                        </button>

                        <button 
                            onClick={() => setBot({...bot, ai_model: 'zai'})}
                            className={`p-6 rounded-[2rem] border-2 text-left transition-all ${
                            bot.ai_model === 'zai' 
                            ? 'border-orange-600 bg-orange-50/50 dark:bg-orange-900/10' 
                            : 'border-app bg-card-app hover:border-gray-300'
                        }`}>
                            <div className="flex justify-between items-start mb-4">
                                <span className="p-2 bg-orange-100 dark:bg-orange-900/40 rounded-xl text-orange-600">
                                    <Zap className="w-4 h-4" />
                                </span>
                                {bot.ai_model === 'zai' && <div className="w-4 h-4 rounded-full bg-orange-600 flex items-center justify-center">
                                    <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                                </div>}
                            </div>
                            <h4 className="text-sm font-bold text-main">Z.AI</h4>
                            <p className="text-[10px] text-muted-app mt-1">GLM 5.2 · seimbang (±5 dtk)</p>
                        </button>

                        <button 
                            onClick={() => setBot({...bot, ai_model: 'nvidia'})}
                            className={`p-6 rounded-[2rem] border-2 text-left transition-all ${
                            bot.ai_model === 'nvidia' 
                            ? 'border-green-600 bg-green-50/50 dark:bg-green-900/10' 
                            : 'border-app bg-card-app hover:border-gray-300'
                        }`}>
                            <div className="flex justify-between items-start mb-4">
                                <span className="p-2 bg-green-100 dark:bg-green-900/40 rounded-xl text-green-600">
                                    <Zap className="w-4 h-4" />
                                </span>
                                {bot.ai_model === 'nvidia' && <div className="w-4 h-4 rounded-full bg-green-600 flex items-center justify-center">
                                    <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                                </div>}
                            </div>
                            <h4 className="text-sm font-bold text-main">Nvidia</h4>
                            <p className="text-[10px] text-muted-app mt-1">Nemotron 550B · paling pintar (±5-15 dtk)</p>
                        </button>
                    </div>
                </div>
                
                <div className="h-20" />
            </div>
        </div>
        ) : activeTab === 'Knowledge Sources' ? (
          <div className="flex-1 overflow-hidden">
            <KnowledgeSources botId={botId as string} />
          </div>
        ) : activeTab === 'Integrations' ? (
          <div className="flex-1 overflow-y-auto p-12 bg-[#fcfcfc] dark:bg-zinc-950/50">
            <div className="max-w-2xl mx-auto space-y-8">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
                  <Share2 className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-main">Connected Apps</h2>
                  <p className="text-xs text-muted-app">
                    Sambungkan chatbot dengan aplikasi untuk memperluas kemampuannya.
                    Koneksi channel (WhatsApp, widget) pindah ke halaman <span className="font-bold">Connected Platforms</span> di sidebar.
                  </p>
                </div>
              </div>
              <BotTools
                botId={bot.id}
                toolsEnabled={!!bot.tools_enabled}
                onToggleTools={(enabled) => setBot({ ...bot, tools_enabled: enabled })}
              />
            </div>
          </div>
        ) : activeTab === 'Pipeline' ? (
          <div className="flex-1 overflow-y-auto p-12 bg-[#fcfcfc] dark:bg-zinc-950/50">
            <PipelineStages stages={stages} onChange={setStages} />
          </div>
        ) : activeTab === 'Followups' ? (
          <div className="flex-1 overflow-y-auto p-12 bg-[#fcfcfc] dark:bg-zinc-950/50">
            <div className="max-w-2xl mx-auto space-y-12">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center">
                  <Clock className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-main">Auto Follow-up</h3>
                  <p className="text-[11px] text-muted-app">Kirim pesan otomatis ke lead yang tidak membalas. Simpan dengan tombol Save Changes.</p>
                </div>
              </div>

              {/* Toggle on/off */}
              <div className="bg-card-app border border-app p-6 rounded-[2rem] flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <div>
                    <span className="text-xs font-bold text-main block">Aktifkan Auto Follow-up</span>
                    <span className="text-[10px] text-muted-app">Follow-up dikirim oleh scheduler tiap ±20 menit.</span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox"
                    className="sr-only peer"
                    checked={!!bot.followup_enabled}
                    onChange={(e) => setBot({...bot, followup_enabled: e.target.checked})}
                  />
                  <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* Mode pesan: Template statis vs AI-kontekstual */}
              <div className="space-y-3">
                <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest pl-1">Mode pesan follow-up</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { key: 'template', title: 'Template', desc: 'Pesan tetap dengan placeholder {nama}. Cepat & hemat.' },
                    { key: 'ai', title: 'AI Kontekstual', desc: 'AI menyusun pesan dari isi percakapan tiap lead. Lebih relevan.' },
                  ].map((m) => {
                    const active = (bot.followup_mode || 'template') === m.key;
                    return (
                      <button key={m.key}
                        onClick={() => setBot({ ...bot, followup_mode: m.key })}
                        className={`text-left p-4 rounded-2xl border-2 transition-all ${
                          active
                            ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-900/10'
                            : 'border-app bg-card-app hover:border-gray-300'
                        }`}
                      >
                        <span className={`text-xs font-bold block ${active ? 'text-blue-600' : 'text-main'}`}>{m.title}</span>
                        <span className="text-[10px] text-muted-app">{m.desc}</span>
                      </button>
                    );
                  })}
                </div>
                {(bot.followup_mode || 'template') === 'ai' && (
                  <p className="text-[10px] text-muted-app pl-1">
                    AI membaca riwayat chat & mengikuti persona bot. Template di bawah dipakai sebagai <span className="font-bold">cadangan</span> bila AI gagal.
                  </p>
                )}
              </div>

              {bot.whatsapp_enabled && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed">
                  ⚠️ <span className="font-bold">Perhatian untuk bot WhatsApp:</span> follow-up massal menaikkan risiko nomor di-banned oleh WhatsApp.
                  Gunakan delay panjang, batasi jumlah, dan pantau kesehatan sesi secara berkala.
                </div>
              )}

              {/* Delay, max count, WA limit */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest pl-1">Delay (jam)</label>
                  <input type="number" min={1}
                    value={bot.followup_delay_hours ?? 24}
                    onChange={(e) => setBot({...bot, followup_delay_hours: parseInt(e.target.value) || 24})}
                    className="w-full bg-card-app border border-app rounded-xl px-4 py-2.5 text-xs outline-none focus:border-blue-500/50 text-main"
                  />
                  <p className="text-[10px] text-muted-app pl-1">Jeda sejak pesan terakhir pelanggan.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest pl-1">Maks. follow-up</label>
                  <input type="number" min={1} max={10}
                    value={bot.followup_max_count ?? 2}
                    onChange={(e) => setBot({...bot, followup_max_count: parseInt(e.target.value) || 2})}
                    className="w-full bg-card-app border border-app rounded-xl px-4 py-2.5 text-xs outline-none focus:border-blue-500/50 text-main"
                  />
                  <p className="text-[10px] text-muted-app pl-1">Per lead, seumur percakapan.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest pl-1">Limit WA / jam</label>
                  <input type="number" min={1} max={60}
                    value={bot.followup_wa_hourly_limit ?? 10}
                    onChange={(e) => setBot({...bot, followup_wa_hourly_limit: parseInt(e.target.value) || 10})}
                    className="w-full bg-card-app border border-app rounded-xl px-4 py-2.5 text-xs outline-none focus:border-blue-500/50 text-main"
                  />
                  <p className="text-[10px] text-muted-app pl-1">Maks. follow-up WhatsApp per jam.</p>
                </div>
              </div>

              {/* Stage selection */}
              <div className="space-y-3">
                <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest pl-1">Stage yang di-follow-up</label>
                <div className="flex flex-wrap gap-2">
                  {stages.filter(s => s.type === 'open').map((stage) => {
                    const selected = (bot.followup_stages || ['interested', 'negotiating']).includes(stage.key);
                    return (
                      <button key={stage.key}
                        onClick={() => {
                          const current = bot.followup_stages || ['interested', 'negotiating'];
                          setBot({
                            ...bot,
                            followup_stages: selected
                              ? current.filter((s: string) => s !== stage.key)
                              : [...current, stage.key],
                          });
                        }}
                        className={`px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all ${
                          selected
                            ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-900/10 text-blue-600'
                            : 'border-app bg-card-app text-muted-app hover:border-gray-300'
                        }`}
                      >
                        {stage.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-app pl-1">Stage tipe Menang/Kalah tidak pernah di-follow-up.</p>
              </div>

              {/* Trigger by label (Fase 8) */}
              {labels.length > 0 && (
                <div className="space-y-3">
                  <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest pl-1">Trigger tambahan by label</label>
                  <div className="flex flex-wrap gap-2">
                    {labels.map((label) => {
                      const selected = (bot.followup_label_ids || []).includes(label.id);
                      return (
                        <button key={label.id}
                          onClick={() => {
                            const current: string[] = bot.followup_label_ids || [];
                            setBot({
                              ...bot,
                              followup_label_ids: selected
                                ? current.filter((id) => id !== label.id)
                                : [...current, label.id],
                            });
                          }}
                          className={`px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all ${
                            selected
                              ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-900/10 text-blue-600'
                              : 'border-app bg-card-app text-muted-app hover:border-gray-300'
                          }`}
                        >
                          {label.name}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-app pl-1">Percakapan dengan label ini ikut di-follow-up walau stage-nya di luar daftar di atas.</p>
                </div>
              )}

              {/* Template editor + preview */}
              <div className="space-y-3">
                <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest pl-1">
                  {(bot.followup_mode || 'template') === 'ai' ? 'Template cadangan' : 'Template pesan'}
                </label>
                <textarea
                  rows={3}
                  value={bot.followup_template || ''}
                  onChange={(e) => setBot({...bot, followup_template: e.target.value})}
                  placeholder="Halo {nama}, sekadar menindaklanjuti percakapan kita sebelumnya. Apakah masih ada yang bisa kami bantu? 😊"
                  className="w-full bg-white dark:bg-zinc-900 border border-app rounded-2xl p-4 text-sm text-main focus:border-amber-400 outline-none transition-all shadow-sm"
                />
                <p className="text-[10px] text-muted-app pl-1">Gunakan <span className="font-mono font-bold">{'{nama}'}</span> untuk menyisipkan nama kontak.</p>
                <div className="bg-card-app border border-app rounded-2xl p-4">
                  <p className="text-[10px] uppercase font-bold text-muted-app tracking-widest mb-2">Preview</p>
                  <div className="bg-white dark:bg-zinc-800 border border-app px-4 py-3 rounded-2xl text-[12px] text-main shadow-sm inline-block">
                    {(bot.followup_template?.trim() || 'Halo {nama}, sekadar menindaklanjuti percakapan kita sebelumnya. Apakah masih ada yang bisa kami bantu? 😊').replaceAll('{nama}', 'Budi')}
                  </div>
                </div>
              </div>

              <div className="h-20" />
            </div>
          </div>
        ) : activeTab === 'Orchestration' ? (
          <div className="flex-1 overflow-hidden p-8 bg-[#fcfcfc] dark:bg-zinc-950/50">
            <OrchestrationCanvas botId={bot.id} />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-[#fcfcfc] dark:bg-zinc-950/50">
            <div className="text-center">
              <h3 className="text-lg font-bold text-main mb-2">{activeTab}</h3>
              <p className="text-sm text-muted-app">This feature is coming soon.</p>
            </div>
          </div>
        )}

        {/* Right Side: Simulator */}
        <div className="w-[450px] border-l border-app bg-white dark:bg-zinc-950 flex flex-col p-6 overflow-hidden hidden xl:flex">
            <div className="bg-[#f9fafb] dark:bg-zinc-900/50 border border-app rounded-[2.5rem] flex-1 flex flex-col overflow-hidden shadow-2xl">
                <div className="p-5 border-b border-app flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-[10px]">
                            {bot.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-main leading-tight">{bot.name}</span>
                            <span className="text-[9px] text-muted-app flex items-center gap-1">
                                <div className="w-1 h-1 bg-emerald-500 rounded-full"></div>
                                Simulator Active
                            </span>
                        </div>
                    </div>
                    <button 
                        onClick={handleResetChat}
                        title="Reset Chat"
                        className="p-2 hover:bg-muted rounded-xl text-muted-app active:rotate-180 transition-transform duration-500"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4 no-scrollbar">
                    {chatHistory.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-[12px] leading-relaxed relative group ${
                                msg.role === 'user' 
                                ? 'bg-blue-600 text-white shadow-lg' 
                                : msg.content.includes('[HANDOFF TRIGGERED]')
                                    ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                                    : 'bg-white dark:bg-zinc-800 border border-app text-main shadow-sm'
                            }`}>
                                {msg.content}
                            </div>
                        </div>
                    ))}
                    {isTestLoading && (
                        <div className="flex justify-start">
                            <div className="bg-white dark:bg-zinc-800 border border-app px-4 py-3 rounded-2xl shadow-sm">
                                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                            </div>
                        </div>
                    )}
                </div>

                <form onSubmit={handleSendMessage} className="p-5 bg-white dark:bg-zinc-900 border-t border-app">
                    <div className="relative">
                        <input 
                            type="text"
                            value={testMessage}
                            onChange={(e) => setTestMessage(e.target.value)}
                            disabled={isTestLoading || (handoffOccurred && bot.stop_ai_after_handoff)}
                            placeholder={handoffOccurred && bot.stop_ai_after_handoff ? "Bot Stopped (Handoff Mode)" : "Test your agent's behavior..."}
                            className={`w-full bg-muted dark:bg-zinc-800 border border-transparent rounded-2xl px-5 py-3 text-[12px] outline-none focus:border-blue-500/50 text-main transition-all pr-12 ${
                                handoffOccurred && bot.stop_ai_after_handoff ? 'opacity-50 cursor-not-allowed italic' : ''
                            }`}
                        />
                        <button 
                            type="submit"
                            disabled={isTestLoading || (handoffOccurred && bot.stop_ai_after_handoff)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center text-white hover:bg-blue-700 transition-all shadow-md disabled:bg-gray-400"
                        >
                            <Play className="w-3 h-3 fill-current" />
                        </button>
                    </div>
                    {handoffOccurred && bot.stop_ai_after_handoff && (
                        <div className="mt-2 text-[10px] text-amber-600 font-bold text-center">
                            AI is now offline. Press reset to test again.
                        </div>
                    )}
                </form>
            </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <LayoutShell>
      <Suspense fallback={<div className="p-8">Loading settings...</div>}>
        <SettingsContent />
      </Suspense>
    </LayoutShell>
  );
}
