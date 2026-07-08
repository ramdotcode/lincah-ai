# Observability & Monitoring Guide

This document explains the observability and monitoring setup for Lincah AI.

## Overview

Observability is split across 4 tasks:
1. **Sentry** (App + Bridge) — Error tracking
2. **Event Logging** (Supabase) — Performance metrics per message
3. **Health Check** (Bridge HTTP) — Status monitoring
4. **Admin Dashboard** (Next.js) — Metrics visualization

## Environment Variables

### Sentry
- `SENTRY_DSN` — Sentry project DSN (both app and bridge)
- `SENTRY_AUTH_TOKEN` — Auth token for source map upload (optional)
- `SENTRY_TEST` — Set to `true` to test error capture (dev only)

### Event Logging
- No additional env vars needed (uses `SUPABASE_SERVICE_KEY`)

### Health Check & Alerts
- `HEALTH_TOKEN` — Token for `/health` endpoint auth
- `ALERT_TELEGRAM_TOKEN` — Telegram bot token for bridge alerts
- `ALERT_TELEGRAM_CHAT_ID` — Telegram chat ID to receive alerts
- `WHATSAPP_BRIDGE_PORT` — Bridge server port (default: 3001)

## Event Types

Events logged to `event_logs` table:

| Type | Triggered | Fields |
|------|-----------|--------|
| `message_processed` | Every incoming message processed successfully | `latency_main_ms`, `latency_handoff_ms`, `prompt_tokens`, `completion_tokens`, `handoff_result` |
| `ai_error` | Groq API call fails | `error_message`, `latency_main_ms` or `latency_handoff_ms` |
| `webhook_error` | Webhook forwarding fails (bridge → app) | `error_message` |

## Testing Each Component

### 1. Sentry (App)

**Setup:**
```bash
# Get DSN from sentry.io
# Add to .env:
SENTRY_DSN=https://xxx@yyy.ingest.sentry.io/zzz
SENTRY_TEST=true
```

**Test error capture:**
```bash
# Send a message with TEST_SENTRY_ERROR
curl -X POST http://localhost:3000/api/webhook/telegram \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "text": "TEST_SENTRY_ERROR",
      "chat": { "id": 123 },
      "from": { "first_name": "Test" }
    }
  }'
```

Check Sentry dashboard for the event with tags: `bot_id`, `channel: telegram`.

### 2. Sentry (Bridge)

**Setup:**
```bash
# Same DSN as app
SENTRY_DSN=https://xxx@yyy.ingest.sentry.io/zzz
```

**Test disconnect alert:**
```bash
# Kill bridge process or logout a session
# Check Sentry for disconnect event with tags: `bot_id`, `disconnect_reason`
```

### 3. Event Logging

**Apply migration:**
```bash
# Run Supabase migration
supabase migration up
```

**Test:**
```bash
# Send a message via Telegram webhook
# Check Supabase: select * from event_logs where created_at > now() - interval '1 hour'

# Query average latency
select avg(latency_main_ms) as avg_latency_ms from event_logs where created_at > now() - interval '1 hour';
```

### 4. Health Check (Bridge)

**Setup:**
```bash
# Add to .env
HEALTH_TOKEN=your_secret_token
ALERT_TELEGRAM_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
ALERT_TELEGRAM_CHAT_ID=987654321
```

**Test `/health` endpoint:**
```bash
curl -H "x-health-token: your_secret_token" http://localhost:3001/health
```

Response:
```json
{
  "status": "ok",
  "uptime_seconds": 12345,
  "sessions": [
    {
      "bot_id": "uuid-here",
      "state": "connected",
      "last_message_at": "2026-07-09T10:00:00Z",
      "last_state_change_at": "2026-07-09T10:00:00Z"
    }
  ]
}
```

**Test `/health/simple`:**
```bash
# No token needed
curl http://localhost:3001/health/simple
# Returns 200 if ok, 503 if degraded
```

**Test disconnect alert:**
1. Kill internet connection or logout a session
2. Wait 2 minutes
3. Should receive Telegram alert (once every 15 minutes, not repeated)
4. When session reconnects, should receive recovery alert

## Querying Metrics

### Average latency (last 1 hour)
```sql
select
  avg(latency_main_ms) as avg_main_ms,
  avg(latency_handoff_ms) as avg_handoff_ms
from event_logs
where created_at > now() - interval '1 hour';
```

### Total tokens used today (Asia/Jakarta timezone)
```sql
select
  sum(prompt_tokens) + sum(completion_tokens) as total_tokens
from event_logs
where date(created_at at time zone 'Asia/Jakarta') = date(now() at time zone 'Asia/Jakarta')
  and event_type = 'message_processed';
```

### Handoff rate (last 24 hours)
```sql
select
  sum(case when handoff_result = true then 1 else 0 end)::float / count(*) * 100 as handoff_rate_percent
from event_logs
where created_at > now() - interval '24 hours'
  and event_type = 'message_processed';
```

### Error count by type (last 24 hours)
```sql
select
  event_type,
  count(*) as count
from event_logs
where created_at > now() - interval '24 hours'
  and event_type in ('ai_error', 'webhook_error')
group by event_type;
```

## Monitoring Checklist

- [ ] Sentry project created & DSN configured
- [ ] Bridge running with Sentry init
- [ ] Event logs table migrated to Supabase
- [ ] Telegram bot token & chat ID configured for alerts
- [ ] Health check token generated & used by monitors
- [ ] Monitor tool (e.g., UptimeRobot) pings `/health/simple` every 5 minutes
- [ ] Admin dashboard set up to view metrics

## Troubleshooting

**Events not appearing in Sentry:**
- Check `SENTRY_DSN` is correct and project exists
- Verify network can reach `ingest.sentry.io`
- Check browser console for Sentry errors (client)

**Event logs not being inserted:**
- Verify migration ran: `select * from event_logs limit 1;`
- Check Supabase RLS policies allow service role insert
- Check app can access `SUPABASE_SERVICE_KEY`

**Health check failing:**
- Verify bridge is running: `ps aux | grep whatsapp-worker`
- Check `HEALTH_TOKEN` matches header sent in request
- Verify port `WHATSAPP_BRIDGE_PORT` is open

**Telegram alerts not sending:**
- Verify bot token is valid & bot is in chat
- Check chat ID is correct
- Verify network can reach `api.telegram.org`
