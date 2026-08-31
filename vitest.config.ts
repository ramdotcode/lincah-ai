import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Alias @/ mengikuti tsconfig, supaya route handler (yang meng-import
// '@/lib/...') bisa di-unit-test dengan vi.mock.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
  },
});
