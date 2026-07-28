import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import configs from "../vite.content.config.js";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const targetOutDir = process.argv[2] || "dist";
const reservedOutputNames = ["_metadata"];

function removeReservedOutputPaths(baseDir) {
    for (const name of reservedOutputNames) {
        const reservedPath = path.join(baseDir, name);
        if (fs.existsSync(reservedPath)) {
            fs.rmSync(reservedPath, { recursive: true, force: true });
        }
    }
}

const resolvedOutDir = path.isAbsolute(targetOutDir)
    ? targetOutDir
    : path.resolve(rootDir, targetOutDir);

removeReservedOutputPaths(resolvedOutDir);

for (const config of configs) {
    const nextConfig = {
        ...config,
        build: {
            ...config.build,
            outDir: resolvedOutDir,
        },
    };

    await build(nextConfig);
}

removeReservedOutputPaths(resolvedOutDir);

console.log(`Built ZenithGuard auxiliary entries into ${targetOutDir}`);
