#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════
 * DEVELOPER BUILD SCRIPT - DO NOT RUN IN PRODUCTION
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * This script compiles STATIC DNR rulesets for NETWORK BLOCKING.
 * 
 * WHEN TO RUN:
 * - Before building a new extension version: `npm run update-rulesets`
 * - When you want to update bundled filter lists
 * - Typically once every few weeks/months
 * 
 * WHAT IT DOES:
 * - Fetches filter lists from upstream URLs (EasyList, EasyPrivacy, etc.)
 * - Converts NETWORK BLOCKING rules to Chrome DNR format
 * - Saves to src/rulesets/*.json (max 30,000 rules each)
 * - These files are bundled in the extension package
 * 
 * WHAT IT DOES NOT DO:
 * - It does NOT handle cosmetic/hiding rules (##, #@# selectors)
 * - Those cosmetic rules are fetched at runtime by the extension
 * - End users update cosmetic rules via "Update Lists" button in dashboard
 * 
 * ARCHITECTURE NOTE:
 * ZenithGuard uses a HYBRID approach:
 * 1. STATIC DNR (this script) = Network blocking, bundled, ultra-fast
 * 2. DYNAMIC COSMETIC (runtime) = Element hiding, updatable, flexible
 * 
 * This split is necessary because:
 * - Chrome limits static rulesets to 30k rules each
 * - Full filter lists have 60k+ total rules (network + cosmetic)
 * - We maximize performance by using DNR for network blocking
 * - We maintain flexibility by fetching cosmetic rules at runtime
 * ═══════════════════════════════════════════════════════════════════════
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const SOURCES = {
    easylist: 'https://easylist.to/easylist/easylist.txt',
    easyprivacy: 'https://easylist.to/easylist/easyprivacy.txt',
    annoyances: 'https://easylist.to/easylist/fanboy-annoyance.txt',
    youtube: 'https://raw.githubusercontent.com/yokoffing/filterlists/main/youtube_clear_view.txt'
};

const OUTPUT_DIR = path.join(__dirname, '../src/rulesets');
const MAX_RULES_PER_LIST = 30000;

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return fetchUrl(res.headers.location).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function parseAdblockLine(line, ruleId) {
    const original = line.trim();
    if (!original || original.startsWith('!') || original.startsWith('[')) return null;
    if (original.includes('##') || original.includes('#@#') || original.includes('#?#')) return null;
    if (original.startsWith('@@')) return null;

    let rule = original;
    let isRegex = false;
    const resourceTypes = ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other'];

    // Handle options (strip for now)
    if (rule.includes('$')) {
        const [pattern] = rule.split('$');
        rule = pattern;
    }

    if (!rule || rule.length < 3) return null;

    // Check if it's a regex pattern
    if (rule.startsWith('/') && rule.endsWith('/')) {
        rule = rule.slice(1, -1);
        isRegex = true;
        if (rule.length > 2000) return null;
    } else {
        // Convert ABP syntax to urlFilter
        if (rule.startsWith('||')) {
            rule = rule.slice(2);
        } else if (rule.startsWith('|')) {
            rule = rule.slice(1);
        }

        if (rule.endsWith('^')) {
            rule = rule.slice(0, -1);
        }

        rule = rule.replace(/\^/g, '');

        // Skip complex patterns
        if (rule.includes('(') || rule.includes('[') || rule.includes('{')) {
            return null;
        }

        if (!rule || rule.length < 3) return null;
    }

    const condition = isRegex
        ? { regexFilter: rule, resourceTypes }
        : { urlFilter: rule, resourceTypes };

    return {
        id: ruleId,
        priority: 1,
        action: { type: 'block' },
        condition
    };
}

async function processFilterList(name, url) {
    console.log(`\nFetching ${name}...`);

    try {
        const content = await fetchUrl(url);
        const lines = content.split('\n');
        const rules = [];
        let ruleId = 1;
        let skipped = 0;

        for (const line of lines) {
            if (rules.length >= MAX_RULES_PER_LIST) break;

            const rule = parseAdblockLine(line, ruleId);
            if (rule) {
                rules.push(rule);
                ruleId++;
            } else if (line.trim() && !line.trim().startsWith('!')) {
                skipped++;
            }
        }

        const outputPath = path.join(OUTPUT_DIR, `${name}.json`);
        fs.writeFileSync(outputPath, JSON.stringify(rules, null, 2));

        console.log(`✅ ${name}: ${rules.length} rules (skipped ${skipped} cosmetic/unsupported)`);
        return rules.length;

    } catch (error) {
        console.error(`❌ ${name} failed:`, error.message);
        return 0;
    }
}

async function main() {
    console.log('═'.repeat(60));
    console.log('⚠️  DEVELOPER TOOL - Building Static DNR Rulesets');
    console.log('⚠️  End users do NOT need to run this script');
    console.log('═'.repeat(60));
    console.log('🚀 ZenithGuard Ruleset Compiler v2');
    console.log('━'.repeat(50));

    let total = 0;
    for (const [name, url] of Object.entries(SOURCES)) {
        total += await processFilterList(name, url);
    }

    console.log('\n' + '━'.repeat(50));
    console.log(`✨ Total: ${total} DNR rules compiled`);
    console.log(`📁 Output: ${OUTPUT_DIR}`);
    console.log('💡 Next step: Run `npm run build` to bundle these into the extension');
    console.log('═'.repeat(60));
}

main().catch(console.error);
