import fs from "node:fs";
import path from "node:path";
import { ZipArchive } from "archiver";

const rootDir = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
const version = packageJson.version || "0.0.0";
const distDir = path.join(rootDir, "dist");
const releasesDir = path.join(rootDir, "releases");
const zipPath = path.join(releasesDir, `zenithguard-v${version}.zip`);
const reservedOutputNames = new Set(["_metadata"]);

if (!fs.existsSync(distDir)) {
    throw new Error(`dist directory not found at ${distDir}`);
}

fs.mkdirSync(releasesDir, { recursive: true });

const output = fs.createWriteStream(zipPath);
const archive = new ZipArchive({ zlib: { level: 9 } });

await new Promise((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);
    archive.glob("**/*", {
        cwd: distDir,
        dot: true,
        ignore: Array.from(reservedOutputNames).flatMap((name) => [name, `${name}/**`]),
    });
    archive.finalize();
});

console.log(`Created ${zipPath}`);
