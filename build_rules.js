/*
 * =================================================================
 * ZenithGuard - Rule List Build Script
 * =================================================================
 *
 * This script downloads the latest ad-blocking and privacy lists
 * and converts them into the two formats required by the extension:
 *
 * 1. Network Rules: A JSON file for Chrome's `declarativeNetRequest` API.
 * 2. Cosmetic Rules: A JSON file for our content script to inject.
 *
 * To Run:
 * 1. Make sure you have Node.js installed.
 * 2. Run `npm install` in this directory to get `node-fetch`.
 * 3. Run `node build_rules.js`.
 *
 * This will populate the `rules/` directory with the converted lists.
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

// --- Configuration ---

// Defines the lists to download and their output file names.
// The `id` is the starting number for rule IDs to ensure they are unique.
const LISTS_TO_BUILD = [
    {
        name: 'EasyList',
        sourceUrl: 'https://easylist.to/easylist/easylist.txt',
        networkFile: 'rules/easylist.json',
        cosmeticFile: 'rules/easylist_cosmetic.json',
        id: 100000 // Rule IDs for this list will start at 100000
    },
    {
        name: 'EasyPrivacy',
        sourceUrl: 'https://easylist.to/easylist/easyprivacy.txt',
        networkFile: 'rules/easyprivacy.json',
        cosmeticFile: 'rules/easyprivacy_cosmetic.json',
        id: 200000 // Rule IDs will start at 200000
    },
    {
        name: 'uBlock Annoyances',
        sourceUrl: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/annoyances.txt',
        networkFile: 'rules/ublock_annoyances.json',
        cosmeticFile: 'rules/ublock_annoyances_cosmetic.json',
        id: 300000 // Rule IDs will start at 300000
    }
];

// --- Main Execution ---

/**
 * Main function to coordinate the build process.
 */
async function main() {
    console.log('Starting ZenithGuard rule build process...');

    // Ensure the rules directory exists
    try {
        await fs.mkdir(path.resolve('rules'), { recursive: true });
    } catch (e) {
        console.error('Could not create rules directory:', e);
        return;
    }

    let totalNetwork = 0;
    let totalCosmetic = 0;

    for (const list of LISTS_TO_BUILD) {
        console.log(`\nProcessing: ${list.name}...`);
        try {
            // 1. Download
            const rawText = await downloadList(list.sourceUrl);
            if (!rawText) continue;

            // 2. Parse
            console.log(`Parsing ${rawText.split('\n').length} lines...`);
            const { networkRules, cosmeticRules } = parseFilterList(rawText, list.id);

            // 3. Save Files
            await saveJsonFile(list.networkFile, networkRules);
            const networkCount = networkRules.length;
            totalNetwork += networkCount;
            console.log(`Saved ${networkCount} network rules to ${list.networkFile}`);

            await saveJsonFile(list.cosmeticFile, cosmeticRules);
            const cosmeticRuleCount = Object.values(cosmeticRules).reduce((acc, val) => acc + val.length, 0);
            totalCosmetic += cosmeticRuleCount;
            console.log(`Saved ${cosmeticRuleCount} cosmetic rules to ${list.cosmeticFile}`);

        } catch (error) {
            console.error(`Failed to build ${list.name}:`, error.message);
        }
    }

    console.log('\nBuild process complete!');
    console.log(`Total Network Rules: ${totalNetwork.toLocaleString()}`);
    console.log(`Total Cosmetic Rules: ${totalCosmetic.toLocaleString()}`);
}

/**
 * Downloads the raw text file for a given filter list.
 * @param {string} url - The URL to fetch the list from.
 * @returns {Promise<string|null>} The raw text content of the list.
 */
async function downloadList(url) {
    try {
        console.log(`Downloading from ${url}...`);
        const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        console.error(`Failed to download list: ${url}`, error);
        return null;
    }
}

/**
 * Parses the raw text of a filter list into network and cosmetic rules.
 * @param {string} text - The raw text content of the list.
 * @param {number} ruleIdStart - The starting ID for network rules.
 * @returns {object} An object with `networkRules` and `cosmeticRules`.
 */
function parseFilterList(text, ruleIdStart) {
    const networkRules = [];
    const cosmeticRules = {}; // Format: { "domain.com": ["selector1"], "": [".global-selector"] }
    const lines = text.split('\n');
    let ruleId = ruleIdStart;

    const resourceTypes = [
        "main_frame", "sub_frame", "script", "xmlhttprequest",
        "image", "media", "stylesheet", "other"
    ];
    
    // Regex to detect non-ASCII characters
    const nonAsciiRegex = /[^\x00-\x7F]/;
    // Max rule length to prevent 2KB limit errors
    const MAX_RULE_LENGTH_LIMIT = 500;

    for (const line of lines) {
        const trimmed = line.trim();

        // --- Skip Comments, Blank Lines, and Metadata ---
        if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('[')) {
            continue;
        }

        // --- Skip Rules with Non-ASCII Characters ---
        if (nonAsciiRegex.test(trimmed)) {
            continue;
        }

        // --- Skip Rules That Are Too Long ---
        if (trimmed.length > MAX_RULE_LENGTH_LIMIT) {
            continue;
        }
        
        // --- Skip Exception Rules ---
        if (trimmed.startsWith('@@')) {
            continue;
        }

        // --- Skip Complex Rules with Options ($) ---
        // This is a major simplification to avoid parsing errors.
        // We lose some specificity (like $domain=...) but gain huge stability.
        if (trimmed.includes('$')) {
            continue;
        }

        // --- Cosmetic Rule (##) ---
        if (trimmed.includes('##')) {
            const parts = trimmed.split('##');
            const domains = parts[0].split(',').filter(d => d && !d.startsWith('~'));
            const selector = parts[1];

            if (!selector) continue;

            if (domains.length > 0) {
                for (const domain of domains) {
                    if (!cosmeticRules[domain]) cosmeticRules[domain] = [];
                    cosmeticRules[domain].push(selector);
                }
            } else {
                // Global cosmetic rule
                if (!cosmeticRules['']) cosmeticRules[''] = [];
                cosmeticRules[''].push(selector);
            }
        }
        // --- Network Rule ---
        else {
            
            // --- Skip Regex Rules ---
            // These are the ones causing the 2KB limit error
            if (trimmed.startsWith('/') && trimmed.endsWith('/')) {
                continue;
            }

            // --- Process Valid `urlFilter` Rules ---
            // We only accept rules that start with || (domain anchor) or | (start/end anchor)
            if (trimmed.startsWith('||') || trimmed.startsWith('|')) {
                const rule = {
                    id: ruleId++,
                    priority: 1,
                    action: { "type": "block" },
                    condition: {
                        "urlFilter": trimmed,
                        "resourceTypes": resourceTypes
                    }
                };
                networkRules.push(rule);
            }
            
            // --- Safely Skip Other/Unsupported Rules ---
            // We intentionally skip anything else to avoid generating invalid regexes
        }
    }

    return { networkRules, cosmeticRules };
}

/**
 * Saves an object as a JSON file.
 * @param {string} filePath - The path to save the file.
 * @param {object} data - The JSON data to save.
 */
async function saveJsonFile(filePath, data) {
    try {
        const fullPath = path.resolve(filePath);
        // Using 2-space indent for readability
        await fs.writeFile(fullPath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Error saving JSON file: ${filePath}`, error);
    }
}

// --- Run the Script ---
main();