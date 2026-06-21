'use client';

import { useState, useEffect } from 'react';
import { 
  FileText, 
  Globe, 
  Folder, 
  HelpCircle, 
  Package, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Save, 
  Type, 
  Bold, 
  Italic, 
  Image as ImageIcon, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  AlignJustify, 
  Undo, 
  Redo,
  Edit2,
  Search,
  Loader2
} from 'lucide-react';
import { motion } from 'framer-motion';

const SOURCE_TYPES = [
  { id: 'text', label: 'Text', icon: FileText },
  { id: 'website', label: 'Website', icon: Globe },
  { id: 'file', label: 'File', icon: Folder },
  { id: 'qna', label: 'Q&A', icon: HelpCircle },
  { id: 'product', label: 'Product', icon: Package },
];

export default function KnowledgeSources({ botId }: { botId: string }) {
  const [activeSourceType, setActiveSourceType] = useState('text');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (botId) fetchKnowledge();
  }, [botId]);

  const fetchKnowledge = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bot/knowledge?botId=${botId}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data);
        if (data.length > 0) setSelectedItemId(data[0].id);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async () => {
    if (!newItemName.trim()) {
      setIsAdding(true);
      return;
    }
    
    setSaving(true);
    try {
      const res = await fetch('/api/bot/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot_id: botId,
          type: activeSourceType,
          name: newItemName,
          content: ''
        })
      });
      
      if (res.ok) {
        const newItem = await res.json();
        setItems([...items, newItem]);
        setSelectedItemId(newItem.id);
        setNewItemName('');
        setIsAdding(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const selectedItem = items.find(item => item.id === selectedItemId);

  const handleSaveContent = async () => {
    if (!selectedItem) return;
    setSaving(true);
    try {
      await fetch('/api/bot/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedItem)
      });
    } finally {
      setSaving(false);
    }
  };

  const updateContent = (content: string) => {
    setItems(items.map(item => 
      item.id === selectedItemId ? { ...item, content } : item
    ));
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full gap-2 text-muted-app text-sm font-medium">
      <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
      Loading Knowledge...
    </div>
  );

  const renderContent = () => {
    switch (activeSourceType) {
      case 'text':
        return (
          <div className="flex-1 overflow-hidden flex flex-col p-6">
            <div className="border border-app rounded-[1.5rem] bg-white dark:bg-zinc-900 flex-1 flex flex-col shadow-sm overflow-hidden">
              {/* Editor Header / Formatting */}
              <div className="flex items-center gap-1 p-3 border-b border-app bg-[#fcfcfc] dark:bg-zinc-900/50 overflow-x-auto no-scrollbar">
                <div className="flex items-center gap-1 px-2 border-r border-app">
                  <button className="p-1.5 hover:bg-muted rounded text-muted-app transition-colors"><Undo className="w-4 h-4" /></button>
                  <button className="p-1.5 hover:bg-muted rounded text-muted-app transition-colors pr-3"><Redo className="w-4 h-4" /></button>
                </div>
                
                <div className="flex items-center gap-1 px-2 border-r border-app">
                  <button className="p-1.5 hover:bg-muted rounded text-muted-app font-serif font-bold transition-colors"><Bold className="w-4 h-4" /></button>
                  <button className="p-1.5 hover:bg-muted rounded text-muted-app italic transition-colors pr-3"><Italic className="w-4 h-4" /></button>
                </div>

                <div className="flex items-center gap-1 px-2 border-r border-app">
                  <button className="p-1.5 hover:bg-muted rounded text-muted-app transition-colors pr-3"><ImageIcon className="w-4 h-4" /></button>
                </div>

                <div className="flex items-center gap-1 px-2">
                  <button className="p-1.5 bg-blue-50 text-blue-600 rounded transition-colors"><AlignLeft className="w-4 h-4" /></button>
                  <button className="p-1.5 hover:bg-muted rounded text-muted-app transition-colors"><AlignCenter className="w-4 h-4" /></button>
                  <button className="p-1.5 hover:bg-muted rounded text-muted-app transition-colors"><AlignRight className="w-4 h-4" /></button>
                  <button className="p-1.5 hover:bg-muted rounded text-muted-app transition-colors"><AlignJustify className="w-4 h-4" /></button>
                </div>
              </div>

              {/* Editor Content Area */}
              <textarea 
                value={selectedItem?.content || ''}
                onChange={(e) => updateContent(e.target.value)}
                className="flex-1 w-full p-8 text-sm text-main outline-none bg-transparent resize-none leading-relaxed placeholder:text-muted-app/50"
                placeholder="Start typing or paste your knowledge here..."
              />
            </div>
          </div>
        );
      case 'website':
        return (
          <div className="flex-1 overflow-y-auto p-10 space-y-10">
            {/* Provide Link Section */}
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-main">Provide Link</h3>
                <p className="text-sm text-muted-app mt-1">Provide a link to the page you want the AI to learn from.</p>
              </div>

              <div className="flex p-1 bg-muted/50 w-fit rounded-xl border border-app">
                <button className="px-6 py-2 bg-white dark:bg-zinc-900 shadow-sm rounded-lg text-xs font-bold text-main border border-app">
                  Batch Link
                </button>
                <button className="px-6 py-2 text-xs font-bold text-muted-app hover:text-main transition-colors">
                  Single Link
                </button>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-bold text-main">Web Link Collector</h4>
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <input 
                      type="text" 
                      placeholder="Link URL" 
                      className="w-full bg-muted dark:bg-zinc-900 border border-transparent focus:border-blue-500/50 rounded-xl px-5 py-3 text-sm text-main outline-none transition-all placeholder:text-muted-app/50"
                    />
                  </div>
                  <button className="px-8 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all">
                    Collect Link
                  </button>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-app">
                  <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center text-white text-[8px]">i</div>
                  <p>Start with URL and this tool will gather up to <span className="font-bold text-main">300 unique</span> links from the site, excluding any files</p>
                </div>
              </div>
            </div>

            <div className="h-px bg-app w-full" />

            {/* Trained Link Section */}
            <div className="space-y-6">
              <h3 className="text-xl font-bold text-main">Trained Link</h3>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <input type="checkbox" className="w-4 h-4 rounded border-app text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm font-medium text-blue-600">Select</span>
                </div>
                
                <div className="flex-1 relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-app">
                    <Search className="w-4 h-4" />
                  </div>
                  <input 
                    type="text" 
                    placeholder="Search Links" 
                    className="w-full bg-muted dark:bg-zinc-900 border border-transparent focus:border-blue-500/50 rounded-xl pl-12 pr-5 py-2.5 text-sm text-main outline-none transition-all placeholder:text-muted-app/50"
                  />
                </div>
              </div>

              {/* Empty state or list could go here */}
              <div className="py-20 text-center border-2 border-dashed border-app rounded-[2rem] bg-muted/20">
                  <p className="text-sm text-muted-app italic">No links collected yet. Enter a URL above to start training.</p>
              </div>
            </div>
          </div>
        );
      case 'qna':
        return (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-main">Q&A Management</h3>
              <button 
                onClick={() => {
                  const currentQna = JSON.parse(selectedItem?.content || '[]');
                  updateContent(JSON.stringify([...currentQna, { q: '', a: '' }]));
                }}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" />
                Add FAQ Pair
              </button>
            </div>

            <div className="space-y-4">
              {(() => {
                try {
                  const qna = JSON.parse(selectedItem?.content || '[]');
                  if (qna.length === 0) return <div className="text-center py-20 border-2 border-dashed border-app rounded-3xl text-muted-app italic text-sm">No Q&A pairs yet. Click the button above to add one.</div>;
                  
                  return qna.map((pair: any, idx: number) => (
                    <div key={idx} className="bg-white dark:bg-zinc-900 border border-app rounded-2xl p-5 space-y-4 shadow-sm relative group">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-muted-app uppercase tracking-widest px-1">Question</label>
                        <input 
                          type="text"
                          value={pair.q}
                          onChange={(e) => {
                            const newQna = [...qna];
                            newQna[idx].q = e.target.value;
                            updateContent(JSON.stringify(newQna));
                          }}
                          className="w-full bg-muted/50 border border-transparent focus:border-blue-500/50 rounded-xl px-4 py-2.5 text-xs text-main outline-none transition-all"
                          placeholder="e.g. Berapa biaya cuci AC?"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-muted-app uppercase tracking-widest px-1">Answer</label>
                        <textarea 
                          value={pair.a}
                          onChange={(e) => {
                            const newQna = [...qna];
                            newQna[idx].a = e.target.value;
                            updateContent(JSON.stringify(newQna));
                          }}
                          className="w-full bg-muted/50 border border-transparent focus:border-blue-500/50 rounded-xl px-4 py-2.5 text-xs text-main outline-none transition-all min-h-[80px] resize-none"
                          placeholder="Sebutkan harga atau kebijakan..."
                        />
                      </div>
                      <button 
                        onClick={() => {
                          const newQna = qna.filter((_: any, i: number) => i !== idx);
                          updateContent(JSON.stringify(newQna));
                        }}
                        className="absolute top-4 right-4 p-1.5 text-red-400 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Plus className="w-3.5 h-3.5 rotate-45" />
                      </button>
                    </div>
                  ));
                } catch {
                  return <div className="text-red-500 text-xs">Error parsing Q&A data. Content: {selectedItem?.content}</div>;
                }
              })()}
            </div>
          </div>
        );
      case 'product':
        return (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-main">Product & Service Catalog</h3>
              <button 
                onClick={() => {
                  const currentProducts = JSON.parse(selectedItem?.content || '[]');
                  updateContent(JSON.stringify([...currentProducts, { name: '', price: '', description: '', sku: '' }]));
                }}
                className="px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 transition-all flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Item
              </button>
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-app rounded-3xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b border-app">
                    <th className="px-4 py-3 font-bold text-muted-app uppercase tracking-widest">Name</th>
                    <th className="px-4 py-3 font-bold text-muted-app uppercase tracking-widest">Price</th>
                    <th className="px-4 py-3 font-bold text-muted-app uppercase tracking-widest">SKU/ID</th>
                    <th className="px-4 py-3 font-bold text-muted-app uppercase tracking-widest">Description</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app">
                  {(() => {
                    try {
                      const products = JSON.parse(selectedItem?.content || '[]');
                      if (products.length === 0) return <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-app italic">No products yet. Click the button to add.</td></tr>;
                      
                      return products.map((prod: any, idx: number) => (
                        <tr key={idx} className="group">
                          <td className="px-4 py-3">
                            <input 
                              type="text" 
                              value={prod.name}
                              onChange={(e) => {
                                const newProds = [...products];
                                newProds[idx].name = e.target.value;
                                updateContent(JSON.stringify(newProds));
                              }}
                              className="w-full bg-transparent outline-none focus:text-blue-600 font-medium"
                              placeholder="Cuci AC 1/2 PK"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input 
                              type="text" 
                              value={prod.price}
                              onChange={(e) => {
                                const newProds = [...products];
                                newProds[idx].price = e.target.value;
                                updateContent(JSON.stringify(newProds));
                              }}
                              className="w-full bg-transparent outline-none font-mono"
                              placeholder="Rp 75.000"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input 
                              type="text" 
                              value={prod.sku}
                              onChange={(e) => {
                                const newProds = [...products];
                                newProds[idx].sku = e.target.value;
                                updateContent(JSON.stringify(newProds));
                              }}
                              className="w-full bg-transparent outline-none text-muted-app"
                              placeholder="SRV-001"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input 
                              type="text" 
                              value={prod.description}
                              onChange={(e) => {
                                const newProds = [...products];
                                newProds[idx].description = e.target.value;
                                updateContent(JSON.stringify(newProds));
                              }}
                              className="w-full bg-transparent outline-none"
                              placeholder="Termasuk pengecekan freon..."
                            />
                          </td>
                          <td className="px-4 py-3">
                            <button 
                              onClick={() => {
                                const newProds = products.filter((_: any, i: number) => i !== idx);
                                updateContent(JSON.stringify(newProds));
                              }}
                              className="p-1 text-red-400 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100"
                            >
                              <Plus className="w-3.5 h-3.5 rotate-45" />
                            </button>
                          </td>
                        </tr>
                      ));
                    } catch {
                      return <tr><td colSpan={5} className="px-4 py-4 text-red-500">Error parsing data.</td></tr>;
                    }
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950">
      {/* Source Type Tabs */}
      <div className="flex gap-4 p-4 border-b border-app overflow-x-auto no-scrollbar bg-white dark:bg-zinc-950">
        {SOURCE_TYPES.map((type) => (
          <button
            key={type.id}
            onClick={() => {
              setActiveSourceType(type.id);
            }}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl border text-sm font-semibold transition-all whitespace-nowrap ${
              activeSourceType === type.id
                ? 'bg-white dark:bg-zinc-900 border-blue-600 text-blue-600 shadow-sm'
                : 'bg-white dark:bg-zinc-900 border-app text-muted-app hover:text-main hover:border-gray-300'
            }`}
          >
            <type.icon className={`w-4 h-4 ${activeSourceType === type.id ? 'text-blue-600' : 'text-muted-app'}`} />
            {type.label}
          </button>
        ))}
      </div>

      {/* Toolbar & Items */}
      <div className="flex items-center justify-between p-4 border-b border-app bg-[#fcfcfc] dark:bg-zinc-950/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {isAdding ? (
              <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 border border-blue-500 rounded-xl px-2 py-1">
                <input 
                  autoFocus
                  type="text"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
                  placeholder="Item name..."
                  className="bg-transparent border-none outline-none text-xs px-2 w-32"
                />
                <button onClick={handleAddItem} className="p-1 bg-blue-600 text-white rounded-lg">
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setIsAdding(true)}
                className="p-2.5 hover:bg-muted border border-app rounded-xl text-muted-app bg-white dark:bg-zinc-900 shadow-sm transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
          
          <div className="h-6 w-px bg-app mx-1" />

          {items.filter(i => i.type === activeSourceType || (activeSourceType === 'text' && !i.type)).map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedItemId(item.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                selectedItemId === item.id
                  ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'bg-white dark:bg-zinc-900 border-app text-muted-app hover:text-main hover:border-gray-300'
              }`}
            >
              {item.name}
              <motion.span 
                initial={false}
                animate={{ opacity: selectedItemId === item.id ? 1 : 0.5 }}
              >
                <Edit2 className="w-3.5 h-3.5 ml-1" />
              </motion.span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex border border-app rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
            <button className="p-2.5 hover:bg-muted text-muted-app border-r border-app transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="p-2.5 hover:bg-muted text-muted-app transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button 
            disabled={saving || !selectedItem}
            onClick={handleSaveContent}
            className={`flex items-center gap-2 px-8 py-2.5 border rounded-xl text-xs font-bold transition-all ${
            selectedItem ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/20' : 'bg-[#f3f4f6] dark:bg-zinc-800 border-app text-muted-app opacity-50 cursor-not-allowed'
          }`}>
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            Save
          </button>
        </div>
      </div>

      {/* Content Area */}
      {renderContent()}
    </div>
  );
}
