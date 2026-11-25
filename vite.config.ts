import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { syncModelsManifest } from './tools/sync-models.mjs';

function customModelsSyncPlugin(): Plugin {
  return {
    name: 'custom-models-glb-sync',
    async buildStart() {
      await syncModelsManifest();
    },
    configureServer(server) {
      const modelsDir = path.resolve(process.cwd(), 'models');
      server.watcher.add(modelsDir);
      const triggerSync = (filePath: string) => {
        if (/\.glb$/i.test(filePath) && filePath.startsWith(modelsDir)) {
          syncModelsManifest().catch((err: unknown) => {
            console.warn('[custom-models-glb-sync] Sync failed:', err);
          });
        }
      };
      server.watcher.on('add', triggerSync);
      server.watcher.on('change', triggerSync);
      server.watcher.on('unlink', triggerSync);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [customModelsSyncPlugin()],
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 3000,
  },
});
