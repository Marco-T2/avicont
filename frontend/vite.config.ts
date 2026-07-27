import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
// defineConfig de vitest/config incluye los types del bloque `test` además
// de los de Vite — unifica la configuración dev/build/test en un solo archivo.
import { defineConfig } from 'vitest/config';

// Dev proxy: /api → backend en localhost:3000. Same-origin en el browser,
// la cookie httpOnly (refreshToken) viaja naturalmente. En prod se resuelve
// con Nginx/Caddy apuntando al mismo dominio.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  // `preview` NO hereda `server.proxy`: son dos servidores distintos. Sin esto,
  // el build servido con `vite preview` manda /api al propio :4173 y recibe el
  // index.html — el síntoma es un login que falla sin decir por qué.
  // Lo usa el gate de UI, que corre contra el build y no contra el dev server.
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});
