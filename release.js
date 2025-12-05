import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { exec } from 'child_process';
import archiver from 'archiver';
import semver from 'semver';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const packageJsonPath = path.join(__dirname, 'package.json');
const manifestJsonPath = path.join(__dirname, 'src/manifest.json');
const distDir = path.join(__dirname, 'dist');
const releasesDir = path.join(__dirname, 'releases');

// Read current version
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const currentVersion = packageJson.version;

console.log(`\n📦 ZenithGuard Release Workflow`);
console.log(`Current Version: ${currentVersion}\n`);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('Select update type (p=patch, m=minor, M=major, c=custom): ', (answer) => {
    let nextVersion;

    switch (answer.toLowerCase()) {
        case 'p': nextVersion = semver.inc(currentVersion, 'patch'); break;
        case 'm': nextVersion = semver.inc(currentVersion, 'minor'); break;
        case 'M': nextVersion = semver.inc(currentVersion, 'major'); break; // Corrected case
        case 'c':
            rl.question('Enter custom version: ', (ver) => {
                if (semver.valid(ver)) {
                    runRelease(ver);
                } else {
                    console.error('Invalid semver version.');
                    process.exit(1);
                }
            });
            return;
        default:
            console.log('Cancelled.');
            process.exit(0);
    }

    runRelease(nextVersion);
});

function runRelease(version) {
    rl.close();
    console.log(`\n🚀 Preparing Release: v${version}...`);

    // 1. Update package.json
    packageJson.version = version;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    console.log('✅ Updated package.json');

    // 2. Update manifest.json
    const manifestJson = JSON.parse(fs.readFileSync(manifestJsonPath, 'utf-8'));
    manifestJson.version = version;
    fs.writeFileSync(manifestJsonPath, JSON.stringify(manifestJson, null, 2));
    console.log('✅ Updated manifest.json');

    // 3. Run Build
    console.log('🛠️  Running Build...');
    exec('npm run build', (error, stdout, stderr) => {
        if (error) {
            console.error(`Build failed: ${error.message}`);
            return;
        }
        console.log('✅ Build successful');

        // 4. Create Zip
        createZip(version);
    });
}

function createZip(version) {
    if (!fs.existsSync(releasesDir)) {
        fs.mkdirSync(releasesDir);
    }

    const zipName = `zenithguard-v${version}.zip`;
    const output = fs.createWriteStream(path.join(releasesDir, zipName));
    const archive = archiver('zip', {
        zlib: { level: 9 } // Sets the compression level.
    });

    output.on('close', function () {
        console.log(`\n🎉 Release Complete!`);
        console.log(`📁 File: releases/${zipName}`);
        console.log(`📦 Size: ${(archive.pointer() / 1024).toFixed(2)} KB`);
    });

    archive.on('warning', function (err) {
        if (err.code === 'ENOENT') {
            console.warn(err);
        } else {
            throw err;
        }
    });

    archive.on('error', function (err) {
        throw err;
    });

    archive.pipe(output);

    // Append files from dist directory
    archive.directory(distDir, false);

    archive.finalize();
}
