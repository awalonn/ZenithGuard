import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const distDirArg = process.argv[2] || "dist";
const distDir = path.resolve(rootDir, distDirArg);

function readJson(absolutePath) {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

function requireDistPath(relativePath, errors, label = relativePath) {
    if (!fs.existsSync(path.join(distDir, relativePath))) {
        errors.push(`Missing ${label}: ${relativePath}`);
    }
}

function listSourcePagePaths() {
    const sourcePageDir = path.join(rootDir, "src/pages");
    if (!fs.existsSync(sourcePageDir)) {
        return [];
    }

    return fs.readdirSync(sourcePageDir)
        .filter((fileName) => fileName.endsWith(".html"))
        .sort()
        .map((fileName) => path.join("src/pages", fileName).replaceAll("\\", "/"));
}

function getManifestIconPaths(manifest) {
    const iconPaths = new Set();
    for (const iconPath of Object.values(manifest.icons || {})) {
        if (typeof iconPath === "string") {
            iconPaths.add(iconPath);
        }
    }
    for (const iconPath of Object.values(manifest.action?.default_icon || {})) {
        if (typeof iconPath === "string") {
            iconPaths.add(iconPath);
        }
    }
    return [...iconPaths];
}

function collectReservedNameWarnings(warnings) {
    const reservedNames = ["_metadata"];
    for (const name of reservedNames) {
        if (fs.existsSync(path.join(distDir, name))) {
            warnings.push(`Ignoring Chrome-generated unpacked-extension path in dist: ${name}`);
        }
    }
}

function collectManifestOutputErrors(manifest) {
    const errors = [];

    requireDistPath("manifest.json", errors);

    if (manifest.background?.service_worker) {
        requireDistPath(manifest.background.service_worker, errors, "background worker");
    } else {
        errors.push("Manifest is missing background.service_worker");
    }

    if (manifest.action?.default_popup) {
        requireDistPath(manifest.action.default_popup, errors, "default popup page");
    } else {
        errors.push("Manifest is missing action.default_popup");
    }

    if (manifest.options_page) {
        requireDistPath(manifest.options_page, errors, "options page");
    } else {
        errors.push("Manifest is missing options_page");
    }

    for (const contentScript of manifest.content_scripts || []) {
        for (const cssPath of contentScript.css || []) {
            requireDistPath(cssPath, errors, "content script CSS");
        }

        for (const jsPath of contentScript.js || []) {
            requireDistPath(jsPath, errors, "content script JS");
        }
    }

    for (const resource of manifest.declarative_net_request?.rule_resources || []) {
        if (typeof resource?.path === "string") {
            requireDistPath(resource.path, errors, `DNR ruleset '${resource.id || "unknown"}'`);
        }
    }

    for (const resourceGroup of manifest.web_accessible_resources || []) {
        for (const resourcePath of resourceGroup.resources || []) {
            requireDistPath(resourcePath, errors, "web accessible resource");
        }
    }

    if (!manifest.action?.default_icon || Object.keys(manifest.action.default_icon).length === 0) {
        errors.push("Manifest is missing action.default_icon");
    }

    if (!manifest.icons || Object.keys(manifest.icons).length === 0) {
        errors.push("Manifest is missing icons");
    }

    for (const [size, iconPath] of Object.entries(manifest.action?.default_icon || {})) {
        if (typeof iconPath === "string" && typeof manifest.icons?.[size] === "string" && manifest.icons[size] !== iconPath) {
            errors.push(`Manifest action.default_icon[${size}] does not match icons[${size}]`);
        }
    }

    for (const iconPath of getManifestIconPaths(manifest)) {
        requireDistPath(iconPath, errors, "manifest icon");
    }

    const sourcePagePaths = listSourcePagePaths();
    for (const pagePath of sourcePagePaths) {
        requireDistPath(pagePath, errors, "built extension page");
    }

    return errors;
}

function collectBuiltHtmlAssetErrors(errors) {
    const pageDir = path.join(distDir, "src/pages");
    if (!fs.existsSync(pageDir)) {
        errors.push("Missing built page directory: src/pages");
        return;
    }

    const sourcePagePaths = new Set(listSourcePagePaths());

    for (const fileName of fs.readdirSync(pageDir)) {
        if (!fileName.endsWith(".html")) {
            continue;
        }

        const relativePagePath = path.join("src/pages", fileName);
        const normalizedPagePath = relativePagePath.replaceAll("\\", "/");
        if (sourcePagePaths.size > 0 && !sourcePagePaths.has(normalizedPagePath)) {
            errors.push(`Built page has no matching source page: ${normalizedPagePath}`);
        }

        const absolutePagePath = path.join(pageDir, fileName);
        const html = fs.readFileSync(absolutePagePath, "utf8");
        const assetMatches = Array.from(
            html.matchAll(/(?:href|src)=["'](\/?[^"']+\.(?:css|js|png|svg))["']/g),
        );

        for (const match of assetMatches) {
            const assetPath = match[1]?.replace(/^\//, "");
            if (!assetPath) {
                continue;
            }

            requireDistPath(assetPath, errors, `${relativePagePath} linked asset`);
        }
    }
}

if (!fs.existsSync(distDir)) {
    console.error(`Build output directory does not exist: ${distDir}`);
    process.exit(1);
}

const manifestPath = path.join(distDir, "manifest.json");
if (!fs.existsSync(manifestPath)) {
    console.error(`Missing built manifest: ${manifestPath}`);
    process.exit(1);
}

const manifest = readJson(manifestPath);
const errors = collectManifestOutputErrors(manifest);
const warnings = [];
collectReservedNameWarnings(warnings);
collectBuiltHtmlAssetErrors(errors);

if (errors.length > 0) {
    console.error("ZenithGuard dist surface check failed:\n");
    for (const error of errors) {
        console.error(`- ${error}`);
    }
    process.exit(1);
}

for (const warning of warnings) {
    console.warn(`- ${warning}`);
}

console.log(`ZenithGuard dist surface looks aligned: ${path.relative(rootDir, distDir) || "."}`);
