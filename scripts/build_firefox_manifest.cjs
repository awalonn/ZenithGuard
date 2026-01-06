const fs = require('fs');
const path = require('path');

const manifestPath = process.argv[2];

if (!manifestPath) {
    console.error('Usage: node build_firefox_manifest.cjs <path-to-manifest>');
    process.exit(1);
}

const absolutePath = path.resolve(process.cwd(), manifestPath);

if (!fs.existsSync(absolutePath)) {
    console.error(`Manifest not found at: ${absolutePath}`);
    process.exit(1);
}

try {
    const manifest = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));

    console.log('Transforming manifest for Firefox (Gecko)...');

    // 1. Convert Service Worker to Background Scripts
    if (manifest.background && manifest.background.service_worker) {
        console.log(' - Converting service_worker to background.scripts');
        const scriptPath = manifest.background.service_worker;
        delete manifest.background.service_worker;
        manifest.background.scripts = [scriptPath];
        // Firefox doesn't strictly need type: module for background pages if scripts are loaded,
        // but MV3 usually uses native modules. However, Firefox background scripts in MV3 are non-persistent pages.
        // Keeping "type": "module" allows import statements to work.
    }

    // 2. Add Gecko Specific Settings
    // This ID is required for some Firefox APIs or installation
    if (!manifest.browser_specific_settings) {
        console.log(' - Adding browser_specific_settings (Gecko ID)');
        manifest.browser_specific_settings = {
            gecko: {
                id: "zenithguard@awalonn.com",
                strict_min_version: "109.0"
            }
        };
    }

    fs.writeFileSync(absolutePath, JSON.stringify(manifest, null, 2));
    console.log(`Firefox manifest written to: ${absolutePath}`);

} catch (e) {
    console.error('Failed to transform manifest:', e);
    process.exit(1);
}
