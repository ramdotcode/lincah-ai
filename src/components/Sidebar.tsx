'use client';

import {
  MessageSquare,
  BarChart3,
  BookOpen,
  Bot,
  Link as LinkIcon,
  Settings,
  HeartPulse,
  Shield,
  ClipboardList,
  Users,
  Ticket
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';

const sidebarModules: Record<string, any[]> = {
  agents: [
    { icon: Bot, href: '/agents', label: 'AI Agents' },
    { icon: LinkIcon, href: '/platforms', label: 'Connected Platforms' },
  ],
  chat: [
    { icon: MessageSquare, href: '/monitor', label: 'Live Monitoring' },
    { icon: Ticket, href: '/tickets', label: 'Tickets' },
    { icon: BarChart3, href: '/stats', label: 'Analytics' },
  ],
  crm: [
    { icon: BookOpen, href: '/leads', label: 'Lead Database' },
    { icon: Users, href: '/contacts', label: 'Contacts' },
    { icon: ClipboardList, href: '/orders', label: 'Orders' },
  ],
  settings: [
    { icon: Settings, href: '/settings', label: 'General Settings' },
  ]
};

// Modul terpisah, hanya untuk role 'admin'
const adminItems = [
  { icon: BarChart3, href: '/admin/usage', label: 'AI Usage' },
  { icon: HeartPulse, href: '/admin/health', label: 'System Health' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isHovered, setIsHovered] = useState(false);
  const [isUserAdmin, setIsUserAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (mounted && data?.role === 'admin') setIsUserAdmin(true);
    })();
    return () => { mounted = false; };
  }, []);

  // Determine active module
  const activeModule = pathname.startsWith('/admin')
    ? 'admin'
    : pathname.startsWith('/agents') || pathname.startsWith('/dashboard') || pathname.startsWith('/platforms')
    ? 'agents'
    : pathname.startsWith('/monitor') || pathname.startsWith('/tickets') || pathname.startsWith('/stats')
    ? 'chat'
    : pathname.startsWith('/leads') || pathname.startsWith('/contacts') || pathname.startsWith('/orders')
    ? 'crm'
    : 'settings';

  const items = activeModule === 'admin'
    ? (isUserAdmin ? adminItems : [])
    : (sidebarModules[activeModule] || []);

  return (
    <div className="w-16 h-full relative z-40 transition-colors">
      {/* 
        Container Sidebar mendengarkan hover. 
        Dibuat absolute agar bisa melayang menutupi konten.
      */}
      <motion.div 
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        animate={{ 
          width: isHovered ? 260 : 64,
          boxShadow: isHovered ? "10px 0 30px -10px rgba(0,0,0,0.15)" : "0 0 0 rgba(0,0,0,0)"
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="absolute top-0 left-0 h-full bg-card-app border-r border-app flex flex-col py-4 overflow-hidden"
      >
        <div className="flex-1 px-3 space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-all relative group ${
                  isActive 
                    ? 'bg-muted text-blue-600' 
                    : 'text-muted-app hover:bg-muted hover:text-main'
                }`}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 transition-transform ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                
                <motion.span 
                  initial={false}
                  animate={{ opacity: isHovered ? 1 : 0, x: isHovered ? 0 : -10 }}
                  transition={{ duration: 0.2 }}
                  className={`text-sm font-medium whitespace-nowrap overflow-hidden ${!isHovered && 'pointer-events-none'}`}
                >
                  {item.label}
                </motion.span>

                {isActive && (
                  <div className="absolute left-0 top-1/4 w-1 h-1/2 bg-blue-600 rounded-r-full" />
                )}
              </Link>
            );
          })}
        </div>

        <div className="px-3 border-t border-app pt-4 space-y-1">
          {isUserAdmin && (
            <Link
              href="/admin/usage"
              className={`flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-all group ${
                pathname.startsWith('/admin') ? 'bg-muted text-blue-600' : 'text-muted-app hover:bg-muted hover:text-main'
              }`}
            >
              <Shield className="w-5 h-5 flex-shrink-0 group-hover:scale-110 transition-transform" />
              <motion.span
                animate={{ opacity: isHovered ? 1 : 0, x: isHovered ? 0 : -10 }}
                className={`text-sm font-medium whitespace-nowrap ${!isHovered && 'pointer-events-none'}`}
              >
                Admin
              </motion.span>
            </Link>
          )}
          <Link
            href="/settings"
            className={`flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-all group ${
              pathname === '/settings' ? 'bg-muted text-blue-600' : 'text-muted-app hover:bg-muted hover:text-main'
            }`}
          >
            <Settings className="w-5 h-5 flex-shrink-0 group-hover:rotate-45 transition-transform duration-500" />
            <motion.span 
              animate={{ opacity: isHovered ? 1 : 0, x: isHovered ? 0 : -10 }}
              className={`text-sm font-medium whitespace-nowrap ${!isHovered && 'pointer-events-none'}`}
            >
              Settings
            </motion.span>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
