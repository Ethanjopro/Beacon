import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const server = process.env.BEACON_SERVER_URL ?? "http://localhost:8787";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true, // reachable from a real phone on the same Wi-Fi
    proxy: { "/api": { target: server, changeOrigin: true } },
  },
});
