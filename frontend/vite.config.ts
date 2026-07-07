import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Ports must stay env-overridable: parallel agent worktrees each get a
// derived port pair (see .claude/skills/foreman/SKILL.md) and must never
// collide with the primary checkout's defaults (5173 / 8000).
const webPort = Number(process.env.WEB_PORT) || 5173
const orchPort = Number(process.env.ORCH_PORT) || 8000

export default defineConfig({
  plugins: [react()],
  server: {
    port: webPort,
    strictPort: true,
    proxy: {
      '/api': `http://localhost:${orchPort}`,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
