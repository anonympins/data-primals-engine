import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from "node:url";

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    base: "/",
    build: {
        outDir: "dist"
    },
    server : {
        proxy: {
            '/api': {
                target: 'http://localhost:7633',
                secure: false,
                changeOrigin: true,
                // Optionnel mais utile pour le débogage :
                // Affiche les requêtes proxy dans la console de Vite.
                configure: (proxy, options) => {
                    proxy.on('proxyReq', (proxyReq, req, res) => {
                        console.log(`[Vite Proxy] Forwarding request: ${req.method} ${req.url} -> ${options.target}${proxyReq.path}`);
                    });
                }
            }
        }
    },
    resolve: {
        alias: {
            '@modules': fileURLToPath(new URL('../src/modules', import.meta.url)),
            '@client': fileURLToPath(new URL('./src', import.meta.url))
        }
    },
    fs: {
        allow: ["./src", "../src"]
    }
})
