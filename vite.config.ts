import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendPort = env.PORT || '9000';
  const isProduction = mode === 'production';

  return {
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    sourcemap: false,
    // Switched from terser to esbuild's built-in minifier: terser's peak memory
    // usage on this bundle was reliably OOM-killing production builds on this
    // host (confirmed via direct memory monitoring during a failed build —
    // available memory dropped from 3.3GB to under 100MB during "rendering
    // chunks" specifically, the minification step). esbuild's minifier is
    // dramatically lighter and is itself a production-grade minifier used as
    // Vite's own default; net output behavior (console/debugger stripping in
    // production) is preserved via the `esbuild.drop` option below.
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  esbuild: {
    drop: isProduction ? ['console', 'debugger'] : [],
  },
  json: {
    stringify: false,
  },
  server: {
    port: parseInt(backendPort),
    host: true,
    allowedHosts: true,
    hmr: {
      overlay: false,
      port: parseInt(backendPort) + 1,
    },
    proxy: {
      '/api': {
        target: `http://localhost:${parseInt(backendPort) + 100}`,
        changeOrigin: true,
        secure: false,
      },
      '/public': {
        target: `http://localhost:${parseInt(backendPort) + 100}`,
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: `http://localhost:${parseInt(backendPort) + 100}`,
        changeOrigin: true,
        secure: false,
      },
      '/email-attachments': {
        target: `http://localhost:${parseInt(backendPort) + 100}`,
        changeOrigin: true,
        secure: false,
      },
      '/media': {
        target: `http://localhost:${parseInt(backendPort) + 100}`,
        changeOrigin: true,
        secure: false,
      },
      '/robots.txt': {
        target: `http://localhost:${parseInt(backendPort) + 100}`,
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: `ws://localhost:${parseInt(backendPort) + 100}`,
        ws: true,
        changeOrigin: true,
      },
      // Proxy country flags through our origin so VPN/proxy users don't get ERR_NAME_NOT_RESOLVED
      '/flags': {
        target: 'https://purecatamphetamine.github.io/country-flag-icons/3x2',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/flags/, ''),
      },

      '^/[a-zA-Z0-9-]+$': {
        target: `http://localhost:${parseInt(backendPort) + 100}`,
        changeOrigin: false, // Preserve original host header for subdomain detection
        secure: false,
        bypass: function (req, res, proxyOptions) {
          const host = req.headers.host || '';
          const path = req.url || '';


          const isSubdomain = host.includes('.localhost') && !host.startsWith('localhost:');


          const appRoutes = [
            '/auth', '/login', '/register', '/dashboard', '/admin', '/settings',
            '/profile', '/logout', '/inbox', '/flows', '/contacts', '/tasks', '/calendar', '/my-calendar',
            '/analytics', '/campaigns', '/pipeline', '/pages', '/users', '/billing',
            '/integrations', '/reports', '/templates', '/webhooks'
          ];
          const isAppRoute = appRoutes.includes(path) || appRoutes.some(route => path.startsWith(route + '/'));

          if (isSubdomain && !isAppRoute) {

            return null;
          } else {

            return '/index.html';
          }
        },
      },
    },
  },
  };
});
