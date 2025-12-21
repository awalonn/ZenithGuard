import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';

export default defineConfig({
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                // Background
                // Background
                background: path.resolve(__dirname, 'src/js/background/background.ts'),

                // Content Scripts (Bundled) - Moved to vite.content.config.js
                // content_bundle: path.resolve(__dirname, 'src/js/content/content-bundle.ts'),

                // Pages
                popup: path.resolve(__dirname, 'src/pages/popup.html'),
                settings: path.resolve(__dirname, 'src/pages/settings.html'),
                welcome: path.resolve(__dirname, 'src/pages/welcome.html'),
                onboarding: path.resolve(__dirname, 'src/pages/onboarding.html'),
                whats_new: path.resolve(__dirname, 'src/pages/whats_new.html'),
                logger: path.resolve(__dirname, 'src/pages/logger.html'),
                analyzer: path.resolve(__dirname, 'src/pages/analyzer.html'),

                // Blocked Page
                blocked: path.resolve(__dirname, 'src/pages/blocked.html'),
                focus_blocked: path.resolve(__dirname, 'src/pages/focus_blocked.html'),

                // Dynamic Scripts (Must be compiled from TS)
                yt_interceptor: path.resolve(__dirname, 'src/js/content/yt_interceptor.ts'),
                policy_finder: path.resolve(__dirname, 'src/js/content/policy_finder.ts'),
            },
            output: {
                entryFileNames: 'js/[name].js',
                chunkFileNames: 'js/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash].[ext]',
            },
        },
    },
    plugins: [
        viteStaticCopy({
            targets: [
                {
                    src: 'src/manifest.json',
                    dest: '.',
                    transform: (content) => {
                        const manifest = JSON.parse(content);

                        // Fix Background Script Path
                        manifest.background.service_worker = 'js/background.js';

                        // Fix Content Script Path
                        manifest.content_scripts[0].js = ['js/content_bundle.js'];

                        // Fix Web Accessible Resources Paths
                        const resources = manifest.web_accessible_resources[0].resources;
                        manifest.web_accessible_resources[0].resources = resources.map(r => {
                            // The source paths in manifest.json are relative to src/ (e.g. js/content/yt_interceptor.js)
                            if (r === 'js/content/yt_interceptor.js') return 'js/yt_interceptor.js';
                            if (r === 'js/content/policy_finder.js') return 'js/policy_finder.js';
                            if (r.startsWith('pages/')) return 'src/' + r;
                            return r;
                        });

                        // Fix Action and Options Page Paths
                        if (manifest.action && manifest.action.default_popup) {
                            manifest.action.default_popup = 'src/' + manifest.action.default_popup;
                        }
                        if (manifest.options_page) {
                            manifest.options_page = 'src/' + manifest.options_page;
                        }

                        return JSON.stringify(manifest, null, 2);
                    }
                },
                { src: 'src/icons', dest: '.' },
                { src: 'src/rulesets', dest: '.' },
                { src: 'src/_locales', dest: '.' },
                { src: 'src/css', dest: '.' },
            ]
        }),
    ],
});
