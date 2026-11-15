import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
    base: process.env["VITE_BASE"] || "/",
    plugins: [
        react(),
        VitePWA({
            registerType: "autoUpdate",
            injectRegister: "script-defer",
            includeAssets: ["favicon.svg", "apple-touch-icon.png"],
            manifest: {
                id: "/",
                name: "Groceries",
                short_name: "Groceries",
                start_url: "/",
                scope: "/",
                display: "standalone",
                background_color: "#F2F2F7",
                theme_color: "#F2F2F7",
                icons: [
                    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
                    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
                    { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
                ],
            },
            workbox: {
                globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
                navigateFallback: "/index.html",
                navigateFallbackDenylist: [/^\/api\//],
                skipWaiting: true,
                clientsClaim: true,
                cleanupOutdatedCaches: true,
                // /api/list and /api/ops are deliberately not routed: always network.
                runtimeCaching: [
                    {
                        urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/photos/"),
                        handler: "CacheFirst",
                        method: "GET",
                        options: {
                            cacheName: "photos",
                            expiration: { maxEntries: 400 },
                            cacheableResponse: { statuses: [200] },
                        },
                    },
                ],
            },
        }),
    ],
    build: {
        outDir: "dist/client",
        emptyOutDir: true,
    },
    server: {
        port: parseInt(process.env["FLING_VITE_PORT"] || "5173", 10),
        strictPort: true,
        watch: {
            ignored: ["**/.fling/**"],
        },
        proxy: {
            "/api": {
                target: `http://localhost:${process.env["FLING_DEV_PORT"] || "3210"}`,
                changeOrigin: true,
            },
        },
    },
});
