import { defineConfig } from "vite";

export default defineConfig({
  server: {
    allowedHosts: true,
    proxy: {
      // /api/ (スラッシュ付き) のみバックエンドに転送。/api.js は対象外
      "/api/": "http://localhost:3000",
    },
  },
});
