/**
 * @file vite.config.ts
 * @description Vite configuration for the Musonic web client, with a development relay.
 *   `MUSONIC_WEB_BASE` sets the path the client is served under (default `/`;
 *   `/Musonic/app/` for the GitHub Pages build).
 * @author DoodzProg
 * @version 0.3.0
 * @license CC-BY-NC-4.0
 */

import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import { request as httpsRequest } from 'node:https'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const RELAY_PREFIX = '/__relay/'
const FORWARDED_HEADERS = ['range', 'accept', 'accept-encoding', 'if-none-match', 'if-modified-since']

/**
 * Some Subsonic servers (or proxies in front of them) send no CORS headers, so a
 * browser page cannot read their answers. In development the page calls
 * `/__relay/<protocol>/<host>/rest/...` on its own origin and this middleware
 * forwards the request to the server the user typed on the login screen.
 * Only Subsonic API paths are relayed.
 */
function subsonicRelay(): Plugin {
  return {
    name: 'musonic-subsonic-relay',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (!req.url?.startsWith(RELAY_PREFIX)) return next()
        const match = /^\/__relay\/(https?)\/([^/]+)(\/(?:[^?]*\/)?rest\/[^?]*(?:\?.*)?)$/.exec(req.url)
        if (!match || (req.method !== 'GET' && req.method !== 'HEAD')) {
          res.statusCode = 400
          res.end()
          return
        }
        const [, protocol, host, path] = match
        const headers: Record<string, string> = {}
        for (const name of FORWARDED_HEADERS) {
          const value = req.headers[name]
          if (typeof value === 'string') headers[name] = value
        }
        const send = protocol === 'https' ? httpsRequest : httpRequest
        const upstream = send(`${protocol}://${host}${path}`, { method: req.method, headers }, (answer) => {
          res.writeHead(answer.statusCode ?? 502, answer.headers)
          answer.pipe(res)
        })
        // Never log the URL: it carries the authentication token.
        upstream.on('error', (error: NodeJS.ErrnoException) => {
          server.config.logger.warn(`[relay] ${host} unreachable (${error.code ?? 'error'})`)
          if (!res.headersSent) res.statusCode = 502
          res.end()
        })
        // Stop downloading when the browser drops the request (seek, track change).
        res.on('close', () => upstream.destroy())
        upstream.end()
      })
    },
  }
}

export default defineConfig({
  base: process.env.MUSONIC_WEB_BASE || '/',
  plugins: [react(), subsonicRelay()],
})
