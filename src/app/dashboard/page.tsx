'use client';

import LayoutShell from '@/components/LayoutShell';
import Link from 'next/link';
import {
  Bot,
  Settings,
  Link as LinkIcon,
  MessageSquare,
  ChevronRight
} from 'lucide-react';
import { motion } from 'framer-motion';

// Langkah onboarding — urutan mengikuti alur setup nyata:
// buat bot → isi behavior/knowledge → hubungkan channel → pantau chat.
const onboardingSteps = [
  {
    icon: <Bot className="w-10 h-10 text-blue-500" />,
    title: "1. Create an AI agent",
    description: "Buat bot AI pertamamu untuk menjawab pesan pelanggan",
    color: "bg-blue-500/10",
    href: "/agents"
  },
  {
    icon: <Settings className="w-10 h-10 text-violet-500" />,
    title: "2. Set behavior & knowledge",
    description: "Atur cara bot menjawab dan isi pengetahuan bisnismu",
    color: "bg-violet-500/10",
    href: "/settings"
  },
  {
    icon: <LinkIcon className="w-10 h-10 text-amber-500" />,
    title: "3. Connect platforms",
    description: "Hubungkan WhatsApp, Telegram, atau live chat widget website",
    color: "bg-amber-500/10",
    href: "/platforms"
  },
  {
    icon: <MessageSquare className="w-10 h-10 text-emerald-500" />,
    title: "4. Monitor conversations",
    description: "Pantau semua percakapan, balas manual, dan kelola leads",
    color: "bg-emerald-500/10",
    href: "/monitor"
  }
];

export default function DashboardPage() {
  return (
    <LayoutShell>
      <div className="max-w-[700px] mx-auto py-16 px-4 font-sans">
        <div className="text-center mb-12">
            <h1 className="text-2xl font-semibold text-main mb-2 tracking-tight">Welcome back to Lincah AI!</h1>
        </div>

        <div className="space-y-4">
          {onboardingSteps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Link
                href={step.href}
                className="bg-card-app border border-app rounded-2xl p-6 flex items-center gap-6 cursor-pointer hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-500/5 transition-all group onboarding-card"
              >
                <div className={`w-20 h-20 rounded-xl ${step.color} flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform`}>
                  {step.icon}
                </div>
                <div className="flex-1 text-left">
                  <h3 className="font-bold text-main">{step.title}</h3>
                  <p className="text-sm text-muted-app mt-1">{step.description}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-app group-hover:text-blue-500 transition-colors" />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </LayoutShell>
  );
}
