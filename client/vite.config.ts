import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

/**
 * The dev server proxies /api to the local Express process, which is the exact
 * arrangement `vercel.json` creates in production by rewriting /api to Render.
 *
 * Keeping both environments same-origin is deliberate: it is what lets the
 * refresh token live in a SameSite=Lax httpOnly cookie instead of a
 * third-party SameSite=None one that Safari and Brave would drop.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.DEV_API_PROXY_TARGET ?? 'http://127.0.0.1:5000';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: false,
          ws: true,
        },
      },
    },
    preview: {
      port: 4173,
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          /**
           * Split the heavy, rarely-changing dependencies into their own
           * chunks. Recharts alone is ~400KB and is not needed to render the
           * login screen, so bundling it with app code would make every first
           * paint pay for it.
           *
           * Vite 8 runs on Rolldown, which replaces Rollup's `manualChunks`
           * with `codeSplitting.groups`.
           */
          codeSplitting: {
            groups: [
              { name: 'vendor-charts', test: /node_modules[\/](recharts|d3-|victory-)/ },
              {
                name: 'vendor-markdown',
                test: /node_modules[\/](react-markdown|remark-|micromark|mdast-|unist-|hast-|vfile)/,
              },
              {
                name: 'vendor-react',
                test: /node_modules[\/](react|react-dom|react-router|react-router-dom|scheduler)[\/]/,
              },
              { name: 'vendor', test: /node_modules/ },
            ],
          },
        },
      },
    },
  };
});
