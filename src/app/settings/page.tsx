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
import { motion, AnimatePresence } from 'framer-motion';
import KnowledgeSources from '@/components/KnowledgeSources';
import WhatsAppStatus from '@/components/WhatsAppStatus';

function SettingsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const botId = searchParams.get('id');
  
  const [activeTab, setActiveTab] = useState('General');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [bot, setBot] = useState<any>(null);
  
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
                aiModel: bot.ai_model || 'standard'
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
        }
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <div className="grid grid-cols-2 gap-4">
                        <button 
                            onClick={() => setBot({...bot, ai_model: 'standard'})}
                            className={`p-6 rounded-[2rem] border-2 text-left transition-all ${
                            (bot.ai_model || 'standard') === 'standard' 
                            ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-900/10' 
                            : 'border-app bg-card-app hover:border-gray-300'
                        }`}>
                            <div className="flex justify-between items-start mb-4">
                                <span className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-xl text-blue-600">
                                    <Zap className="w-4 h-4" />
                                </span>
                                {(bot.ai_model || 'standard') === 'standard' && <div className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center">
                                    <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                                </div>}
                            </div>
                            <h4 className="text-sm font-bold text-main">Standard</h4>
                            <p className="text-[10px] text-muted-app mt-1">Llama 3.1 - Fast & Efficient</p>
                        </button>

                        <button 
                            onClick={() => setBot({...bot, ai_model: 'advance'})}
                            className={`p-6 rounded-[2rem] border-2 text-left transition-all ${
                            bot.ai_model === 'advance' 
                            ? 'border-purple-600 bg-purple-50/50 dark:bg-purple-900/10' 
                            : 'border-app bg-card-app hover:border-gray-300'
                        }`}>
                            <div className="flex justify-between items-start mb-4">
                                <span className="p-2 bg-purple-100 dark:bg-purple-900/40 rounded-xl text-purple-600">
                                    <Sparkles className="w-4 h-4" />
                                </span>
                                {bot.ai_model === 'advance' && <div className="w-4 h-4 rounded-full bg-purple-600 flex items-center justify-center">
                                    <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                                </div>}
                            </div>
                            <h4 className="text-sm font-bold text-main">Advance</h4>
                            <p className="text-[10px] text-muted-app mt-1">Llama 3.3 - Smart & Reasoning</p>
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
            <div className="max-w-2xl mx-auto space-y-12">
              <div className="flex items-center gap-3 mb-8">
                 <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
                    <Share2 className="w-6 h-6 text-emerald-600" />
                 </div>
                 <div>
                    <h2 className="text-xl font-bold text-main">Integrations</h2>
                    <p className="text-xs text-muted-app">Connect your AI agent to external platforms.</p>
                 </div>
              </div>

              {/* WhatsApp Section */}
              <div className="bg-card-app border border-app rounded-[2.5rem] p-8 space-y-8 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#25D366]/10 rounded-full flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="w-6 h-6 fill-[#25D366]"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 .004 5.412 0 12.048c0 2.123.554 4.197 1.608 6.037L0 24l6.117-1.605a11.803 11.803 0 005.925 1.586h.005c6.637 0 12.05-5.414 12.05-12.051 0-3.213-1.25-6.232-3.522-8.504z"/></svg>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-main">WhatsApp</h4>
                      <p className="text-[11px] text-muted-app">Connect this bot to WhatsApp.</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" 
                      className="sr-only peer" 
                      checked={bot.whatsapp_enabled || false} 
                      onChange={(e) => setBot({...bot, whatsapp_enabled: e.target.checked})} 
                    />
                    <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                <AnimatePresence>
                  {bot.whatsapp_enabled && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden space-y-6 pt-4 border-t border-app"
                    >
                      <div className="space-y-6">
                        <div className="space-y-4">
                          <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest px-1">Integration Type</label>
                          <div className="grid grid-cols-2 gap-4">
                            <button 
                              onClick={() => setBot({...bot, whatsapp_bot_type: 'baileys'})}
                              className={`p-4 rounded-2xl border-2 text-left transition-all ${
                                (bot.whatsapp_bot_type || 'baileys') === 'baileys' 
                                ? 'border-emerald-500 bg-emerald-50/50' 
                                : 'border-app bg-white dark:bg-zinc-900'
                              }`}>
                              <p className="text-xs font-bold text-main">Local Baileys</p>
                              <p className="text-[9px] text-muted-app mt-1">Connect via QR Scan (Local Terminal)</p>
                            </button>
                            <button 
                              onClick={() => setBot({...bot, whatsapp_bot_type: 'official'})}
                              className={`p-4 rounded-2xl border-2 text-left transition-all ${
                                bot.whatsapp_bot_type === 'official' 
                                ? 'border-blue-500 bg-blue-50/50' 
                                : 'border-app bg-white dark:bg-zinc-900'
                              }`}>
                              <p className="text-xs font-bold text-main">Meta Official</p>
                              <p className="text-[9px] text-muted-app mt-1">Cloud API (Ready for Scale)</p>
                            </button>
                          </div>
                        </div>

                        {/* Live Status for Baileys */}
                        {(bot.whatsapp_bot_type || 'baileys') === 'baileys' && bot.id && (
                          <div className="pt-4 animate-in fade-in slide-in-from-top-4 duration-500">
                            <WhatsAppStatus botId={bot.id} />
                          </div>
                        )}

                        <div className="space-y-4">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest px-1">WhatsApp Phone Number</label>
                            <input 
                              type="text" 
                              placeholder="e.g. 628123456789"
                              value={bot.whatsapp_phone_number || ''}
                              onChange={(e) => setBot({...bot, whatsapp_phone_number: e.target.value})}
                              className="w-full bg-white dark:bg-zinc-900 border border-app rounded-xl px-4 py-2.5 text-xs text-main outline-none focus:border-emerald-500 shadow-sm"
                            />
                            <p className="text-[10px] text-muted-app px-1 italic">Use international format without &apos;+&apos;.</p>
                          </div>

                          {bot.whatsapp_bot_type === 'official' && (
                            <div className="space-y-4 pt-4 border-t border-app">
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest px-1">Phone Number ID</label>
                                <input 
                                  type="text" 
                                  value={bot.whatsapp_phone_id || ''}
                                  onChange={(e) => setBot({...bot, whatsapp_phone_id: e.target.value})}
                                  className="w-full bg-white dark:bg-zinc-900 border border-app rounded-xl px-4 py-2.5 text-xs text-main outline-none focus:border-blue-500 shadow-sm"
                                />
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] uppercase font-bold text-muted-app tracking-widest px-1">Access Token</label>
                                <input 
                                  type="password" 
                                  value={bot.whatsapp_access_token || ''}
                                  onChange={(e) => setBot({...bot, whatsapp_access_token: e.target.value})}
                                  className="w-full bg-white dark:bg-zinc-900 border border-app rounded-xl px-4 py-2.5 text-xs text-main outline-none focus:border-blue-500 shadow-sm"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Telegram Section (Existing but empty placeholder) */}
              <div className="bg-card-app border border-app rounded-[2.5rem] p-8 opacity-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center">
                        <Share2 className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-main">Telegram</h4>
                        <p className="text-[11px] text-muted-app">Standard Telegram Bot token.</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-muted-app">COMING SOON</span>
                  </div>
              </div>
            </div>
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
