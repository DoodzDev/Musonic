/**
 * @file vite.config.ts
 * @description Vite configuration of the administration console. In development the API
 *   (`/v1`, `/rest`, `/health`) is forwarded to a Musonic Server: `MUSONIC_SERVER`
 *   (default http://127.0.0.1:4533). Built, the console is served by the server itself.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const server = process.env.MUSONIC_SERVER || 'http://127.0.0.1:4533'
const version = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version

export default defineConfig({
  define: { __MUSONIC_ADMIN_VERSION__: JSON.stringify(version) },
  plugins: [react()],
  server: {
    port: 5174,
    proxy: Object.fromEntries(['/v1', '/rest', '/health'].map((p) => [p, { target: server, changeOrigin: true, ws: true }])),
  },
})
