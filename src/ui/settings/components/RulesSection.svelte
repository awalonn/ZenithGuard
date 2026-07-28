<script lang="ts">
import { onMount, tick } from "svelte";
import { normalizeDomain } from "../../../js/background/modules/storage/defaults";
import type { CustomHidingRules, IndexedToggleableRuleEntry, NetworkRuleOriginFilter, PersistentWallFixMap, RuleActivityEntry, RulesSummaryChip, SettingsRuleSnapshot } from "../types";
import {
  addDomainRule,
  addFocusDomain,
  addHeuristicKeyword,
  addNetworkRule,
  addPausedDomain,
  deleteDomainRule,
  deleteHeuristicKeyword,
  deleteHidingDomain,
  deleteNetworkRule,
  deleteSingleHidingRule,
  deleteWallFix,
  formatRuleTimestamp,
  getCustomOriginLabel,
  getEffectiveFocusDomains,
  matchesNetworkRuleOriginFilter,
  persistCustomHidingRules,
  persistNetworkBlocklist,
  persistStringList,
  persistToggleableList,
  persistWallFixes,
  refreshNetworkBlocklistMeta,
  removeFocusDomain,
  removePausedDomain,
  resetBuiltInCoreRules,
  resetFocusDomains,
  resetHeuristicKeywords,
  toggleExpandedDomain,
  toggleRuleAtIndex,
  toggleRulesByIndexes,
  toggleWallFix,
  toggleWallFixesBulk,
} from "../rules_controller";
import RulesGroupHeading from "./RulesGroupHeading.svelte";
import RulesSummaryStrip from "./RulesSummaryStrip.svelte";
import RecentRuleActivity from "./RecentRuleActivity.svelte";
import RulesCurrentSiteContext from "./RulesCurrentSiteContext.svelte";
import PausedSitesTable from "./PausedSitesTable.svelte";
import ToggleableDomainTable from "./ToggleableDomainTable.svelte";
import WallFixesTable from "./WallFixesTable.svelte";
import CoreRulesTable from "./CoreRulesTable.svelte";
import HeuristicKeywordsTable from "./HeuristicKeywordsTable.svelte";
import NetworkBlocklistTable from "./NetworkBlocklistTable.svelte";
import FocusDomainsTable from "./FocusDomainsTable.svelte";
import CustomHidingTable from "./CustomHidingTable.svelte";

export let rulesSnapshot: SettingsRuleSnapshot | null = null;

let pausedSearch = "";
let isolationSearch = "";
let forgetfulSearch = "";
let wallSearch = "";
let builtInSearch = "";
let networkSearch = "";
let networkOriginFilter: NetworkRuleOriginFilter = "all";
let focusSearch = "";
let heuristicSearch = "";
let hidingSearch = "";

let newPausedDomain = "";
let newIsolationDomain = "";
let newForgetfulDomain = "";
let newNetworkDomain = "";
let newFocusDomain = "";
let newHeuristicKeyword = "";

let expandedHidingDomains = new Set<string>();
let currentRulesDomain: string | null = null;


function createEmptySnapshot(): SettingsRuleSnapshot {
  return {
    defaultBlocklist: [],
    networkBlocklist: [],
    networkBlocklistMeta: {},
    isolationModeSites: [],
    forgetfulSites: [],
    focusBlocklist: [],
    heuristicKeywords: [],
    customHidingRules: {},
    persistentWallFixes: {},
    disabledSites: [],
  };
}

function ensureSnapshot(): SettingsRuleSnapshot {
  if (!rulesSnapshot) {
    rulesSnapshot = createEmptySnapshot();
  }
  return rulesSnapshot;
}

function updateSnapshot(patch: Partial<SettingsRuleSnapshot>): void {
  const current = ensureSnapshot();
  rulesSnapshot = { ...current, ...patch };
}

function matchesSearch(value: string, search: string): boolean {
  return !search.trim() || value.toLowerCase().includes(search.trim().toLowerCase());
}

function getRecentActivity(snapshot: SettingsRuleSnapshot | null): RuleActivityEntry[] {
  if (!snapshot) return [];

  const networkEntries = Object.entries(snapshot.networkBlocklistMeta || {})
    .filter(([, meta]) => typeof meta.addedAt === "number")
    .map(([domain, meta]) => ({
      category: "network" as const,
      label: domain,
      detail: `Custom block added${meta.source ? ` from ${getCustomOriginLabel(meta.source)}` : ""}`,
      timestamp: Number(meta.addedAt),
    }));

  const hidingEntries = Object.entries(snapshot.customHidingRules || {}).flatMap(([domain, rules]) => {
    const latestRule = [...rules].sort((left, right) => {
      const leftTimestamp = Math.max(left.lastHealed || 0, left.lastHealAttempt || 0);
      const rightTimestamp = Math.max(right.lastHealed || 0, right.lastHealAttempt || 0);
      return rightTimestamp - leftTimestamp;
    })[0];

    const timestamp = Math.max(latestRule?.lastHealed || 0, latestRule?.lastHealAttempt || 0);
    if (!timestamp) return [];

    return [{
      category: "hiding" as const,
      label: domain,
      detail: latestRule?.lastHealed ? "Self-heal updated hiding rules" : "Self-heal attempted a hiding repair",
      timestamp,
    }];
  });

  return [...networkEntries, ...hidingEntries].sort((left, right) => right.timestamp - left.timestamp).slice(0, 5);
}

function getFilteredIndexedRules(rules: Array<{ value: string; enabled: boolean }>, search: string): IndexedToggleableRuleEntry[] {
  return rules.map((rule, index) => ({ rule, index })).filter(({ rule }) => matchesSearch(rule.value, search));
}

function getFilteredNetworkRules(snapshot: SettingsRuleSnapshot | null): IndexedToggleableRuleEntry[] {
  return (snapshot?.networkBlocklist || [])
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => matchesSearch(rule.value, networkSearch))
    .filter(({ rule }) => matchesNetworkRuleOriginFilter(rule.value, snapshot?.networkBlocklistMeta || {}, networkOriginFilter));
}

function getFilteredCustomHidingDomains(customHidingRules: CustomHidingRules, search: string): Array<[string, CustomHidingRules[string]]> {
  return Object.entries(customHidingRules || {}).filter(([domain, rules]) => {
    if (matchesSearch(domain, search)) return true;
    return rules.some((rule) => matchesSearch(rule.value, search));
  });
}

function getFilteredWallFixes(persistentWallFixes: PersistentWallFixMap, search: string): Array<[string, PersistentWallFixMap[string]]> {
  return Object.entries(persistentWallFixes || {}).filter(([domain, fix]) => {
    const haystacks = [domain, String(fix.overlaySelector || ""), String(fix.scrollSelector || ""), String(fix.contentUnlockSelector || "")];
    return haystacks.some((value) => matchesSearch(value, search));
  });
}

function maybeConfirm(message: string): boolean {
  return window.confirm(message);
}

function showError(error: unknown): void {
  window.alert(error instanceof Error ? error.message : String(error));
}

function clearSearch(section: "paused" | "isolation" | "forgetful" | "wall" | "built-in" | "network" | "focus" | "heuristic" | "hiding"): void {
  if (section === "paused") pausedSearch = "";
  if (section === "isolation") isolationSearch = "";
  if (section === "forgetful") forgetfulSearch = "";
  if (section === "wall") wallSearch = "";
  if (section === "built-in") builtInSearch = "";
  if (section === "network") networkSearch = "";
  if (section === "focus") focusSearch = "";
  if (section === "heuristic") heuristicSearch = "";
  if (section === "hiding") hidingSearch = "";
}

function clearNetworkFilters(): void {
  networkSearch = "";
  networkOriginFilter = "all";
}

async function handleAddPausedDomain(): Promise<void> {
  try {
    const result = addPausedDomain(ensureSnapshot().disabledSites, newPausedDomain);
    newPausedDomain = result.nextValue;
    updateSnapshot({ disabledSites: result.nextList });
    await persistStringList("disabledSites", result.nextList);
  } catch (error) {
    showError(error);
  }
}

async function handleResumeProtection(domain: string): Promise<void> {
  if (!maybeConfirm(`Resume full protection for ${domain}? ZenithGuard will start enforcing its normal blocker and dangerous-site checks there again.`)) return;
  const next = removePausedDomain(ensureSnapshot().disabledSites, domain);
  updateSnapshot({ disabledSites: next });
  await persistStringList("disabledSites", next);
}

async function handleAddIsolationDomain(): Promise<void> {
  try {
    const result = addDomainRule(ensureSnapshot().isolationModeSites, newIsolationDomain, "Isolation Mode is already enabled for this domain.");
    newIsolationDomain = result.nextValue;
    updateSnapshot({ isolationModeSites: result.nextList });
    await persistToggleableList("isolationModeSites", result.nextList);
  } catch (error) {
    showError(error);
  }
}

async function handleRemoveIsolationDomain(domain: string): Promise<void> {
  if (!maybeConfirm(`Disable Isolation Mode for ${domain}? Third-party scripts and frames will be allowed again on that site.`)) return;
  const next = deleteDomainRule(ensureSnapshot().isolationModeSites, domain);
  updateSnapshot({ isolationModeSites: next });
  await persistToggleableList("isolationModeSites", next);
}

async function handleToggleIsolation(index: number, enabled: boolean): Promise<void> {
  const next = toggleRuleAtIndex(ensureSnapshot().isolationModeSites, index, enabled);
  updateSnapshot({ isolationModeSites: next });
  await persistToggleableList("isolationModeSites", next);
}

async function handleBulkIsolation(enabled: boolean): Promise<void> {
  const next = toggleRulesByIndexes(ensureSnapshot().isolationModeSites, isolationSites.map(({ index }) => index), enabled);
  updateSnapshot({ isolationModeSites: next });
  await persistToggleableList("isolationModeSites", next);
}

async function handleAddForgetfulDomain(): Promise<void> {
  try {
    const result = addDomainRule(ensureSnapshot().forgetfulSites, newForgetfulDomain, "Forgetful Browsing is already enabled for this domain.");
    newForgetfulDomain = result.nextValue;
    updateSnapshot({ forgetfulSites: result.nextList });
    await persistToggleableList("forgetfulSites", result.nextList);
  } catch (error) {
    showError(error);
  }
}

async function handleRemoveForgetfulDomain(domain: string): Promise<void> {
  if (!maybeConfirm(`Stop forgetful browsing for ${domain}? ZenithGuard will stop clearing that site's local data when you close its tabs.`)) return;
  const next = deleteDomainRule(ensureSnapshot().forgetfulSites, domain);
  updateSnapshot({ forgetfulSites: next });
  await persistToggleableList("forgetfulSites", next);
}

async function handleToggleForgetful(index: number, enabled: boolean): Promise<void> {
  const next = toggleRuleAtIndex(ensureSnapshot().forgetfulSites, index, enabled);
  updateSnapshot({ forgetfulSites: next });
  await persistToggleableList("forgetfulSites", next);
}

async function handleBulkForgetful(enabled: boolean): Promise<void> {
  const next = toggleRulesByIndexes(ensureSnapshot().forgetfulSites, forgetfulSites.map(({ index }) => index), enabled);
  updateSnapshot({ forgetfulSites: next });
  await persistToggleableList("forgetfulSites", next);
}
async function handleToggleWallFix(domain: string, enabled: boolean): Promise<void> {
  const next = toggleWallFix(ensureSnapshot().persistentWallFixes, domain, enabled);
  updateSnapshot({ persistentWallFixes: next });
  await persistWallFixes(next);
}

async function handleBulkWallFixes(enabled: boolean): Promise<void> {
  const next = toggleWallFixesBulk(ensureSnapshot().persistentWallFixes, wallFixes.map(([domain]) => domain), enabled);
  updateSnapshot({ persistentWallFixes: next });
  await persistWallFixes(next);
}

async function handleDeleteWallFix(domain: string): Promise<void> {
  if (!maybeConfirm(`Remove the saved wall fix for ${domain}? The site will load without ZenithGuard's stored overlay fix on future visits.`)) return;
  const next = deleteWallFix(ensureSnapshot().persistentWallFixes, domain);
  updateSnapshot({ persistentWallFixes: next });
  await persistWallFixes(next);
}

async function handleToggleBuiltIn(index: number, enabled: boolean): Promise<void> {
  const next = toggleRuleAtIndex(ensureSnapshot().defaultBlocklist, index, enabled);
  updateSnapshot({ defaultBlocklist: next });
  await persistToggleableList("defaultBlocklist", next);
}

async function handleBulkBuiltIn(enabled: boolean): Promise<void> {
  const next = toggleRulesByIndexes(ensureSnapshot().defaultBlocklist, builtInRules.map(({ index }) => index), enabled);
  updateSnapshot({ defaultBlocklist: next });
  await persistToggleableList("defaultBlocklist", next);
}

async function handleResetBuiltIn(): Promise<void> {
  const next = await resetBuiltInCoreRules();
  updateSnapshot({ defaultBlocklist: next });
}

async function handleAddNetworkRule(): Promise<void> {
  try {
    const result = addNetworkRule(ensureSnapshot().networkBlocklist, ensureSnapshot().networkBlocklistMeta, newNetworkDomain);
    newNetworkDomain = result.nextValue;
    updateSnapshot({ networkBlocklist: result.nextList, networkBlocklistMeta: result.nextMeta });
    await persistNetworkBlocklist(result.nextList, result.nextMeta);
  } catch (error) {
    showError(error);
  }
}

async function handleDeleteNetworkRule(domain: string): Promise<void> {
  if (!maybeConfirm(`Delete custom network rule "${domain}"? This removes it from My Rules entirely.`)) return;
  const result = deleteNetworkRule(ensureSnapshot().networkBlocklist, ensureSnapshot().networkBlocklistMeta, domain);
  updateSnapshot({ networkBlocklist: result.nextList, networkBlocklistMeta: result.nextMeta });
  await persistNetworkBlocklist(result.nextList, result.nextMeta);
}

async function handleToggleNetwork(index: number, enabled: boolean): Promise<void> {
  const next = toggleRuleAtIndex(ensureSnapshot().networkBlocklist, index, enabled);
  updateSnapshot({ networkBlocklist: next });
  await persistNetworkBlocklist(next, ensureSnapshot().networkBlocklistMeta);
}

async function handleBulkNetwork(enabled: boolean): Promise<void> {
  const next = toggleRulesByIndexes(ensureSnapshot().networkBlocklist, networkRules.map(({ index }) => index), enabled);
  updateSnapshot({ networkBlocklist: next });
  await persistNetworkBlocklist(next, ensureSnapshot().networkBlocklistMeta);
}

async function handleAddFocusDomain(): Promise<void> {
  try {
    const result = addFocusDomain(ensureSnapshot().focusBlocklist, newFocusDomain);
    newFocusDomain = result.nextValue;
    updateSnapshot({ focusBlocklist: result.nextList });
    await persistStringList("focusBlocklist", result.nextList);
  } catch (error) {
    showError(error);
  }
}

async function handleRemoveFocusDomain(domain: string): Promise<void> {
  const next = removeFocusDomain(ensureSnapshot().focusBlocklist, domain);
  updateSnapshot({ focusBlocklist: next });
  await persistStringList("focusBlocklist", next);
}

async function handleResetFocusDomains(): Promise<void> {
  const next = resetFocusDomains();
  updateSnapshot({ focusBlocklist: next });
  await persistStringList("focusBlocklist", next);
}

async function handleAddHeuristicKeyword(): Promise<void> {
  try {
    const result = addHeuristicKeyword(ensureSnapshot().heuristicKeywords, newHeuristicKeyword);
    newHeuristicKeyword = result.nextValue;
    updateSnapshot({ heuristicKeywords: result.nextList });
    await persistToggleableList("heuristicKeywords", result.nextList);
  } catch (error) {
    showError(error);
  }
}

async function handleDeleteHeuristicKeyword(keyword: string): Promise<void> {
  if (!maybeConfirm(`Delete heuristic keyword "${keyword}"? This removes it from My Rules entirely.`)) return;
  const next = deleteHeuristicKeyword(ensureSnapshot().heuristicKeywords, keyword);
  updateSnapshot({ heuristicKeywords: next });
  await persistToggleableList("heuristicKeywords", next);
}

async function handleToggleHeuristic(index: number, enabled: boolean): Promise<void> {
  const next = toggleRuleAtIndex(ensureSnapshot().heuristicKeywords, index, enabled);
  updateSnapshot({ heuristicKeywords: next });
  await persistToggleableList("heuristicKeywords", next);
}

async function handleBulkHeuristic(enabled: boolean): Promise<void> {
  const next = toggleRulesByIndexes(ensureSnapshot().heuristicKeywords, heuristicRules.map(({ index }) => index), enabled);
  updateSnapshot({ heuristicKeywords: next });
  await persistToggleableList("heuristicKeywords", next);
}

async function handleResetHeuristics(): Promise<void> {
  const next = await resetHeuristicKeywords();
  updateSnapshot({ heuristicKeywords: next });
}

async function handleDeleteHidingDomain(domain: string): Promise<void> {
  const count = ensureSnapshot().customHidingRules[domain]?.length || 0;
  if (!maybeConfirm(`Delete all ${count} hidden-element rule(s) for ${domain}? This will remove the saved cleanup for that site.`)) return;
  const result = deleteHidingDomain(ensureSnapshot().customHidingRules, expandedHidingDomains, domain);
  expandedHidingDomains = result.expandedHidingDomains;
  updateSnapshot({ customHidingRules: result.customHidingRules });
  await persistCustomHidingRules(result.customHidingRules);
}

async function handleDeleteSingleHidingRule(domain: string, index: number, value: string): Promise<void> {
  if (!maybeConfirm(`Delete hidden-element rule "${value}" from ${domain}?`)) return;
  const result = deleteSingleHidingRule(ensureSnapshot().customHidingRules, expandedHidingDomains, domain, index);
  if (!result) return;
  expandedHidingDomains = result.expandedHidingDomains;
  updateSnapshot({ customHidingRules: result.customHidingRules });
  await persistCustomHidingRules(result.customHidingRules);
}

function handleToggleHidingDomain(domain: string): void {
  expandedHidingDomains = toggleExpandedDomain(expandedHidingDomains, domain);
}

async function handlePauseCurrentSite(): Promise<void> {
  if (!currentRulesDomain) return;
  try {
    const result = addPausedDomain(ensureSnapshot().disabledSites, currentRulesDomain);
    updateSnapshot({ disabledSites: result.nextList });
    await persistStringList("disabledSites", result.nextList);
  } catch (error) {
    showError(error);
  }
}

async function handleEnableCurrentIsolation(): Promise<void> {
  if (!currentRulesDomain) return;
  try {
    const result = addDomainRule(ensureSnapshot().isolationModeSites, currentRulesDomain, "Isolation Mode is already enabled for this domain.");
    updateSnapshot({ isolationModeSites: result.nextList });
    await persistToggleableList("isolationModeSites", result.nextList);
  } catch (error) {
    showError(error);
  }
}

async function handleEnableCurrentForgetful(): Promise<void> {
  if (!currentRulesDomain) return;
  try {
    const result = addDomainRule(ensureSnapshot().forgetfulSites, currentRulesDomain, "Forgetful Browsing is already enabled for this domain.");
    updateSnapshot({ forgetfulSites: result.nextList });
    await persistToggleableList("forgetfulSites", result.nextList);
  } catch (error) {
    showError(error);
  }
}

function handleRecentActivityClick(activity: RuleActivityEntry): void {
  if (activity.category === "network") {
    networkSearch = activity.label;
    return;
  }
  hidingSearch = activity.label;
  expandedHidingDomains = new Set([...expandedHidingDomains, activity.label]);
}

onMount(async () => {
  const params = new URLSearchParams(window.location.search);
  const domain = params.get("domain");
  currentRulesDomain = domain ? normalizeDomain(domain) : null;
  const focus = params.get("focus");

  if (focus === "network-blocklist") {
    networkSearch = currentRulesDomain || "";
    networkOriginFilter = "all";
    await tick();
    document.getElementById("network-blocklist-rules")?.scrollIntoView({ block: "start" });
  }

  if (rulesSnapshot) {
    const latestMeta = await refreshNetworkBlocklistMeta();
    if (Object.keys(latestMeta).length > 0) {
      updateSnapshot({ networkBlocklistMeta: latestMeta });
    }
  }
});

$: recentActivity = getRecentActivity(rulesSnapshot);
$: pausedSites = (rulesSnapshot?.disabledSites || []).filter((domain) => matchesSearch(domain, pausedSearch));
$: isolationSites = getFilteredIndexedRules(rulesSnapshot?.isolationModeSites || [], isolationSearch);
$: forgetfulSites = getFilteredIndexedRules(rulesSnapshot?.forgetfulSites || [], forgetfulSearch);
$: wallFixes = getFilteredWallFixes(rulesSnapshot?.persistentWallFixes || {}, wallSearch);
$: builtInRules = getFilteredIndexedRules(rulesSnapshot?.defaultBlocklist || [], builtInSearch);
$: networkRules = getFilteredNetworkRules(rulesSnapshot);
$: focusDomainData = getEffectiveFocusDomains(rulesSnapshot?.focusBlocklist || []);
$: focusDomains = focusDomainData.domains.filter((domain) => matchesSearch(domain, focusSearch));
$: heuristicRules = getFilteredIndexedRules(rulesSnapshot?.heuristicKeywords || [], heuristicSearch);
$: customHidingDomains = getFilteredCustomHidingDomains(rulesSnapshot?.customHidingRules || {}, hidingSearch);
$: sitePolicySummaryChips = [
  { label: "Paused", value: rulesSnapshot?.disabledSites.length || 0 },
  { label: "Isolation On", value: (rulesSnapshot?.isolationModeSites || []).filter((rule) => rule.enabled !== false).length },
  { label: "Forgetful On", value: (rulesSnapshot?.forgetfulSites || []).filter((rule) => rule.enabled !== false).length },
  { label: "Wall Fixes", value: Object.keys(rulesSnapshot?.persistentWallFixes || {}).length },
  { label: "Hidden Domains", value: Object.keys(rulesSnapshot?.customHidingRules || {}).length },
] satisfies RulesSummaryChip[];
$: globalRuleSummaryChips = [
  { label: "Core Enabled", value: (rulesSnapshot?.defaultBlocklist || []).filter((rule) => rule.enabled !== false).length },
  { label: "Custom Network", value: rulesSnapshot?.networkBlocklist.length || 0 },
  { label: "Focus Source", value: focusDomainData.usesDefaults ? "Default" : "Custom" },
  { label: "Heuristics On", value: (rulesSnapshot?.heuristicKeywords || []).filter((rule) => rule.enabled !== false).length },
  { label: "Hidden Domains", value: Object.keys(rulesSnapshot?.customHidingRules || {}).length },
] satisfies RulesSummaryChip[];
</script>

<section class="content-section active zg-my-rules-shell">
  <div class="content-header"><h1>My Rules</h1></div>

  <div class="info-box">
    <p><strong>Use rules sparingly.</strong> Start with the smallest change that solves the problem. Site-specific rules are easier to maintain than large global lists.</p>
  </div>

  {#if currentRulesDomain}
    <RulesCurrentSiteContext
      domain={currentRulesDomain}
      onPause={handlePauseCurrentSite}
      onIsolation={handleEnableCurrentIsolation}
      onForgetful={handleEnableCurrentForgetful}
    />
  {/if}

  <div class="rules-tables-container">
    <RulesGroupHeading
      title="Recent Rule Activity"
      description="Latest manual custom-network changes and self-heal touches that ZenithGuard has real timestamps for."
      tag="Recent"
    />

    <RecentRuleActivity activity={recentActivity} {formatRuleTimestamp} onSelect={handleRecentActivityClick} />

    <RulesGroupHeading
      title="Site Policy"
      description="Per-site controls for pausing protection, isolating third-party content, clearing local data, wall fixes, and saved page cleanup."
      tag="Current Site First"
      tagTone="recommended"
    />

    <RulesSummaryStrip chips={sitePolicySummaryChips} />

    <PausedSitesTable
      totalCount={rulesSnapshot?.disabledSites.length || 0}
      bind:newDomain={newPausedDomain}
      bind:search={pausedSearch}
      {pausedSites}
      onAdd={handleAddPausedDomain}
      onResume={handleResumeProtection}
      onClearSearch={() => clearSearch("paused")}
    />

    <ToggleableDomainTable
      title="Isolation Mode Sites"
      count={rulesSnapshot?.isolationModeSites.length || 0}
      description="Sites that should load with stricter third-party isolation."
      note="Isolation Mode blocks third-party scripts, objects, and frames for the selected site."
      inputLabel="Domain to add to isolation mode"
      inputPlaceholder="Enter domain or URL"
      addButtonLabel="Add Site"
      searchPlaceholder="Search isolation mode sites"
      bind:search={isolationSearch}
      bind:newDomain={newIsolationDomain}
      entries={isolationSites}
      emptySearchMessage="No isolation mode sites match this search."
      emptyDefaultMessage="No isolated sites yet. Add a site here if you want stricter third-party blocking on it."
      onAdd={handleAddIsolationDomain}
      onToggle={handleToggleIsolation}
      onRemove={handleRemoveIsolationDomain}
      onBulkEnable={() => handleBulkIsolation(true)}
      onBulkDisable={() => handleBulkIsolation(false)}
      onClearSearch={() => clearSearch("isolation")}
    />

    <ToggleableDomainTable
      title="Forgetful Browsing Sites"
      count={rulesSnapshot?.forgetfulSites.length || 0}
      description="Clear site data automatically when tabs from these domains close."
      note="ZenithGuard clears cookies, cache, local storage, IndexedDB, Cache Storage, and service workers for these sites when you close their tabs."
      inputLabel="Domain to add to forgetful browsing"
      inputPlaceholder="Enter domain or URL"
      addButtonLabel="Add Site"
      searchPlaceholder="Search forgetful browsing sites"
      bind:search={forgetfulSearch}
      bind:newDomain={newForgetfulDomain}
      entries={forgetfulSites}
      emptySearchMessage="No forgetful browsing sites match this search."
      emptyDefaultMessage="No forgetful sites yet. Add a site here if you want its data cleared on tab close."
      onAdd={handleAddForgetfulDomain}
      onToggle={handleToggleForgetful}
      onRemove={handleRemoveForgetfulDomain}
      onBulkEnable={() => handleBulkForgetful(true)}
      onBulkDisable={() => handleBulkForgetful(false)}
      onClearSearch={() => clearSearch("forgetful")}
    />

    <WallFixesTable
      totalCount={Object.keys(rulesSnapshot?.persistentWallFixes || {}).length}
      bind:search={wallSearch}
      {wallFixes}
      onToggle={handleToggleWallFix}
      onRemove={handleDeleteWallFix}
      onBulkEnable={() => handleBulkWallFixes(true)}
      onBulkDisable={() => handleBulkWallFixes(false)}
      onClearSearch={() => clearSearch("wall")}
    />

    <RulesGroupHeading
      title="Global Rule Layers"
      description="Broader protection inputs that shape ZenithGuard across many sites: shipped core rules, custom network blocks, focus targets, heuristics, and saved cosmetic cleanup."
      tag="Broader Scope"
      tagTone="neutral"
    />

    <RulesSummaryStrip chips={globalRuleSummaryChips} />
    <CoreRulesTable
      totalCount={rulesSnapshot?.defaultBlocklist.length || 0}
      enabledCount={(rulesSnapshot?.defaultBlocklist || []).filter((rule) => rule.enabled !== false).length}
      bind:search={builtInSearch}
      rules={builtInRules}
      onToggle={handleToggleBuiltIn}
      onBulkEnable={() => handleBulkBuiltIn(true)}
      onBulkDisable={() => handleBulkBuiltIn(false)}
      onReset={handleResetBuiltIn}
      onClearSearch={() => clearSearch("built-in")}
    />

    <NetworkBlocklistTable
      totalCount={rulesSnapshot?.networkBlocklist.length || 0}
      bind:search={networkSearch}
      bind:originFilter={networkOriginFilter}
      bind:newDomain={newNetworkDomain}
      rules={networkRules}
      meta={rulesSnapshot?.networkBlocklistMeta || {}}
      {formatRuleTimestamp}
      {getCustomOriginLabel}
      onAdd={handleAddNetworkRule}
      onToggle={handleToggleNetwork}
      onDelete={handleDeleteNetworkRule}
      onBulkEnable={() => handleBulkNetwork(true)}
      onBulkDisable={() => handleBulkNetwork(false)}
      onClearSearch={clearNetworkFilters}
    />

    <FocusDomainsTable
      totalCount={focusDomainData.domains.length}
      usesDefaults={focusDomainData.usesDefaults}
      bind:search={focusSearch}
      bind:newDomain={newFocusDomain}
      domains={focusDomains}
      onAdd={handleAddFocusDomain}
      onRemove={handleRemoveFocusDomain}
      onReset={handleResetFocusDomains}
      onClearSearch={() => clearSearch("focus")}
    />

    <HeuristicKeywordsTable
      totalCount={rulesSnapshot?.heuristicKeywords.length || 0}
      enabledCount={(rulesSnapshot?.heuristicKeywords || []).filter((rule) => rule.enabled !== false).length}
      bind:search={heuristicSearch}
      bind:newKeyword={newHeuristicKeyword}
      rules={heuristicRules}
      onAdd={handleAddHeuristicKeyword}
      onToggle={handleToggleHeuristic}
      onDelete={handleDeleteHeuristicKeyword}
      onBulkEnable={() => handleBulkHeuristic(true)}
      onBulkDisable={() => handleBulkHeuristic(false)}
      onReset={handleResetHeuristics}
      onClearSearch={() => clearSearch("heuristic")}
    />

    <CustomHidingTable
      totalCount={Object.keys(rulesSnapshot?.customHidingRules || {}).length}
      bind:search={hidingSearch}
      domains={customHidingDomains}
      expandedDomains={expandedHidingDomains}
      {formatRuleTimestamp}
      onToggleDomain={handleToggleHidingDomain}
      onDeleteDomain={handleDeleteHidingDomain}
      onDeleteRule={handleDeleteSingleHidingRule}
      onClearSearch={() => clearSearch("hiding")}
    />
  </div>
</section>


