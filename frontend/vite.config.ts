import { existsSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Connect, type Plugin } from 'vite'

const publicDir = fileURLToPath(new URL('./public', import.meta.url))

// The speech library probes for optional model files. Vite answers an unknown path with
// index.html, which the library then tries to read as a model config and fails. A model
// file that is not on disk must be a plain 404.
function missingModelFilesAre404(): Plugin {
  const guard: Connect.NextHandleFunction = (req, res, next) => {
    const path = decodeURIComponent((req.url ?? '').split('?')[0])
    if (/^\/(models|ort)\//.test(path) && !existsSync(publicDir + path)) {
      res.statusCode = 404
      res.end('Not found')
      return
    }
    next()
  }
  return {
    name: 'missing-model-files-are-404',
    configureServer: (server) => void server.middlewares.use(guard),
    configurePreviewServer: (server) => void server.middlewares.use(guard),
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), missingModelFilesAre404()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
