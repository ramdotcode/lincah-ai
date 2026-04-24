'use client';

import { useState, useEffect } from 'react';
import LayoutShell from '@/components/LayoutShell';
import { format } from 'date-fns';
import { 
  Search, 
  History, 
  User,
  Filter
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
  }, []);

  return (
    <LayoutShell>
      <div className="p-8">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-main">Leads & CRM</h1>
            <p className="text-sm text-muted-app mt-1">Total {leads.length} conversations managed by AI.</p>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-card-app border border-app rounded-lg text-sm font-medium hover:bg-muted flex items-center gap-2 transition-colors">
                <Filter className="w-4 h-4" />
                Filter
            </button>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/10">
                Export Data
            </button>
          </div>
        </header>

        <div className="bg-card-app border border-app rounded-xl overflow-hidden shadow-sm transition-colors">
          <div className="p-4 border-b border-app flex gap-4">
             <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app w-4 h-4" />
                <input 
                  type="text" 
                  placeholder="Search leads..." 
                  className="w-full bg-muted border border-transparent rounded-lg px-10 py-2 text-sm focus:bg-card-app focus:border-blue-500/50 outline-none transition-all text-main"
                />
             </div>
          </div>

          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted">
                <th className="px-6 py-3 font-semibold text-muted-app text-xs uppercase tracking-wider">Lead Info</th>
                <th className="px-6 py-3 font-semibold text-muted-app text-xs uppercase tracking-wider">Username</th>
                <th className="px-6 py-3 font-semibold text-muted-app text-xs uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 font-semibold text-muted-app text-xs uppercase tracking-wider">Last Sync</th>
                <th className="px-6 py-3 font-semibold text-muted-app text-xs uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app">
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-app text-sm italic">
                    {loading ? 'Crunching data...' : 'No conversations found yet.'}
                  </td>
                </tr>
              ) : (
                leads.map((lead, i) => (
                  <tr key={lead.id} className="hover:bg-muted transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 font-bold text-xs">
                          {lead.name?.charAt(0) || <User className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-main">{lead.name || 'Anonymous'}</p>
                          <p className="text-[10px] text-muted-app">{lead.chat_id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-app text-sm">
                      @{lead.username || 'n/a'}
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </LayoutShell>
  );
}
