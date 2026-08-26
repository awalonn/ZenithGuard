import fs from "node:fs";
import path from "node:path";
import { AUXILIARY_ENTRY_DEFINITIONS } from "./auxiliary_entries.mjs";

const rootDir = process.cwd();

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
}

function requirePath(relativePath, errors, label = relativePath) {
    if (!fs.existsSync(path.join(rootDir, relativePath))) {
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

function collectRootArtifactErrors(errors) {
    const staleRootArtifacts = [
        ["assets", "Vite asset output belongs under dist/assets"],
        ["js", "compiled extension scripts belong under dist/js"],
        ["_metadata", "Chrome unpacked-extension metadata belongs under dist/_metadata only"],
    ];

    for (const [relativePath, reason] of staleRootArtifacts) {
        if (fs.existsSync(path.join(rootDir, relativePath))) {
            errors.push(`Unexpected root build artifact '${relativePath}'. ${reason}.`);
        }
    }
}

function collectManifestSurfaceErrors(manifest) {
    const errors = [];
    const auxiliaryEntriesByOutput = new Map(
        AUXILIARY_ENTRY_DEFINITIONS.map((definition) => [definition.outFile, definition]),
    );

    if (auxiliaryEntriesByOutput.size !== AUXILIARY_ENTRY_DEFINITIONS.length) {
        errors.push("Duplicate auxiliary entry outFile values found in scripts/auxiliary_entries.mjs");
    }

    requirePath("package.json", errors);
    requirePath("vite.config.js", errors);
    requirePath("vite.content.config.js", errors);
    requirePath("scripts/build_auxiliary_entries.mjs", errors);
    requirePath("scripts/auxiliary_entries.mjs", errors);
    requirePath("rules/trackers.json", errors, "bundled tracker metadata");
    requirePath("rules/youtube_rules.json", errors, "bundled YouTube rules payload");
    requirePath("rules/malware_seed.json", errors, "bundled malware seed");

    if (manifest.background?.service_worker) {
        const workerPath = manifest.background.service_worker;
        if (!workerPath.startsWith("js/")) {
            errors.push(`Unexpected background worker path: ${workerPath}`);
        }
    } else {
        errors.push("Manifest is missing background.service_worker");
    }

    if (manifest.action?.default_popup) {
        requirePath(manifest.action.default_popup, errors, "default popup page");
    } else {
        errors.push("Manifest is missing action.default_popup");
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
        requirePath(iconPath, errors, "manifest icon");
    }

    if (manifest.options_page) {
        requirePath(manifest.options_page, errors, "options page");
    } else {
        errors.push("Manifest is missing options_page");
    }

    const dnrResources = manifest.declarative_net_request?.rule_resources;
    if (Array.isArray(dnrResources)) {
        for (const resource of dnrResources) {
            if (typeof resource?.path === "string") {
                requirePath(resource.path, errors, `DNR ruleset '${resource.id || "unknown"}'`);
            }
        }
    }

    for (const contentScript of manifest.content_scripts || []) {
        for (const cssPath of contentScript.css || []) {
            requirePath(cssPath, errors, "content script CSS");
        }

        for (const jsPath of contentScript.js || []) {
            if (!jsPath.startsWith("js/")) {
                errors.push(`Unexpected content script path: ${jsPath}`);
            }
        }
    }

    const mainContentScript = (manifest.content_scripts || [])
        .find((contentScript) => (contentScript.js || []).includes("js/content_bundle.js"));
    if (!mainContentScript) {
        errors.push("Manifest is missing the main content bundle registration");
    } else if (mainContentScript.all_frames !== false) {
        errors.push("Main content bundle must stay top-frame-only to avoid multiplying startup observers across restored iframes");
    }

    for (const resourceGroup of manifest.web_accessible_resources || []) {
        for (const resourcePath of resourceGroup.resources || []) {
            if (resourcePath.startsWith("css/")) {
                requirePath(resourcePath, errors, "web accessible CSS");
            }

        }
    }

    const expectedOutputs = new Set(AUXILIARY_ENTRY_DEFINITIONS.map((definition) => definition.outFile));
    expectedOutputs.add(manifest.background?.service_worker);
    for (const contentScript of manifest.content_scripts || []) {
        for (const jsPath of contentScript.js || []) {
            expectedOutputs.add(jsPath);
        }
    }
    for (const resourceGroup of manifest.web_accessible_resources || []) {
        for (const resourcePath of resourceGroup.resources || []) {
            if (resourcePath.startsWith("js/")) {
                expectedOutputs.add(resourcePath);
            }
        }
    }

    for (const output of expectedOutputs) {
        if (!output) {
            continue;
        }

        const match = auxiliaryEntriesByOutput.get(output);
        if (!match) {
            errors.push(`No auxiliary entry definition found for expected output ${output}`);
            continue;
        }

        requirePath(match.entry, errors, `source entry for ${output}`);
    }

    for (const definition of AUXILIARY_ENTRY_DEFINITIONS) {
        if (!expectedOutputs.has(definition.outFile)) {
            errors.push(`Auxiliary entry output ${definition.outFile} is not referenced by manifest.json`);
        }
    }

    return errors;
}

function collectPageEntryErrors(errors) {
    const pagePaths = listSourcePagePaths();
    if (pagePaths.length === 0) {
        errors.push("No extension pages found under src/pages");
    }

    for (const htmlPath of pagePaths) {
        requirePath(htmlPath, errors, "extension page");
        const absolutePath = path.join(rootDir, htmlPath);
        if (!fs.existsSync(absolutePath)) {
            continue;
        }

        const html = fs.readFileSync(absolutePath, "utf8");
        const assetMatches = Array.from(
            html.matchAll(/(?:href|src)=["'](\/(?:css|icons|src)\/[^"']+)["']/g),
        );
        const moduleScriptEntries = [];

        for (const match of assetMatches) {
            const webPath = match[1];
            if (!webPath) {
                continue;
            }

            const relativeAssetPath = webPath.replace(/^\//, "");
            requirePath(relativeAssetPath, errors, `${htmlPath} linked asset`);
            if (relativeAssetPath.startsWith("src/") && relativeAssetPath.endsWith(".ts")) {
                moduleScriptEntries.push(relativeAssetPath);
            }
        }

        if (moduleScriptEntries.length === 0) {
            errors.push(`Expected ${htmlPath} to reference a source module script under /src`);
        }
    }
}

const manifest = readJson("manifest.json");
const packageJson = readJson("package.json");
const errors = collectManifestSurfaceErrors(manifest);

collectRootArtifactErrors(errors);
collectPageEntryErrors(errors);

if (manifest.version !== packageJson.version) {
    errors.push(
        `Version mismatch between manifest.json (${manifest.version}) and package.json (${packageJson.version})`,
    );
}

if (errors.length > 0) {
    console.error("ZenithGuard extension surface check failed:\n");
    for (const error of errors) {
        console.error(`- ${error}`);
    }
    process.exit(1);
}

console.log("ZenithGuard extension surface looks aligned.");
