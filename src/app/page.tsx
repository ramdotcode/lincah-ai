'use client';

import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase-client';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/dashboard');
      }
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: any, session: any) => {
        if (session) {
          router.push('/dashboard');
        }
      }
    );

    checkUser();
    return () => subscription.unsubscribe();
  }, [router]);

  if (loading) return null;

  return (
    <div className="min-h-screen bg-[#f9fafb] flex flex-col items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
            <div className="inline-flex p-3 rounded-2xl bg-blue-600 shadow-xl shadow-blue-500/10 mb-4">
                <Zap className="w-8 h-8 text-white fill-current" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Lincah AI</h1>
            <p className="text-sm text-gray-500">The most agile AI Agent for Telegram</p>
        </div>

        <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-xl shadow-gray-200/50 relative">
            <div className="absolute -top-3 -right-3">
                <div className="bg-blue-600 rounded-full px-3 py-1 flex items-center gap-2 shadow-lg">
                    <Sparkles className="w-3 h-3 text-white" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white">Enterprise</span>
                </div>
            </div>
            <Auth
                supabaseClient={supabase}
                appearance={{ 
                  theme: ThemeSupa,
                  variables: {
                    default: {
                      colors: {
                        brand: '#2563eb',
                        brandAccent: '#1d4ed8',
                        inputBackground: '#f9fafb',
                        inputText: '#111827',
                        inputPlaceholder: '#9ca3af',
                        inputBorder: '#e5e7eb',
                      },
                      radii: {
                        borderRadiusButton: '12px',
                        inputBorderRadius: '12px',
                      }
                    }
                  }
                }}
                providers={['google', 'github']}
                theme="default"
            />
        </div>

        <div className="mt-8 flex flex-col items-center gap-4">
           <div className="flex gap-6 text-xs font-medium text-gray-400">
              <span className="hover:text-gray-900 cursor-pointer">Privacy Policy</span>
              <span className="hover:text-gray-900 cursor-pointer">Terms of Service</span>
              <span className="hover:text-gray-900 cursor-pointer">Help Center</span>
           </div>
           <p className="text-[10px] text-gray-300">© 2026 Lincah AI Technology Group</p>
        </div>
      </motion.div>
    </div>
  );
}
