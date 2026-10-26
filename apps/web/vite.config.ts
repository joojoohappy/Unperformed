import react from "@vitejs/plugin-react";
import type { ServerResponse } from "node:http";
import { defineConfig, type ProxyOptions } from "vite";

// The Live AI service (services/ai) listens on 8787 by default. In development
// the browser talks to it through this proxy, so the API key never reaches the client.
const aiTarget = process.env["UNPERFORMED_AI_URL"] ?? "http://127.0.0.1:8787";

const api: ProxyOptions = {
  target: aiTarget,
  changeOrigin: true,
  // When the AI service is not running, answer quietly instead of a proxy 500:
  // the health check reports "offline" and the studio stays in demo mode.
  configure: (proxy) => {
    proxy.on("error", (_err, req, res) => {
      const r = res as ServerResponse;
      if (r.headersSent) return;
      const offline = req.url?.endsWith("/health");
      r.writeHead(offline ? 200 : 503, { "content-type": "application/json" });
      r.end(JSON.stringify(offline ? { status: "offline" } : { detail: { code: "service_offline", detail: "Live AI service is not running" } }));
    });
  }
};

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": api } },
  preview: { port: 4173, proxy: { "/api": api } },
  build: { target: "es2022", chunkSizeWarningLimit: 900 },
  test: { environment: "node", include: ["src/**/*.test.ts"] }
});
