import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    build: {
        outDir: 'dist',
        emptyOutDir: false, // Critical: Don't wipe the main build
        lib: {
            entry: path.resolve(__dirname, 'src/js/content/content-bundle.ts'),
            name: 'ZenithGuardContent',
            fileName: () => 'js/content_bundle.js', // Force specific name
            formats: ['iife']
        },
        rollupOptions: {
            output: {
                extend: true,
                entryFileNames: 'js/content_bundle.js',
            }
        }
    }
});
