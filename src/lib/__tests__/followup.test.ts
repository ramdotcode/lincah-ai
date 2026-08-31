import { describe, it, expect } from 'vitest';
import {
  isFollowupCandidate,
  renderFollowupTemplate,
  randomJitterMs,
  DEFAULT_FOLLOWUP_TEMPLATE,
  FOLLOWUP_SCHEDULE_HOURS,
} from '../followup';

const NOW = new Date('2026-07-10T12:00:00Z');
const HOURS = 60 * 60 * 1000;
const agoHours = (h: number) => new Date(NOW.getTime() - h * HOURS).toISOString();

const bot = {
  followup_enabled: true,
  followup_delay_hours: 24,
  followup_max_count: 2,
  followup_stages: ['interested', 'negotiating'],
};

// Idle 80 jam: melewati jadwal attempt pertama (72 jam, Patch 4)
const conv = {
  status: 'active',
  stage: 'interested',
  last_message_at: agoHours(80),
};

describe('isFollowupCandidate', () => {
  it('lead interested yang idle melewati delay adalah kandidat', () => {
    expect(isFollowupCandidate(conv, bot, 0, NOW)).toBe(true);
  });

  it('bukan kandidat jika follow-up dimatikan', () => {
    expect(isFollowupCandidate(conv, { ...bot, followup_enabled: false }, 0, NOW)).toBe(false);
  });

  it('bukan kandidat jika belum melewati delay (pelanggan baru balas)', () => {
    expect(isFollowupCandidate({ ...conv, last_message_at: agoHours(2) }, bot, 0, NOW)).toBe(false);
  });

  it('bukan kandidat jika status pending (handoff)', () => {
    expect(isFollowupCandidate({ ...conv, status: 'pending' }, bot, 0, NOW)).toBe(false);
  });

  it('bukan kandidat jika status closed', () => {
    expect(isFollowupCandidate({ ...conv, status: 'closed' }, bot, 0, NOW)).toBe(false);
  });

  it('bukan kandidat jika stage di luar followup_stages', () => {
    expect(isFollowupCandidate({ ...conv, stage: 'new' }, bot, 0, NOW)).toBe(false);
    expect(isFollowupCandidate({ ...conv, stage: 'won' }, bot, 0, NOW)).toBe(false);
    expect(isFollowupCandidate({ ...conv, stage: 'lost' }, bot, 0, NOW)).toBe(false);
  });

  it('ignoreStage=true (dipicu label) melewati gate stage', () => {
    // stage 'new' di luar followup_stages, tapi dipicu label → tetap kandidat
    expect(isFollowupCandidate({ ...conv, stage: 'new' }, bot, 0, NOW, { ignoreStage: true })).toBe(true);
    // gate lain tetap berlaku walau ignoreStage
    expect(isFollowupCandidate({ ...conv, stage: 'new', status: 'pending' }, bot, 0, NOW, { ignoreStage: true })).toBe(false);
    expect(isFollowupCandidate({ ...conv, stage: 'new' }, bot, 2, NOW, { ignoreStage: true })).toBe(false);
  });

  it('bukan kandidat jika sudah mencapai max_count', () => {
    expect(isFollowupCandidate(conv, bot, 2, NOW)).toBe(false);
    expect(isFollowupCandidate(conv, bot, 1, NOW)).toBe(true);
  });

  it('bukan kandidat tanpa last_message_at', () => {
    expect(isFollowupCandidate({ ...conv, last_message_at: null }, bot, 0, NOW)).toBe(false);
  });

  it('pakai default stages jika konfigurasi kosong', () => {
    expect(isFollowupCandidate(conv, { ...bot, followup_stages: null }, 0, NOW)).toBe(true);
  });

  it('attempt di luar jadwal: pakai default delay 24 jam jika delay bot null', () => {
    const b = { ...bot, followup_delay_hours: null, followup_max_count: 5 };
    expect(isFollowupCandidate({ ...conv, last_message_at: agoHours(23) }, b, 2, NOW)).toBe(false);
    expect(isFollowupCandidate({ ...conv, last_message_at: agoHours(25) }, b, 2, NOW)).toBe(true);
  });
});

// Patch 4 (SETUP-Ramcode-CTWA §F): follow-up H+3 lalu H+5, bukan H+3 lalu H+6
describe('jadwal per-attempt FOLLOWUP_SCHEDULE_HOURS (Patch 4)', () => {
  it('jadwalnya H+3 lalu 2 hari kemudian (total H+5)', () => {
    expect(FOLLOWUP_SCHEDULE_HOURS).toEqual([72, 48]);
  });

  it('follow-up pertama menunggu 72 jam idle', () => {
    expect(isFollowupCandidate({ ...conv, last_message_at: agoHours(71) }, bot, 0, NOW)).toBe(false);
    expect(isFollowupCandidate({ ...conv, last_message_at: agoHours(73) }, bot, 0, NOW)).toBe(true);
  });

  it('follow-up kedua cukup menunggu 48 jam setelah yang pertama', () => {
    expect(isFollowupCandidate({ ...conv, last_message_at: agoHours(47) }, bot, 1, NOW)).toBe(false);
    expect(isFollowupCandidate({ ...conv, last_message_at: agoHours(49) }, bot, 1, NOW)).toBe(true);
  });

  it('jadwal menang atas followup_delay_hours bot untuk attempt yang tercakup', () => {
    const b = { ...bot, followup_delay_hours: 24 };
    // idle 30 jam sudah melewati delay bot (24), tapi jadwal attempt pertama 72
    expect(isFollowupCandidate({ ...conv, last_message_at: agoHours(30) }, b, 0, NOW)).toBe(false);
  });

  it('attempt ke-3 dst jatuh kembali ke followup_delay_hours bot', () => {
    const b = { ...bot, followup_delay_hours: 24, followup_max_count: 5 };
    expect(isFollowupCandidate({ ...conv, last_message_at: agoHours(23) }, b, 2, NOW)).toBe(false);
    expect(isFollowupCandidate({ ...conv, last_message_at: agoHours(25) }, b, 2, NOW)).toBe(true);
  });
});

describe('renderFollowupTemplate', () => {
  it('mengganti placeholder {nama}', () => {
    expect(renderFollowupTemplate('Halo {nama}, masih minat?', { nama: 'Budi' }))
      .toBe('Halo Budi, masih minat?');
  });

  it('mengganti {nama} berulang', () => {
    expect(renderFollowupTemplate('{nama}, {nama}!', { nama: 'Budi' })).toBe('Budi, Budi!');
  });

  it('fallback ke "Kak" jika nama kosong', () => {
    expect(renderFollowupTemplate('Halo {nama}', { nama: null })).toBe('Halo Kak');
  });

  it('pakai template default jika template null/kosong', () => {
    expect(renderFollowupTemplate(null, { nama: 'Budi' }))
      .toBe(DEFAULT_FOLLOWUP_TEMPLATE.replaceAll('{nama}', 'Budi'));
    expect(renderFollowupTemplate('  ', { nama: 'Budi' }))
      .toBe(DEFAULT_FOLLOWUP_TEMPLATE.replaceAll('{nama}', 'Budi'));
  });
});

describe('randomJitterMs', () => {
  it('selalu dalam rentang 5–30 detik', () => {
    for (let i = 0; i < 100; i++) {
      const v = randomJitterMs();
      expect(v).toBeGreaterThanOrEqual(5000);
      expect(v).toBeLessThanOrEqual(30000);
    }
  });
});
