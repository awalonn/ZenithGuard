import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { AUXILIARY_ENTRY_DEFINITIONS } from "./scripts/auxiliary_entries.mjs";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

function createSingleEntryConfig({
    entry,
    outFile,
    format,
    name,
}) {
    return defineConfig({
        build: {
            outDir: "dist",
            emptyOutDir: false,
            rollupOptions: {
                input: path.resolve(rootDir, entry),
                output: {
                    format,
                    ...(format === "iife" ? { name: name || "ZenithGuardRuntime" } : {}),
                    inlineDynamicImports: true,
                    entryFileNames: outFile,
                    assetFileNames: "assets/[name]-[hash][extname]",
                },
            },
        },
    });
}

export default AUXILIARY_ENTRY_DEFINITIONS.map((definition) =>
    createSingleEntryConfig(definition),
);
