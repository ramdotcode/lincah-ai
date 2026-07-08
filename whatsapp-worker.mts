import * as Sentry from '@sentry/node';
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
import https from 'https';
import fs from 'fs';
import path from 'path';

// Initialize Sentry early, before anything else
if (process.env.SENTRY_DSN) {
  try {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0.1,
    });
  } catch (err) {
    console.error('[Sentry] Failed to initialize:', err);
  }
} else {
  console.log('[Sentry] SENTRY_DSN not set, skipping Sentry initialization');
}

// CONFIGURATION
const API_URL = process.env.WHATSAPP_HOOK_URL || 'http://localhost:3000/api/webhook/whatsapp';
const BRIDGE_PORT = Number(process.env.WHATSAPP_BRIDGE_PORT) || 3001;
const SESSIONS_DIR = path.join(process.cwd(), 'sessions');
const HEALTH_TOKEN = process.env.HEALTH_TOKEN || 'dev-token';
const ALERT_TELEGRAM_TOKEN = process.env.ALERT_TELEGRAM_TOKEN;
const ALERT_TELEGRAM_CHAT_ID = process.env.ALERT_TELEGRAM_CHAT_ID;
const DISCONNECT_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
const ALERT_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
const HEALTH_CHECK_INTERVAL_MS = 30 * 1000; // 30 seconds

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
    lastMessageAt: Date;
    lastStateChangeAt: Date;
    disconnectedSince?: Date;
    lastAlertSentAt?: Date;
    recoveryAlertSent?: boolean;
}

const sessions = new Map<string, Session>();

async function sendTelegramAlert(message: string): Promise<void> {
  if (!ALERT_TELEGRAM_TOKEN || !ALERT_TELEGRAM_CHAT_ID) {
    console.log('[Alert] Telegram not configured, skipping alert');
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${ALERT_TELEGRAM_TOKEN}/sendMessage`;
    const data = JSON.stringify({
      chat_id: ALERT_TELEGRAM_CHAT_ID,
      text: message,
    });

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${ALERT_TELEGRAM_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        console.error(`[Alert] Telegram API error: ${res.statusCode}`);
      }
    });

    req.on('error', (err) => {
      console.error('[Alert] Failed to send Telegram alert:', err);
    });

    req.write(data);
    req.end();
  } catch (err) {
    console.error('[Alert] Exception sending Telegram alert:', err);
  }
}

async function startSession(botId: string) {
    if (sessions.has(botId) && sessions.get(botId)?.status === 'open') {
        console.log(`[Session] Session ${botId} already active.`);
        return;
    }

    console.log(`[Session] Starting session for bot: ${botId}`);

    // Create status object
    const now = new Date();
    const sessionState: Session = {
        sock: null,
        qr: null,
        qrImage: null,
        status: 'connecting',
        subStatus: 'Menghubungkan...',
        botId,
        lastMessageAt: now,
        lastStateChangeAt: now,
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
            sessionState.lastStateChangeAt = new Date();
            console.log(`[QR] New QR for bot ${botId}`);
        }

        if (connection === 'close') {
            sessionState.status = 'close';
            sessionState.lastStateChangeAt = new Date();
            sessionState.disconnectedSince = new Date();
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            const disconnectReason = (lastDisconnect?.error as Boom)?.output?.statusCode || 'unknown';
            sessionState.subStatus = shouldReconnect ? 'Mencoba reconnect...' : 'Terputus (Logged Out)';

            // Capture disconnect event with bot_id and disconnect_reason
            Sentry.captureException(new Error('WhatsApp session disconnected'), {
              tags: {
                bot_id: botId,
                channel: 'whatsapp',
                disconnect_reason: disconnectReason.toString(),
              },
              contexts: {
                whatsapp_bridge: {
                  bot_id: botId,
                  should_reconnect: shouldReconnect,
                },
              },
            });

            if (shouldReconnect) {
                setTimeout(() => startSession(botId), 5000);
            } else {
                // If logged out, CLEAN UP files so it's fresh for next QR
                console.log(`[Session] Bot ${botId} logged out. Cleaning up...`);
                const sessionDir = path.join(SESSIONS_DIR, `auth_info_${botId}`);
                if (fs.existsSync(sessionDir)) {
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                }
                sessions.delete(botId);
            }
        } else if (connection === 'open') {
            sessionState.status = 'open';
            sessionState.lastStateChangeAt = new Date();
            sessionState.disconnectedSince = undefined;
            sessionState.qr = null;
            sessionState.qrImage = null;
            sessionState.subStatus = `Terhubung sebagai ${sock.user?.id.split(':')[0]}`;
            sessionState.recoveryAlertSent = false;
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

        sessionState.lastMessageAt = new Date();

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(process.env.BRIDGE_SHARED_TOKEN
                        ? { 'x-bridge-token': process.env.BRIDGE_SHARED_TOKEN }
                        : {})
                },
                body: JSON.stringify({
                    bot_id: botId,
                    from: senderPhone,
                    name: senderName,
                    text: messageText,
                    bot_phone: sock.user?.id.split(':')[0] || ''
                })
            });

            if (!response.ok) {
                const responseText = await response.text();
                throw new Error(`Webhook returned ${response.status}: ${responseText}`);
            }

            const data: any = await response.json();
            if (data.reply) {
                try {
                    await sock.sendMessage(remoteJid, { text: data.reply });
                } catch (sendError) {
                    Sentry.captureException(sendError, {
                      tags: {
                        bot_id: botId,
                        channel: 'whatsapp',
                        error_type: 'send_message_failed',
                      },
                      contexts: {
                        whatsapp_bridge: {
                          bot_id: botId,
                          remote_jid: remoteJid,
                        },
                      },
                    });
                    console.error(`[Error] Session ${botId} failed to send message:`, sendError);
                }
            }
        } catch (error) {
            Sentry.captureException(error, {
              tags: {
                bot_id: botId,
                channel: 'whatsapp',
                error_type: 'webhook_forward_failed',
              },
              contexts: {
                whatsapp_bridge: {
                  bot_id: botId,
                  webhook_url: API_URL,
                },
              },
            });
            console.error(`[Error] Session ${botId} webhook error:`, error);
        }
    });
}

// Health check interval — detect disconnects and send alerts
setInterval(async () => {
    const now = new Date();
    for (const [botId, session] of sessions.entries()) {
        // Check if session is disconnected > 2 minutes and hasn't alerted in 15 min
        if (session.status === 'close' && session.disconnectedSince) {
            const timeSinceDisconnect = now.getTime() - session.disconnectedSince.getTime();
            const timeSinceLastAlert = session.lastAlertSentAt
                ? now.getTime() - session.lastAlertSentAt.getTime()
                : Infinity;

            if (timeSinceDisconnect > DISCONNECT_TIMEOUT_MS && timeSinceLastAlert > ALERT_COOLDOWN_MS) {
                const message = `🚨 WhatsApp Bridge Alert\n\nBot ID: ${botId}\nStatus: DISCONNECTED\nTime: ${now.toISOString()}\n\nNo reconnection after 2 minutes.`;
                console.log(`[Alert] Sending disconnect alert for bot ${botId}`);
                await sendTelegramAlert(message);
                session.lastAlertSentAt = now;
            }
        }

        // Check if session reconnected after alert
        if (session.status === 'open' && session.lastAlertSentAt && !session.recoveryAlertSent) {
            const message = `✅ WhatsApp Bridge Recovery\n\nBot ID: ${botId}\nStatus: RECONNECTED\nTime: ${now.toISOString()}`;
            console.log(`[Alert] Sending recovery alert for bot ${botId}`);
            await sendTelegramAlert(message);
            session.recoveryAlertSent = true;
        }
    }
}, HEALTH_CHECK_INTERVAL_MS);

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

    if (req.method === 'GET' && url.pathname === '/health') {
        const token = req.headers['x-health-token'];
        if (token !== HEALTH_TOKEN) {
            res.writeHead(401);
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
        }

        const sessionsData = Array.from(sessions.values()).map(s => ({
            bot_id: s.botId,
            state: s.status,
            last_message_at: s.lastMessageAt.toISOString(),
            last_state_change_at: s.lastStateChangeAt.toISOString(),
        }));

        const hasDisconnected = sessionsData.some(s => s.state === 'close');
        const overallStatus = hasDisconnected ? 'degraded' : 'ok';

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: overallStatus,
            uptime_seconds: process.uptime(),
            sessions: sessionsData,
        }));
    } else if (req.method === 'GET' && url.pathname === '/health/simple') {
        // Simple health check for monitors that only check status code
        const hasDisconnected = Array.from(sessions.values()).some(s => s.status === 'close');
        const statusCode = hasDisconnected ? 503 : 200;
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: hasDisconnected ? 'degraded' : 'ok' }));
    } else if (req.method === 'GET' && url.pathname === '/status') {
        if (!botId) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'botId is required' }));
            return;
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
                Sentry.captureException(err, {
                  tags: {
                    bot_id: botId || 'unknown',
                    channel: 'whatsapp',
                    error_type: 'send_endpoint_failed',
                  },
                });
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
            }
        });
    } else if (req.method === 'POST' && url.pathname === '/start') {
        if (!botId) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'botId is required' }));
            return;
        }

        console.log(`[Session] Manual start requested for bot ${botId}`);
        startSession(botId);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: 'Session starting' }));
    } else if (req.method === 'POST' && url.pathname === '/restart') {
        if (!botId) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'botId is required' }));
            return;
        }

        console.log(`[Session] Force restart requested for bot ${botId}`);
        const session = sessions.get(botId);
        if (session?.sock) {
            try { session.sock.logout(); } catch (e) {}
        }

        // Delete session folder to force new QR
        const sessionDir = path.join(SESSIONS_DIR, `auth_info_${botId}`);
        if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
        }

        sessions.delete(botId);
        startSession(botId);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: 'Session restarted' }));
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

// Process-level error handlers
process.on('uncaughtException', (error) => {
    Sentry.captureException(error, {
      tags: {
        error_type: 'uncaught_exception',
        channel: 'whatsapp_bridge',
      },
    });
    console.error('[FATAL] Uncaught exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    Sentry.captureException(new Error(`Unhandled Rejection: ${reason}`), {
      tags: {
        error_type: 'unhandled_rejection',
        channel: 'whatsapp_bridge',
      },
    });
    console.error('[ERROR] Unhandled rejection at:', promise, 'reason:', reason);
});
