const fs = require("node:fs");
const path = require("node:path");

const manifestPath = process.argv[2];
if (!manifestPath) {
    throw new Error("Expected manifest path argument.");
}

const resolvedPath = path.resolve(manifestPath);
const manifest = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));

manifest.browser_specific_settings = manifest.browser_specific_settings || {
    gecko: {
        id: "zenithguard@local",
        strict_min_version: "128.0",
    },
};

fs.writeFileSync(resolvedPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Prepared Firefox manifest at ${resolvedPath}`);
