import { context } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { startServer } from './serve.mjs';

await mkdir('dist', { recursive: true });

const ctx = await context({
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
  legalComments: 'none',
  logLevel: 'info'
});

await ctx.watch();
console.log('Watching src/ for changes...');

startServer(Number(process.env.PORT || 8000));
