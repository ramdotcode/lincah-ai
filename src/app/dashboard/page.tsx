'use client';

import LayoutShell from '@/components/LayoutShell';
import { 
  Package,
  Bot,
  UserPlus,
  Link as LinkIcon,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { motion } from 'framer-motion';

const onboardingSteps = [
  {
    icon: <Package className="w-10 h-10 text-amber-500" />,
    title: "1. Connect platforms",
    description: "Start receiving messages from WhatsApp, IG, and FB!",
    color: "bg-amber-500/10"
  },
  {
    icon: <Bot className="w-10 h-10 text-blue-500" />,
    title: "2. Create an AI agent",
    description: "Answer incoming messages with your AI agent",
    color: "bg-blue-500/10"
  },
  {
    icon: <UserPlus className="w-10 h-10 text-blue-400" />,
    title: "3. Invite human agents",
    description: "Invite your team to help answer chats",
    color: "bg-blue-500/10"
  },
  {
    icon: <LinkIcon className="w-10 h-10 text-blue-600" />,
    title: "4. Connect AI agent to inbox",
    description: "Connect your AI agent and human agents to your platforms",
    color: "bg-blue-500/10"
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
            </motion.div>
          ))}
        </div>

        <div className="text-center mt-12 space-y-4">
           <p className="text-sm text-blue-500 hover:underline cursor-pointer flex items-center justify-center gap-1 font-medium">
             Need more help? Watch our YouTube tutorials
             <ExternalLink className="w-3 h-3" />
           </p>
        </div>
      </div>
    </LayoutShell>
  );
}
