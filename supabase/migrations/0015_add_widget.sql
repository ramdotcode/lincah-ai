-- Live chat widget (Fase E3): channel webchat yang bisa di-embed di website
-- pelanggan. Percakapan masuk ke tabel conversations dengan platform 'webchat'.

alter table bots
  add column if not exists widget_enabled boolean default false;
