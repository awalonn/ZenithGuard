import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { viteStaticCopy } from "vite-plugin-static-copy";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const pageInputs = {
    "src/pages/popup": path.resolve(rootDir, "src/pages/popup.html"),
    "src/pages/settings": path.resolve(rootDir, "src/pages/settings.html"),
    "src/pages/analyzer": path.resolve(rootDir, "src/pages/analyzer.html"),
    "src/pages/logger": path.resolve(rootDir, "src/pages/logger.html"),
    "src/pages/whats_new": path.resolve(rootDir, "src/pages/whats_new.html"),
    "src/pages/blocked": path.resolve(rootDir, "src/pages/blocked.html"),
    "src/pages/focus_blocked": path.resolve(rootDir, "src/pages/focus_blocked.html"),
    "src/pages/welcome": path.resolve(rootDir, "src/pages/welcome.html"),
    "src/pages/onboarding": path.resolve(rootDir, "src/pages/onboarding.html"),
};

export default defineConfig({
    plugins: [
        svelte(),
        viteStaticCopy({
            targets: [
                { src: "manifest.json", dest: "." },
                { src: "css/**/*", dest: "css" },
                { src: "icons/**/*", dest: "icons" },
                { src: "rules/**/*", dest: "rules" },
                { src: "_locales/**/*", dest: "_locales" },
            ],
        }),
    ],
    build: {
        outDir: "dist",
        emptyOutDir: true,
        rollupOptions: {
            input: pageInputs,
        },
    },
});
