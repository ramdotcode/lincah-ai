'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    QrCode, 
    CheckCircle2, 
    XCircle, 
    Loader2, 
    Phone, 
    RefreshCw,
    ExternalLink
} from 'lucide-react';

interface WhatsAppStatusData {
    status: 'connecting' | 'open' | 'close';
    subStatus: string;
    qr: string | null;
    user: {
        id: string;
        name?: string;
    } | null;
}

interface Props {
    botId: string;
}

export default function WhatsAppStatus({ botId }: Props) {
    const [status, setStatus] = useState<WhatsAppStatusData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

    const fetchStatus = useCallback(async () => {
        if (!botId) return;
        try {
            const bridgeRoot = process.env.NEXT_PUBLIC_WHATSAPP_BRIDGE_URL || 'http://localhost:3001';
            const res = await fetch(`${bridgeRoot}/status?botId=${botId}`);
            if (res.ok) {
                const data = await res.json();
                setStatus(data);
                setError(null);
            } else {
                setError('Bridge server returns error');
            }
        } catch (err) {
            setError('Bridge Server Offline');
            setStatus(null);
        } finally {
            setLoading(false);
            setLastUpdated(new Date());
        }
    }, [botId]);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 3000);
        return () => clearInterval(interval);
    }, [fetchStatus]);

    const getStatusConfig = (status: string | undefined) => {
        switch (status) {
            case 'open':
                return {
                    color: 'text-emerald-500',
                    bg: 'bg-emerald-500/10',
                    icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
                    text: 'Terhubung'
                };
            case 'connecting':
                return {
                    color: 'text-amber-500',
                    bg: 'bg-amber-500/10',
                    icon: <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />,
                    text: 'Menghubungkan'
                };
            case 'close':
                return {
                    color: 'text-rose-500',
                    bg: 'bg-rose-500/10',
                    icon: <XCircle className="w-4 h-4 text-rose-500" />,
                    text: 'Terputus'
                };
            default:
                return {
                    color: 'text-slate-400',
                    bg: 'bg-slate-400/10',
                    icon: <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />,
                    text: 'Mencari Server'
                };
        }
    };

    const currentStatus = getStatusConfig(status?.status);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between px-1">
                <h4 className="text-[10px] uppercase font-bold text-muted-app tracking-widest flex items-center gap-2">
                    <QrCode className="w-3 h-3" />
                    WhatsApp Identity
                </h4>
                <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full border border-app text-[10px] font-bold ${currentStatus.bg} ${currentStatus.color}`}>
                    {currentStatus.icon}
                    {currentStatus.text}
                </div>
            </div>

            <div className="bg-muted/30 border border-app rounded-2xl p-6 overflow-hidden relative group">
                <AnimatePresence mode="wait">
                    {error && (
                        <motion.div 
                            key="error"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="space-y-3 text-center py-4"
                        >
                            <XCircle className="w-10 h-10 text-rose-400 mx-auto opacity-50" />
                            <div className="space-y-1">
                                <p className="text-xs font-bold text-main">Bridge Server Offline</p>
                                <p className="text-[10px] text-muted-app leading-relaxed px-4">
                                    Jalankan <code className="bg-muted px-1.5 py-0.5 rounded text-rose-400">npm run whatsapp</code> di terminal untuk mengaktifkan integrasi.
                                </p>
                            </div>
                        </motion.div>
                    )}

                    {!error && status?.status === 'open' && (
                        <motion.div 
                            key="connected"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex items-center gap-4 py-2"
                        >
                            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shrink-0">
                                <Phone className="w-6 h-6 text-emerald-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] text-muted-app font-bold uppercase tracking-wider">Terhubung Sebagai</p>
                                <p className="text-sm font-bold text-main truncate font-mono">{status.user?.id?.split(':')[0] || 'Unknown'}</p>
                                <p className="text-[10px] text-emerald-500 font-medium flex items-center gap-1.5 mt-0.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    Active & Listening
                                </p>
                            </div>
                        </motion.div>
                    )}

                    {!error && status?.status !== 'open' && (
                        <motion.div 
                            key="no-connection"
                            className="flex flex-col items-center justify-center gap-6"
                        >
                            {status?.qr ? (
                                <div className="space-y-4 flex flex-col items-center">
                                    <div className="p-3 bg-white rounded-2xl shadow-sm border border-app">
                                        <img src={status.qr} alt="WA QR" className="w-32 h-32" />
                                    </div>
                                    <p className="text-[10px] text-muted-app text-center max-w-[200px] leading-relaxed">
                                        Scan QR ini dengan aplikasi WhatsApp berbeda untuk agent ini.
                                    </p>
                                </div>
                            ) : (
                                <div className="py-6 flex flex-col items-center gap-4">
                                    <div className="relative">
                                        <div className="w-12 h-12 border-2 border-blue-500/10 border-t-blue-500 rounded-full animate-spin" />
                                        <Loader2 className="w-5 h-5 text-blue-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                                    </div>
                                    <p className="text-[10px] text-muted-app font-medium tracking-wide animate-pulse">
                                        {status?.subStatus || 'Mempersiapkan koneksi...'}
                                    </p>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
                <button 
                    onClick={fetchStatus}
                    className="flex-1 px-4 py-2 bg-card-app border border-app rounded-xl text-[10px] font-bold text-main hover:bg-muted flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                    <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
                <a 
                    href="https://web.whatsapp.com" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex-1 px-4 py-2 bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/10 rounded-xl text-[10px] font-bold text-blue-600 flex items-center justify-center gap-2 transition-all"
                >
                    <ExternalLink className="w-3 h-3" />
                    Web WA
                </a>
            </div>
        </div>
    );
}
