import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, open: false },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4096,
  },
  // Ammo is not an npm dependency — it is vendored in public/lib/ammo and
  // loaded at runtime by pc.WasmModule, so nothing here needs to pre-bundle it.
});
