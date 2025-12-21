
const fs = require('fs');
const path = require('path');
const https = require('https');

const URL = 'https://easylist.to/easylist/fanboy-annoyance.txt';
const OUT_DIR = path.join(__dirname, '../src/rules');
const NETWORK_OUT = path.join(OUT_DIR, 'ublock_annoyances.json');
const COSMETIC_OUT = path.join(OUT_DIR, 'ublock_annoyances_cosmetic.json');

// Ensure output dir exists
if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
}

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`HTTP Status Code: ${res.statusCode}`));
                return;
            }
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', (e) => reject(e));
    });
}

async function run() {
    console.log(`Fetching ${URL}...`);
    try {
        const text = await fetchUrl(URL);
        console.log(`Parsing ${text.length} characters...`);
        const lines = text.split('\n');

        const networkRules = []; // For DNR
        const cosmeticRules = {}; // For Content Script

        let ruleId = 200000; // Start ID for Annoyances

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('[')) continue;

            if (trimmed.includes('##')) {
                // Cosmetic Rule
                const parts = trimmed.split('##');
                const domainPart = parts[0];
                const selector = parts.slice(1).join('##'); // Handle select which might contain ## in rare cases? No, ## is separator.

                const domains = domainPart.split(',').filter(d => d && !d.startsWith('~'));

                if (domains.length > 0) {
                    for (const domain of domains) {
                        if (!cosmeticRules[domain]) cosmeticRules[domain] = [];
                        cosmeticRules[domain].push(selector);
                    }
                } else {
                    if (!cosmeticRules['']) cosmeticRules[''] = [];
                    cosmeticRules[''].push(selector);
                }
            } else {
                // Network Rule
                if (trimmed.startsWith('@@')) continue; // Skip exceptions

                let cleanFilter = trimmed;
                let resourceTypes = ['main_frame', 'sub_frame', 'script', 'xmlhttprequest', 'image', 'other', 'object'];

                // Parse a few basic options if present
                if (trimmed.includes('$')) {
                    const parts = trimmed.split('$');
                    cleanFilter = parts[0];
                    // Very basic option parsing to avoid breaking DNR
                    // If options are complex, many parsers skip or default.
                    // We will take the filter and apply it broadly for now to ensure coverage.
                }

                // Skip regex-like filters that DNR might reject if complex
                if (cleanFilter.startsWith('/') && cleanFilter.endsWith('/')) continue;
                if (cleanFilter.length < 3) continue; // Skip too short

                networkRules.push({
                    id: ruleId++,
                    priority: 1,
                    action: { type: 'block' },
                    condition: {
                        urlFilter: cleanFilter,
                        resourceTypes: resourceTypes
                    }
                });
            }
        }

        console.log(`Generated ${networkRules.length} network rules and ${Object.keys(cosmeticRules).length} cosmetic domains.`);

        fs.writeFileSync(NETWORK_OUT, JSON.stringify(networkRules, null, 2));
        fs.writeFileSync(COSMETIC_OUT, JSON.stringify(cosmeticRules, null, 2));

        console.log(`Success! Files written.`);

    } catch (e) {
        console.error("Failed:", e.message);
    }
}

run();
