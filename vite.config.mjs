import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const worker = readFileSync(new URL('./src/offline-worker.js', import.meta.url), 'utf8');

export default defineConfig({
  base: './',
  plugins: [{
    name: 'pocketbrief-offline',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter(name => name === 'index.html' || /\.(?:js|css)$/.test(name))
        .sort();
      if (!files.includes('index.html')) this.error('Could not find the PocketBrief app shell.');
      const hash = createHash('sha256').update(worker);
      for (const name of files) {
        const file = bundle[name];
        hash.update(name).update(file.type === 'chunk' ? file.code : file.source);
      }
      const version = hash.digest('hex').slice(0, 16);
      this.emitFile({
        type: 'asset',
        fileName: 'offline-worker.js',
        source: `const BUILD = ${JSON.stringify(version)};\nconst FILES = ${JSON.stringify(files)};\n${worker}`,
      });
    },
  }],
});
