'use client';

import { 
  MessageSquare, 
  Ticket, 
  Phone, 
  BarChart3, 
  BookOpen, 
  Send, 
  Bot, 
  Link as LinkIcon, 
  GitBranch,
  Settings
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useState } from 'react';

const sidebarItems = [
  { icon: MessageSquare, href: '/monitor', label: 'Chat', section: 'top' },
  { icon: Ticket, href: '/tickets', label: 'Tickets', section: 'top' },
  { icon: Phone, href: '/calls', label: 'Calls', section: 'top' },
  { icon: BarChart3, href: '/stats', label: 'Analytics', section: 'mid' },
  { icon: BookOpen, href: '/leads', label: 'Conversations', section: 'mid' },
  { icon: Send, href: '/broadcasts', label: 'Broadcasts', section: 'mid' },
  { icon: Bot, href: '/agents', label: 'AI Agents', section: 'bot' },
  { icon: LinkIcon, href: '/integrations', label: 'Connected Platforms', section: 'bot' },
  { icon: GitBranch, href: '/flow', label: 'Flow', section: 'bot' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isHovered, setIsHovered] = useState(false);

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
          {['top', 'mid', 'bot'].map((section, idx) => (
            <div key={section} className="space-y-1">
              {idx > 0 && <div className="my-3 mx-2 border-t border-app opacity-50" />}
              {sidebarItems.filter(item => item.section === section).map((item) => {
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
          ))}
        </div>

        <div className="px-3 border-t border-app pt-4">
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
