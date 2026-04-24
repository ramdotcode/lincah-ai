'use client';

import { 
  MessageSquare, 
  Users, 
  Zap, 
  HelpCircle,
  Bell,
  User,
  Sun,
  Moon,
  LogOut,
  ChevronDown,
  Settings,
  CreditCard
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase-client';
import { motion, AnimatePresence } from 'framer-motion';

const navItems = [
  { name: 'Chat', icon: MessageSquare, href: '/monitor' },
  { name: 'Agents', icon: Zap, href: '/agents' },
  { name: 'CRM', icon: Users, href: '/leads' },
];

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<any>(null); // Fixed later would be better but keeping any for now to avoid huge refactor, just fixing order
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
  };

  useEffect(() => {
    setMounted(true);
    fetchUser();
    
    // Memberikan event listener untuk menutup dropdown jika klik di luar area
    const handleClickOutside = (event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
            setIsDropdownOpen(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  return (
    <div className="h-14 bg-card-app border-b border-app flex items-center justify-between px-6 sticky top-0 z-50 transition-colors shadow-sm">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2">
           <Link href="/dashboard" className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/20 hover:scale-105 transition-transform">
             <Zap className="text-white w-5 h-5 fill-current" />
           </Link>
        </div>

        <nav className="flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={`px-4 py-5 border-b-2 text-sm font-medium transition-all ${
                pathname === item.href 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-muted-app hover:text-main'
              }`}
            >
              <div className="flex items-center gap-2">
                <item.icon className="w-4 h-4" />
                <span className="hidden md:inline">{item.name}</span>
              </div>
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-3 text-muted-app">
        {mounted && (
            <button 
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="p-2 hover:bg-muted transition-all rounded-lg"
            >
                {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
        )}
        
        <button className="p-2 hover:bg-muted rounded-full relative">
            <Bell className="w-4 h-4" />
            <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-blue-600 rounded-full border-2 border-card-app"></span>
        </button>

        <div className="w-px h-6 bg-card-border mx-1"></div>

        {/* Profile Dropdown Container */}
        <div className="relative pl-2" ref={dropdownRef}>
           <button 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-3 p-1 hover:bg-muted rounded-full transition-all group"
           >
              <div className="w-8 h-8 bg-blue-600/10 rounded-full flex items-center justify-center border border-blue-500/20 text-blue-600 overflow-hidden">
                  <User className="w-4 h-4" />
              </div>
              <div className="text-left hidden sm:block">
                  <p className="text-[10px] font-bold text-main leading-tight max-w-[80px] truncate">
                    {user?.email?.split('@')[0] || 'User'}
                  </p>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`} />
           </button>

           <AnimatePresence>
             {isDropdownOpen && (
               <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute right-0 mt-3 w-56 bg-card-app border border-app rounded-2xl shadow-2xl py-2 z-[60] overflow-hidden"
               >
                  {/* User Email Info Section */}
                  <div className="px-4 py-3 border-b border-app mb-2 bg-muted/30">
                    <p className="text-[10px] uppercase font-bold text-muted-app tracking-widest mb-1">Authenticated as</p>
                    <p className="text-xs font-bold text-main truncate">{user?.email}</p>
                  </div>

                  <button className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-main hover:bg-muted transition-colors">
                    <Settings className="w-4 h-4 text-muted-app" />
                    Account Settings
                  </button>
                  <button className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-main hover:bg-muted transition-colors">
                    <CreditCard className="w-4 h-4 text-muted-app" />
                    Billing & Plan
                  </button>
                  <button className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-main hover:bg-muted transition-colors">
                    <HelpCircle className="w-4 h-4 text-muted-app" />
                    Support Center
                  </button>

                  <div className="h-px bg-app my-2"></div>

                  <button 
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Log Out
                  </button>
               </motion.div>
             )}
           </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
