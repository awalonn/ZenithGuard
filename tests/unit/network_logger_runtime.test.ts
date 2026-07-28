import { jest } from "@jest/globals";

import {
    clearDynamicRuleMetadata,
    setDynamicRuleMetadata,
} from "../../src/js/background/modules/network_logger/dnr_pipeline";
import {
    addNetworkRequest,
    resetTabLogs,
    type NetworkLogEntry,
} from "../../src/js/background/modules/network_logger/log_store";
import { createNetworkLoggerPipeline, toRuleMatchedDebugEvent } from "../../src/js/background/modules/network_logger/runtime";

describe("network logger runtime", () => {
    beforeEach(() => {
        clearDynamicRuleMetadata();
        resetTabLogs(11, 100);
        resetTabLogs(12, 100);
    });

    it("uses stored dynamic rule metadata when updating an existing log entry", () => {
        const sendLogUpdate = jest.fn();
        const pipeline = createNetworkLoggerPipeline({
            hasTabLogs: () => true,
            sendLogUpdate,
        });
        const log = addNetworkRequest({
            tabId: 11,
            url: "https://ads.example/script.js",
            type: "script",
            initiator: "https://site.example",
            timeStamp: 200,
        });
        setDynamicRuleMetadata(new Map([
            [10_000, {
                source: "Network Blocklist",
                category: "User",
                detail: "Matched user block rule: ads.example",
                matchedValue: "ads.example",
            }],
        ]));

        pipeline.handleRuleMatched({
            request: {
                tabId: 11,
                url: "https://ads.example/script.js",
                type: "script",
                initiator: "https://site.example",
            },
            rule: {
                ruleId: 10_000,
                rulesetId: "_dynamic",
            },
        });

        expect(log?.matchedRuleInfo).toEqual({
            ruleId: 10_000,
            source: "Network Blocklist",
            category: "User",
            detail: "Matched user block rule: ads.example",
            matchedValue: "ads.example",
        });
        expect(sendLogUpdate).toHaveBeenCalledWith(11, log);
    });

    it("uses stored dynamic rule metadata when applying a queued rule match", () => {
        const pipeline = createNetworkLoggerPipeline({
            hasTabLogs: () => false,
            sendLogUpdate: jest.fn(),
        });
        setDynamicRuleMetadata(new Map([
            [20_000, {
                source: "YouTube Ads",
                category: "Media",
                detail: "Matched dynamic YouTube override: /ad_break/",
                matchedValue: "/ad_break/",
            }],
        ]));

        pipeline.handleRuleMatched({
            request: {
                tabId: 12,
                url: "https://youtube.com/api/ad_break?x=1",
                type: "xmlhttprequest",
            },
            rule: {
                ruleId: 20_000,
                rulesetId: "_dynamic",
            },
        });

        const log = addNetworkRequest({
            tabId: 12,
            url: "https://youtube.com/api/ad_break?x=1",
            type: "xmlhttprequest",
            timeStamp: 301,
        }) as NetworkLogEntry;
        pipeline.applyPendingMatch(12, log.url, log);

        expect(log.matchedRuleInfo).toEqual({
            ruleId: 20_000,
            source: "YouTube Ads",
            category: "Media",
            detail: "Matched dynamic YouTube override: /ad_break/",
            matchedValue: "/ad_break/",
        });
    });

    it("adapts Chrome rule-match debug events to the logger pipeline shape", () => {
        const event = toRuleMatchedDebugEvent({
            request: {
                tabId: 14,
                url: "https://ads.example/script.js",
                type: "script",
                initiator: "https://site.example",
                frameId: 0,
                method: "GET",
                parentFrameId: -1,
                requestId: "request-1",
            },
            rule: {
                ruleId: 30_000,
                rulesetId: "core_protection",
            },
        });

        expect(event).toEqual({
            request: {
                tabId: 14,
                url: "https://ads.example/script.js",
                type: "script",
                initiator: "https://site.example",
            },
            rule: {
                ruleId: 30_000,
                rulesetId: "core_protection",
            },
        });
    });
});
