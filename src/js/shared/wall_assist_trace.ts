import { getLocal, setLocal } from "./storage_api";
import { findMatchingRecordEntry } from "./hostname_matching";

export type WallAssistTraceTone = "info" | "success" | "error";
export type WallAssistTraceStatus = "running" | "success" | "partial" | "no-result" | "error";

export type WallAssistTraceStage = {
    label: string;
    tone: WallAssistTraceTone;
    timestamp: number;
};

export type WallAssistTrace = {
    domain: string;
    pageUrl?: string;
    status: WallAssistTraceStatus;
    summary: string;
    startedAt: number;
    updatedAt: number;
    lastError?: string;
    overlaySelector?: string;
    contentUnlockSelector?: string;
    stages: WallAssistTraceStage[];
};

const WALL_ASSIST_TRACE_KEY = "wallAssistTraceByHostname";
const MAX_TRACE_STAGES = 8;

function normalizeHostname(hostname: string): string {
    return String(hostname || "").trim().toLowerCase();
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object";
}

function createRunningTrace(hostname: string, timestamp: number): WallAssistTrace {
    return {
        domain: hostname,
        status: "running",
        summary: "Wall assist run started.",
        startedAt: timestamp,
        updatedAt: timestamp,
        stages: [],
    };
}

function sanitizeStage(value: unknown): WallAssistTraceStage | null {
    if (!isObjectLike(value)) {
        return null;
    }

    const label = typeof value.label === "string" ? value.label.trim() : "";
    if (!label) {
        return null;
    }

    return {
        label,
        tone: value.tone === "success" || value.tone === "error" ? value.tone : "info",
        timestamp: typeof value.timestamp === "number" ? value.timestamp : Date.now(),
    };
}

function sanitizeTrace(value: unknown, hostname: string): WallAssistTrace | null {
    if (!isObjectLike(value)) {
        return null;
    }

    const stages = Array.isArray(value.stages)
        ? value.stages.map(sanitizeStage).filter((stage): stage is WallAssistTraceStage => Boolean(stage)).slice(0, MAX_TRACE_STAGES)
        : [];

    return {
        domain: normalizeHostname(typeof value.domain === "string" ? value.domain : hostname),
        pageUrl: typeof value.pageUrl === "string" ? value.pageUrl : undefined,
        status: value.status === "success" || value.status === "partial" || value.status === "no-result" || value.status === "error"
            ? value.status
            : "running",
        summary: typeof value.summary === "string" && value.summary.trim()
            ? value.summary.trim()
            : "Wall assist run started.",
        startedAt: typeof value.startedAt === "number" ? value.startedAt : Date.now(),
        updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : Date.now(),
        lastError: typeof value.lastError === "string" ? value.lastError : undefined,
        overlaySelector: typeof value.overlaySelector === "string" ? value.overlaySelector : undefined,
        contentUnlockSelector: typeof value.contentUnlockSelector === "string" ? value.contentUnlockSelector : undefined,
        stages,
    };
}

function mergeTraceIntoMap(
    traces: Record<string, WallAssistTrace>,
    hostname: string,
    trace: WallAssistTrace,
): void {
    const matchingKey = findMatchingRecordEntry(traces, hostname)?.key;
    if (!matchingKey) {
        traces[hostname] = trace;
        return;
    }

    const current = traces[matchingKey];
    if (!current || trace.updatedAt >= current.updatedAt) {
        traces[matchingKey] = {
            ...trace,
            domain: matchingKey,
        };
    }
}

export async function getWallAssistTraceMap(): Promise<Record<string, WallAssistTrace>> {
    const snapshot = await getLocal<Record<string, unknown>>(WALL_ASSIST_TRACE_KEY);
    const rawMap = isObjectLike(snapshot[WALL_ASSIST_TRACE_KEY])
        ? snapshot[WALL_ASSIST_TRACE_KEY]
        : {};

    const normalized: Record<string, WallAssistTrace> = {};
    for (const [rawHostname, rawTrace] of Object.entries(rawMap)) {
        const hostname = normalizeHostname(rawHostname);
        if (!hostname) {
            continue;
        }

        const trace = sanitizeTrace(rawTrace, hostname);
        if (trace) {
            mergeTraceIntoMap(normalized, hostname, trace);
        }
    }

    return normalized;
}

async function writeWallAssistTraceMap(nextMap: Record<string, WallAssistTrace>): Promise<void> {
    await setLocal({ [WALL_ASSIST_TRACE_KEY]: nextMap });
}

function resolveTraceBucketKey(
    traces: Record<string, WallAssistTrace>,
    hostname: string,
): string {
    return findMatchingRecordEntry(traces, hostname)?.key || hostname;
}

export async function startWallAssistTrace(hostname: string, pageUrl?: string): Promise<void> {
    const normalizedHostname = normalizeHostname(hostname);
    if (!normalizedHostname) {
        return;
    }

    const now = Date.now();
    const currentMap = await getWallAssistTraceMap();
    const bucketKey = resolveTraceBucketKey(currentMap, normalizedHostname);
    currentMap[bucketKey] = {
        domain: bucketKey,
        pageUrl,
        status: "running",
        summary: "Wall assist run started.",
        startedAt: now,
        updatedAt: now,
        stages: [{ label: "Run started", tone: "info", timestamp: now }],
    };

    await writeWallAssistTraceMap(currentMap);
}

export async function appendWallAssistTraceStage(
    hostname: string,
    label: string,
    tone: WallAssistTraceTone = "info",
): Promise<void> {
    const normalizedHostname = normalizeHostname(hostname);
    const normalizedLabel = String(label || "").trim();
    if (!normalizedHostname || !normalizedLabel) {
        return;
    }

    const now = Date.now();
    const currentMap = await getWallAssistTraceMap();
    const bucketKey = resolveTraceBucketKey(currentMap, normalizedHostname);
    const currentTrace = currentMap[bucketKey] || createRunningTrace(bucketKey, now);

    currentMap[bucketKey] = {
        ...currentTrace,
        updatedAt: now,
        stages: [...currentTrace.stages, { label: normalizedLabel, tone, timestamp: now }].slice(-MAX_TRACE_STAGES),
    };

    await writeWallAssistTraceMap(currentMap);
}

export async function completeWallAssistTrace(
    hostname: string,
    payload: {
        status: WallAssistTraceStatus;
        summary: string;
        pageUrl?: string;
        lastError?: string;
        overlaySelector?: string;
        contentUnlockSelector?: string;
        finalStageLabel?: string;
        finalStageTone?: WallAssistTraceTone;
    },
): Promise<void> {
    const normalizedHostname = normalizeHostname(hostname);
    if (!normalizedHostname) {
        return;
    }

    const now = Date.now();
    const currentMap = await getWallAssistTraceMap();
    const bucketKey = resolveTraceBucketKey(currentMap, normalizedHostname);
    const currentTrace = currentMap[bucketKey] || createRunningTrace(bucketKey, now);

    const stages = [...currentTrace.stages];
    if (payload.finalStageLabel) {
        stages.push({
            label: payload.finalStageLabel,
            tone: payload.finalStageTone || (payload.status === "error" ? "error" : payload.status === "success" ? "success" : "info"),
            timestamp: now,
        });
    }

    currentMap[bucketKey] = {
        ...currentTrace,
        pageUrl: payload.pageUrl || currentTrace.pageUrl,
        status: payload.status,
        summary: payload.summary,
        updatedAt: now,
        lastError: payload.lastError,
        overlaySelector: payload.overlaySelector,
        contentUnlockSelector: payload.contentUnlockSelector,
        stages: stages.slice(-MAX_TRACE_STAGES),
    };

    await writeWallAssistTraceMap(currentMap);
}
