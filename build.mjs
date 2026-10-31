import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';

const minify = process.argv.includes('--minify');

await mkdir('dist', { recursive: true });

await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  outfile: 'dist/ai-agent.js',
  format: 'iife',
  globalName: 'OpenBlocksAIAgentBundle',
  platform: 'browser',
  target: ['es2020'],
  loader: {
    '.css': 'text'
  },
  sourcemap: true,
  minify,
  legalComments: 'none',
  logLevel: 'info'
});

console.log(`Built dist/ai-agent.js${minify ? ' (minified)' : ''}`);
