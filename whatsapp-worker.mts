import { 
    makeWASocket, 
    DisconnectReason, 
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import pino from 'pino';
import http from 'http';
import fs from 'fs';
import path from 'path';

// CONFIGURATION
const API_URL = process.env.WHATSAPP_HOOK_URL || 'http://localhost:3000/api/webhook/whatsapp';
const BRIDGE_PORT = Number(process.env.WHATSAPP_BRIDGE_PORT) || 3001; 
const SESSIONS_DIR = path.join(process.cwd(), 'sessions');

// Initialize sessions directory
if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR);
}

// SESSION STATE
interface Session {
    sock: any | null;
    qr: string | null;
    qrImage: string | null;
    status: 'connecting' | 'open' | 'close';
    subStatus: string;
    botId: string;
}

const sessions = new Map<string, Session>();

async function startSession(botId: string) {
    if (sessions.has(botId) && sessions.get(botId)?.status === 'open') {
        console.log(`[Session] Session ${botId} already active.`);
        return;
    }

    console.log(`[Session] Starting session for bot: ${botId}`);
    
    // Create status object
    const sessionState: Session = {
        sock: null,
        qr: null,
        qrImage: null,
        status: 'connecting',
        subStatus: 'Menghubungkan...',
        botId
    };
    sessions.set(botId, sessionState);

    const sessionDir = path.join(SESSIONS_DIR, `auth_info_${botId}`);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        logger: pino({ level: 'silent' }),
    });

    sessionState.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            sessionState.qr = qr;
            sessionState.qrImage = await QRCode.toDataURL(qr);
            sessionState.status = 'connecting';
            sessionState.subStatus = 'Menunggu scan QR code...';
            console.log(`[QR] New QR for bot ${botId}`);
        }

        if (connection === 'close') {
            sessionState.status = 'close';
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            sessionState.subStatus = shouldReconnect ? 'Mencoba reconnect...' : 'Terputus (Logged Out)';
            
            if (shouldReconnect) {
                setTimeout(() => startSession(botId), 5000);
            } else {
                // If logged out, we might want to clean up files
                console.log(`[Session] Bot ${botId} logged out.`);
                sessions.delete(botId);
            }
        } else if (connection === 'open') {
            sessionState.status = 'open';
            sessionState.qr = null;
            sessionState.qrImage = null;
            sessionState.subStatus = `Terhubung sebagai ${sock.user?.id.split(':')[0]}`;
            console.log(`[Session] Bot ${botId} connected!`);
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const remoteJid = msg.key.remoteJid!;
        const messageText = msg.message.conversation || 
                           msg.message.extendedTextMessage?.text || 
                           '';
        const senderName = msg.pushName || 'User';
        const senderPhone = remoteJid.split('@')[0];

        if (!messageText) return;

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bot_id: botId,
                    from: senderPhone,
                    name: senderName,
                    text: messageText,
                    bot_phone: sock.user?.id.split(':')[0] || ''
                })
            });

            if (response.ok) {
                const data: any = await response.json();
                if (data.reply) {
                    await sock.sendMessage(remoteJid, { text: data.reply });
                }
            }
        } catch (error) {
            console.error(`[Error] Session ${botId} webhook error:`, error);
        }
    });
}

// BRIDGE SERVER
http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204); res.end(); return;
    }

    const url = new URL(req.url!, `http://localhost:${BRIDGE_PORT}`);
    const botId = url.searchParams.get('botId');

    if (req.method === 'GET' && url.pathname === '/status') {
        if (!botId) {
            res.writeHead(400); 
            res.end(JSON.stringify({ error: 'botId is required' }));
            return;
        }

        // Auto start session if not exists and we have it in URL
        if (!sessions.has(botId)) {
            startSession(botId);
        }

        const session = sessions.get(botId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: session?.status || 'close', 
            subStatus: session?.subStatus || 'Offline',
            qr: session?.qrImage,
            user: session?.sock?.user?.id ? { id: session.sock.user.id } : null
        }));
    } else if (req.method === 'POST' && url.pathname === '/send') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const targetBotId = data.botId;
                const session = sessions.get(targetBotId);

                if (!session || session.status !== 'open') {
                    throw new Error('Session not connected');
                }

                const jid = data.to.includes('@s.whatsapp.net') ? data.to : `${data.to}@s.whatsapp.net`;
                await session.sock.sendMessage(jid, { text: data.text });
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            } catch (err: any) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
            }
        });
    } else {
        res.writeHead(404);
        res.end();
    }
}).listen(BRIDGE_PORT, () => {
    console.log(`--- MULTI-SESSION BRIDGE SERVER ON PORT ${BRIDGE_PORT} ---`);
    
    // Auto-resume existing sessions from disk
    const dirs = fs.readdirSync(SESSIONS_DIR);
    dirs.forEach(dir => {
        if (dir.startsWith('auth_info_')) {
            const botId = dir.replace('auth_info_', '');
            startSession(botId);
        }
    });
});
