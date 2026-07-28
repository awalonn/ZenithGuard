import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

const dynamicRanges = [
    { name: "heuristic", start: 100, endExclusive: 7_000 },
    { name: "focus_mode", start: 7_000, endExclusive: 8_000 },
    { name: "youtube_dynamic", start: 20_000, endExclusive: 30_000 },
    { name: "isolation_mode", start: 30_000, endExclusive: 40_000 },
    { name: "network_blocklist", start: 40_000, endExclusive: 50_000 },
    { name: "url_cleaner", start: 50_000, endExclusive: 60_000 },
    { name: "user_allowlist", start: 60_000, endExclusive: 80_000 },
    { name: "malware", start: 200_000, endExclusive: 250_000 },
];

const expectedStaticRulesets = new Map([
    ["core_protection", { path: "rules/core_protection.json", enabled: false }],
    ["youtube_core", { path: "rules/youtube_core.json", enabled: false }],
]);

const requiredCoreAdTechFilters = [
    "||googletagservices.com^",
    "||securepubads.g.doubleclick.net^",
    "||tpc.googlesyndication.com^",
    "gampad/",
    "pubads_impl",
    "prebid-min.js",
    "||imasdk.googleapis.com^",
    "||marketplace.anyclip.com^",
    "||adsrvr.org^",
    "||lijit.com^",
    "||onetag-sys.com^",
    "||bordeaux.futurecdn.net^",
    "||servebom.com^",
    "||sharethrough.com^",
    "||3lift.com^",
    "||casalemedia.com^",
    "||omnitagjs.com^",
    "||bidswitch.net^",
    "||yellowblue.io^",
    "||33across.com^",
    "||everesttech.net^",
    "||liadm.com^",
    "||thrtle.com^",
    "prebid-current.js",
    "prebid-config",
    "||ay.delivery^",
    "bidbarrel",
    "||confiant-integrations.net^",
    "||ml314.com^",
    "||crwdcntrl.net^",
    "||ims-v4.paramount.tech^",
    "||aniview.com^",
    "||fwmrm.net^",
    "||adsafeprotected.com^",
    "||trustx.org^",
    "||smaato.net^",
    "||colossusssp.com^",
    "player.ex.co/prebid-bundle",
    "||sync.ex.co^",
    "||kargo.com^",
    "||gumgum.com^",
    "||postrelease.com^",
    "||servenobid.com^",
    "||smilewanted.com^",
    "||skimresources.com^",
    "freewheel.js",
    "||video-ads-module.ad-tech.nbcuni.com^",
    "||adsninja.ca^",
    "||brid.tv^",
    "||permutive.com^",
    "||permutive.app^",
    "||criteo.net^",
    "||ads-configs-cdn.openweb.com^",
    "||dotomi.com^",
    "||tapad.com^",
    "||uidapi.com^",
    "||lngtdv.com^",
    "||adentifi.com^",
    "||ipredictive.com^",
    "||tsyndicate.com^",
    "||mc.yandex.ru^",
    "||mc.webvisor.org^",
    "||rtbsuperhub.com^",
    "||coosync.com^",
    "||aj2555.bid^",
    "dailymail.com/static/mol-adverts/",
    "||idsync.anm.co.uk^",
    "||idsync.dailymail.com^",
    "||stackadapt.com^",
    "||visualwebsiteoptimizer.com^",
    "||cds.connatix.com^",
    "||capi.connatix.com^",
    "||ins.connatix.com^",
    "||htlbid.com^",
    "||sitescout.com^",
    "||analytics.tiktok.com^",
    "||mon.tiktokv.com^",
    "||mcs-sg.tiktokv.com^",
    "||chartbeat.com^",
    "||chartbeat.net^",
    "||merequartz.com^",
    "||html-load.com^",
    "||optmn.cloud^",
    "||p7cloud.net^",
    "||zipthelake.com^",
    "strike.fox.com/static/tmz/display/loader.js",
    "||primis.tech^",
    "||bouncex.net^",
    "||bounceexchange.com^",
    "||ad-delivery.net^",
    "||btloader.com^",
    "||eyeota.net^",
    "||wknd.ai^",
    "||analytics.yahoo.com^",
    "bing.com/api/v1/mediation/tracking",
    "||px.ads.linkedin.com^",
    "||inmobi.com^",
    "||aaxads.com^",
    "||tremorhub.com^",
    "||adthrive.com^",
    "||quantserve.com^",
    "||adrecover.com^",
    "||ad.gt^",
    "||adspsp.com^",
    "||ads-twitter.com^",
    "redditstatic.com/ads/",
    "||pixel-config.reddit.com^",
    "||alb.reddit.com^",
    "||googleadservices.com^",
    "||dv.tech^",
    "||zdbb.net^",
    "||getadmiral.com^",
    "||optidigital.com^",
    "||opti-digital.com^",
    "||presage.io^",
    "||seedtag.com^",
    "||adx.opera.com^",
    "||oa.opera.com^",
    "temu.com/api/adx/cm/pixel-opera",
    "||demdex.net^",
    "||sddan.com^",
    "||richaudience.com^",
    "||1rx.io^",
    "cdn.jsdelivr.net/gh/prebid/currency-file",
    "||deepintent.com^",
    "spot.im/production/ads/",
    "spot.im/ad/event-tracking/",
];

const requiredCorePrivacyFilters = [
    "||grok.com/_data/v1/events^",
    "||grok.com/api/log_metric^",
    "||grok.com/_data/v1/a/t^",
    "||grok.com/_data/v1/a/engage^",
    "||grok.com/_data/v1/a/record^",
    "||grok.com/monitoring^",
];

const forbiddenCoreCompatibilityFilters = [
    "||js.stripe.com^",
    "||m.stripe.com^",
    "||stripe.com^",
    "||paypal.com^",
    "||checkout.com^",
    "||adyen.com^",
    "||braintreegateway.com^",
];

const forbiddenTikTokCompatibilityFilters = [
    "||tiktok.com^",
    "||www.tiktok.com^",
    "||tiktokcdn.com^",
    "||tiktokv.com^",
    "||ttwstatic.com^",
    "||byteoversea.com^",
    "||ibytedtos.com^",
    "||mssdk-sg.tiktok.com^",
    "||sf16-website-login.neutral.ttwstatic.com^",
];

const allowedActionTypes = new Set(["block", "allow", "allowAllRequests", "redirect", "upgradeScheme", "modifyHeaders"]);
const allowedActionKeys = new Set(["type", "redirect", "requestHeaders", "responseHeaders"]);
const allowedConditionKeys = new Set([
    "urlFilter",
    "regexFilter",
    "isUrlFilterCaseSensitive",
    "initiatorDomains",
    "excludedInitiatorDomains",
    "requestDomains",
    "excludedRequestDomains",
    "resourceTypes",
    "excludedResourceTypes",
    "domainType",
]);
const allowedResourceTypes = new Set([
    "main_frame",
    "sub_frame",
    "stylesheet",
    "script",
    "image",
    "font",
    "object",
    "xmlhttprequest",
    "ping",
    "csp_report",
    "media",
    "websocket",
    "webtransport",
    "webbundle",
    "other",
]);
const allowedDomainTypes = new Set(["firstParty", "thirdParty"]);
const matcherKeys = [
    "urlFilter",
    "regexFilter",
    "initiatorDomains",
    "excludedInitiatorDomains",
    "requestDomains",
    "excludedRequestDomains",
];

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
}

function describeRule(relativePath, index, rule) {
    const id = Number.isInteger(rule?.id) ? `id ${rule.id}` : `index ${index}`;
    return `${relativePath}[${index}] (${id})`;
}

function collectStaticRulesetErrors(relativePath) {
    const errors = [];
    const rules = readJson(relativePath);

    if (!Array.isArray(rules)) {
        return [`DNR ruleset is not an array: ${relativePath}`];
    }

    const seen = new Map();
    for (const [index, rule] of rules.entries()) {
        if (!Number.isInteger(rule?.id)) {
            errors.push(`${relativePath}[${index}] is missing an integer id`);
            continue;
        }

        if (seen.has(rule.id)) {
            errors.push(`${relativePath} has duplicate rule id ${rule.id} at indexes ${seen.get(rule.id)} and ${index}`);
        } else {
            seen.set(rule.id, index);
        }

        const label = describeRule(relativePath, index, rule);
        if (!Number.isInteger(rule?.priority) || rule.priority < 1) {
            errors.push(`${label} is missing a positive integer priority`);
        }

        if (!rule?.action || typeof rule.action !== "object" || Array.isArray(rule.action)) {
            errors.push(`${label} is missing an action object`);
        } else {
            if (!allowedActionTypes.has(rule.action.type)) {
                errors.push(`${label} has unsupported action type '${rule.action.type || "missing"}'`);
            }

            for (const key of Object.keys(rule.action)) {
                if (!allowedActionKeys.has(key)) {
                    errors.push(`${label} has unsupported action key '${key}'`);
                }
            }

            if (rule.action.type === "redirect" && (!rule.action.redirect || typeof rule.action.redirect !== "object")) {
                errors.push(`${label} uses redirect without a redirect object`);
            }

            if (
                rule.action.type === "modifyHeaders" &&
                (!Array.isArray(rule.action.requestHeaders) || rule.action.requestHeaders.length === 0) &&
                (!Array.isArray(rule.action.responseHeaders) || rule.action.responseHeaders.length === 0)
            ) {
                errors.push(`${label} uses modifyHeaders without requestHeaders or responseHeaders`);
            }
        }

        if (!rule?.condition || typeof rule.condition !== "object" || Array.isArray(rule.condition)) {
            errors.push(`${label} is missing a condition object`);
            continue;
        }

        for (const key of Object.keys(rule.condition)) {
            if (!allowedConditionKeys.has(key)) {
                errors.push(`${label} has unsupported condition key '${key}'`);
            }
        }

        if (!matcherKeys.some((key) => Object.hasOwn(rule.condition, key))) {
            errors.push(`${label} has no URL/domain matcher in its condition`);
        }

        for (const key of ["urlFilter", "regexFilter"]) {
            if (Object.hasOwn(rule.condition, key) && typeof rule.condition[key] !== "string") {
                errors.push(`${label} condition.${key} must be a string`);
            } else if (typeof rule.condition[key] === "string" && rule.condition[key].trim().length === 0) {
                errors.push(`${label} condition.${key} must not be empty`);
            }
        }

        for (const key of ["initiatorDomains", "excludedInitiatorDomains", "requestDomains", "excludedRequestDomains"]) {
            if (!Object.hasOwn(rule.condition, key)) {
                continue;
            }

            const values = rule.condition[key];
            if (!Array.isArray(values) || values.length === 0) {
                errors.push(`${label} condition.${key} must be a non-empty array`);
                continue;
            }

            for (const [valueIndex, value] of values.entries()) {
                if (typeof value !== "string" || value.trim().length === 0) {
                    errors.push(`${label} condition.${key}[${valueIndex}] must be a non-empty string`);
                }
            }
        }

        for (const key of ["resourceTypes", "excludedResourceTypes"]) {
            if (!Object.hasOwn(rule.condition, key)) {
                continue;
            }

            const values = rule.condition[key];
            if (!Array.isArray(values) || values.length === 0) {
                errors.push(`${label} condition.${key} must be a non-empty array`);
                continue;
            }

            for (const value of values) {
                if (!allowedResourceTypes.has(value)) {
                    errors.push(`${label} condition.${key} has unsupported resource type '${value}'`);
                }
            }
        }

        if (Object.hasOwn(rule.condition, "domainType") && !allowedDomainTypes.has(rule.condition.domainType)) {
            errors.push(`${label} condition.domainType must be firstParty or thirdParty`);
        }

        if (
            Object.hasOwn(rule.condition, "isUrlFilterCaseSensitive") &&
            typeof rule.condition.isUrlFilterCaseSensitive !== "boolean"
        ) {
            errors.push(`${label} condition.isUrlFilterCaseSensitive must be boolean`);
        }
    }

    return errors;
}

function collectRangeOverlapErrors() {
    const errors = [];

    for (let index = 0; index < dynamicRanges.length; index += 1) {
        const left = dynamicRanges[index];
        if (left.start >= left.endExclusive) {
            errors.push(`Invalid DNR dynamic range '${left.name}': ${left.start} >= ${left.endExclusive}`);
        }

        for (const right of dynamicRanges.slice(index + 1)) {
            const overlaps = left.start < right.endExclusive && right.start < left.endExclusive;
            if (overlaps) {
                errors.push(
                    `DNR dynamic ranges overlap: '${left.name}' [${left.start}, ${left.endExclusive}) and '${right.name}' [${right.start}, ${right.endExclusive})`,
                );
            }
        }
    }

    return errors;
}

function collectSourceConstantErrors() {
    const errors = [];
    const dnrPipelinePath = path.join(rootDir, "src/js/background/modules/network_logger/dnr_pipeline.ts");
    const dnrPipeline = fs.readFileSync(dnrPipelinePath, "utf8");

    const expectedConstants = new Map([
        ["HEURISTIC_RULE_START_ID", 100],
        ["YOUTUBE_DYNAMIC_RULE_START_ID", 20_000],
        ["ISOLATION_MODE_RULE_START_ID", 30_000],
        ["NETWORK_BLOCKLIST_RULE_START_ID", 40_000],
        ["FOCUS_MODE_RULE_START_ID", 7_000],
        ["URL_CLEANER_RULE_START_ID", 50_000],
        ["USER_ALLOWLIST_RULE_START_ID", 60_000],
        ["BUILT_IN_RULE_START_ID", 80_000],
        ["MALWARE_RULE_START_ID", 200_000],
    ]);

    for (const [constant, expected] of expectedConstants) {
        const match = dnrPipeline.match(new RegExp(`const\\s+${constant}\\s*=\\s*([\\d_]+)`));
        const actual = match?.[1] ? Number(match[1].replace(/_/g, "")) : null;
        if (actual !== expected) {
            errors.push(`Unexpected or missing ${constant} in dnr_pipeline.ts; expected ${expected}`);
        }
    }

    const expectedRulesetConstants = new Map([
        ["CORE_RULESET_ID", "core_protection"],
        ["YOUTUBE_RULESET_ID", "youtube_core"],
    ]);

    for (const [constant, expected] of expectedRulesetConstants) {
        const match = dnrPipeline.match(new RegExp(`export\\s+const\\s+${constant}\\s*=\\s*"([^"]+)"`));
        const actual = match?.[1] || null;
        if (actual !== expected) {
            errors.push(`Unexpected or missing ${constant} in dnr_pipeline.ts; expected '${expected}'`);
        }
    }

    const defaultsPath = path.join(rootDir, "src/js/background/modules/storage/defaults.ts");
    const defaults = fs.readFileSync(defaultsPath, "utf8");
    if (!/const\s+FOCUS_MODE_RULE_START_ID\s*=\s*7_000/.test(defaults)) {
        errors.push("Focus mode rule start id in defaults.ts must stay aligned at 7000");
    }

    return errors;
}

function collectManifestRulesetErrors() {
    const errors = [];
    const manifest = readJson("manifest.json");
    const resources = manifest.declarative_net_request?.rule_resources;

    if (!Array.isArray(resources)) {
        return ["manifest.json is missing declarative_net_request.rule_resources"];
    }

    const byId = new Map();
    for (const [index, resource] of resources.entries()) {
        if (!resource?.id || typeof resource.id !== "string") {
            errors.push(`manifest.json rule_resources[${index}] is missing a string id`);
            continue;
        }

        if (byId.has(resource.id)) {
            errors.push(`manifest.json has duplicate ruleset id '${resource.id}'`);
        }
        byId.set(resource.id, resource);

        if (!resource.path || typeof resource.path !== "string") {
            errors.push(`manifest.json ruleset '${resource.id}' is missing a string path`);
        } else if (!fs.existsSync(path.join(rootDir, resource.path))) {
            errors.push(`manifest.json ruleset '${resource.id}' points to missing path '${resource.path}'`);
        }
    }

    for (const [rulesetId, expected] of expectedStaticRulesets) {
        const resource = byId.get(rulesetId);
        if (!resource) {
            errors.push(`manifest.json is missing expected static ruleset '${rulesetId}'`);
            continue;
        }

        if (resource.path !== expected.path) {
            errors.push(`manifest.json ruleset '${rulesetId}' path must be '${expected.path}', got '${resource.path}'`);
        }

        if (resource.enabled !== expected.enabled) {
            errors.push(
                `manifest.json ruleset '${rulesetId}' enabled must be ${expected.enabled}; runtime toggles this ruleset based on protection settings`,
            );
        }
    }

    return errors;
}

function extractDefaultBlocklistValues() {
    const defaultsPath = path.join(rootDir, "src/js/background/modules/storage/defaults.ts");
    const defaults = fs.readFileSync(defaultsPath, "utf8");
    const blocklistMatch = defaults.match(/export\s+const\s+DEFAULT_BLOCKLIST\s*:[\s\S]*?=\s*\[([\s\S]*?)\];/);

    if (!blocklistMatch?.[1]) {
        return {
            values: [],
            errors: ["Could not locate DEFAULT_BLOCKLIST in defaults.ts"],
        };
    }

    const values = Array.from(blocklistMatch[1].matchAll(/\{\s*value:\s*"([^"]+)"\s*,\s*enabled:\s*true\s*\}/g))
        .map((match) => match[1]);

    if (values.length === 0) {
        return {
            values,
            errors: ["DEFAULT_BLOCKLIST was found but no enabled rule values were parsed"],
        };
    }

    return {
        values,
        errors: [],
    };
}

function collectCoreRulesetAlignmentErrors() {
    const errors = [];
    const { values, errors: parseErrors } = extractDefaultBlocklistValues();
    errors.push(...parseErrors);

    if (parseErrors.length > 0) {
        return errors;
    }

    const coreRules = readJson("rules/core_protection.json");
    const byId = new Map(coreRules.map((rule) => [rule.id, rule]));
    const builtInStartId = 80_000;

    const survivalRules = new Map([
        [1, "doubleclick.net"],
        [2, "googleads.g.doubleclick.net"],
        [3, "pagead2.googlesyndication.com"],
    ]);

    for (const [ruleId, expectedFilter] of survivalRules) {
        const rule = byId.get(ruleId);
        if (rule?.condition?.urlFilter !== expectedFilter) {
            errors.push(`Survival rule ${ruleId} must use urlFilter '${expectedFilter}'`);
        }
    }

    for (const [index, expectedFilter] of values.entries()) {
        const ruleId = builtInStartId + index;
        const rule = byId.get(ruleId);

        if (!rule) {
            errors.push(`Missing packaged core rule ${ruleId} for DEFAULT_BLOCKLIST[${index}] '${expectedFilter}'`);
            continue;
        }

        if (rule.condition?.urlFilter !== expectedFilter) {
            errors.push(
                `Packaged core rule ${ruleId} is out of sync with DEFAULT_BLOCKLIST[${index}]: expected '${expectedFilter}', got '${rule.condition?.urlFilter || "missing"}'`,
            );
        }
    }

    const expectedBuiltInIds = new Set(values.map((_, index) => builtInStartId + index));
    for (const rule of coreRules) {
        if (rule.id >= builtInStartId && !expectedBuiltInIds.has(rule.id)) {
            errors.push(`Packaged core rule ${rule.id} has no matching DEFAULT_BLOCKLIST entry`);
        }
    }

    return errors;
}

function collectCoreAdTechCoverageErrors() {
    const errors = [];
    const { values, errors: parseErrors } = extractDefaultBlocklistValues();
    errors.push(...parseErrors);

    if (parseErrors.length > 0) {
        return errors;
    }

    const coreRules = readJson("rules/core_protection.json");
    const packagedFilters = new Set(coreRules.map((rule) => rule?.condition?.urlFilter).filter(Boolean));
    const defaultFilters = new Set(values);

    for (const filter of requiredCoreAdTechFilters) {
        if (!defaultFilters.has(filter)) {
            errors.push(`DEFAULT_BLOCKLIST is missing required core ad-tech filter '${filter}'`);
        }

        if (!packagedFilters.has(filter)) {
            errors.push(`rules/core_protection.json is missing required core ad-tech filter '${filter}'`);
            continue;
        }

        const matchingRule = coreRules.find((rule) => rule?.condition?.urlFilter === filter);
        if (matchingRule?.action?.type !== "block") {
            errors.push(`Required core ad-tech filter '${filter}' must use a block action`);
        }

        if (matchingRule?.condition?.domainType !== "thirdParty") {
            errors.push(`Required core ad-tech filter '${filter}' must be scoped to thirdParty requests`);
        }

        const resourceTypes = new Set(matchingRule?.condition?.resourceTypes || []);
        for (const resourceType of ["sub_frame", "script", "xmlhttprequest", "image", "media"]) {
            if (!resourceTypes.has(resourceType)) {
                errors.push(`Required core ad-tech filter '${filter}' must include resource type '${resourceType}'`);
            }
        }
    }

    return errors;
}

function collectCorePrivacyCoverageErrors() {
    const errors = [];
    const { values, errors: parseErrors } = extractDefaultBlocklistValues();
    errors.push(...parseErrors);

    if (parseErrors.length > 0) {
        return errors;
    }

    const coreRules = readJson("rules/core_protection.json");
    const packagedFilters = new Set(coreRules.map((rule) => rule?.condition?.urlFilter).filter(Boolean));
    const defaultFilters = new Set(values);

    for (const filter of requiredCorePrivacyFilters) {
        if (!defaultFilters.has(filter)) {
            errors.push(`DEFAULT_BLOCKLIST is missing required core privacy filter '${filter}'`);
        }

        if (!packagedFilters.has(filter)) {
            errors.push(`rules/core_protection.json is missing required core privacy filter '${filter}'`);
            continue;
        }

        const matchingRule = coreRules.find((rule) => rule?.condition?.urlFilter === filter);
        if (matchingRule?.action?.type !== "block") {
            errors.push(`Required core privacy filter '${filter}' must use a block action`);
        }

        if (Object.hasOwn(matchingRule?.condition || {}, "domainType")) {
            errors.push(`Required core privacy filter '${filter}' must not be thirdParty-only`);
        }

        const resourceTypes = new Set(matchingRule?.condition?.resourceTypes || []);
        for (const resourceType of ["script", "xmlhttprequest", "ping", "other"]) {
            if (!resourceTypes.has(resourceType)) {
                errors.push(`Required core privacy filter '${filter}' must include resource type '${resourceType}'`);
            }
        }
    }

    return errors;
}

function collectCoreCompatibilityErrors() {
    const errors = [];
    const { values, errors: parseErrors } = extractDefaultBlocklistValues();
    errors.push(...parseErrors);

    if (parseErrors.length > 0) {
        return errors;
    }

    const coreRules = readJson("rules/core_protection.json");
    const packagedFilters = new Set(coreRules.map((rule) => rule?.condition?.urlFilter).filter(Boolean));
    const defaultFilters = new Set(values);

    for (const filter of [
        ...forbiddenCoreCompatibilityFilters,
        ...forbiddenTikTokCompatibilityFilters,
    ]) {
        if (defaultFilters.has(filter)) {
            errors.push(`DEFAULT_BLOCKLIST must not include broad compatibility-sensitive filter '${filter}'`);
        }

        if (packagedFilters.has(filter)) {
            errors.push(`rules/core_protection.json must not include broad compatibility-sensitive filter '${filter}'`);
        }
    }

    return errors;
}

const errors = [
    ...collectStaticRulesetErrors("rules/core_protection.json"),
    ...collectStaticRulesetErrors("rules/youtube_core.json"),
    ...collectRangeOverlapErrors(),
    ...collectSourceConstantErrors(),
    ...collectManifestRulesetErrors(),
    ...collectCoreRulesetAlignmentErrors(),
    ...collectCoreAdTechCoverageErrors(),
    ...collectCorePrivacyCoverageErrors(),
    ...collectCoreCompatibilityErrors(),
];

if (errors.length > 0) {
    console.error("ZenithGuard DNR rule check failed:\n");
    for (const error of errors) {
        console.error(`- ${error}`);
    }
    process.exit(1);
}

console.log("ZenithGuard DNR rules and dynamic ranges look aligned.");
