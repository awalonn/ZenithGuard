import { buildIsolationModeRules, buildMalwareRules, buildUserAllowlistRules } from "../../src/js/background/modules/rule_engine";

describe("buildMalwareRules", () => {
    beforeEach(() => {
        (globalThis as { chrome?: typeof chrome }).chrome = {
            runtime: {
                getURL: (path: string) => `chrome-extension://zenithguard/${path}`,
            },
        } as typeof chrome;
    });

    it("excludes paused sites for both initiator and request domains", () => {
        const rules = buildMalwareRules(
            ["dangerous.example", "tracker.bad"],
            ["reddit.com", "news.example"],
            10,
        );

        expect(rules).toHaveLength(1);
        expect(rules[0]).toMatchObject({
            action: {
                type: "redirect",
                redirect: {
                    url: "chrome-extension://zenithguard/src/pages/blocked.html",
                },
            },
            condition: {
                requestDomains: ["dangerous.example", "tracker.bad"],
                resourceTypes: ["main_frame"],
                excludedInitiatorDomains: ["reddit.com", "news.example"],
                excludedRequestDomains: ["reddit.com", "news.example"],
            },
        });
    });

    it("respects the rule budget when building malware chunks", () => {
        const domains = Array.from({ length: 8005 }, (_, index) => `malware-${index}.example`);

        const rules = buildMalwareRules(domains, [], 2);

        expect(rules).toHaveLength(2);
        expect(rules[0].condition?.requestDomains).toHaveLength(4000);
        expect(rules[1].condition?.requestDomains).toHaveLength(4000);
    });

    it("builds allow rules that cover both apex and www variants of an allowlisted site", () => {
        const rules = buildUserAllowlistRules(["washingtonpost.com"]);

        expect(rules).toHaveLength(3);
        expect(rules[0]).toMatchObject({
            action: { type: "allowAllRequests" },
            condition: {
                requestDomains: ["washingtonpost.com", "www.washingtonpost.com"],
                resourceTypes: ["main_frame", "sub_frame"],
            },
        });
        expect(rules[1]).toMatchObject({
            action: { type: "allow" },
            condition: {
                requestDomains: ["washingtonpost.com", "www.washingtonpost.com"],
            },
        });
        expect(rules[2]).toMatchObject({
            action: { type: "allow" },
            condition: {
                initiatorDomains: ["washingtonpost.com", "www.washingtonpost.com"],
            },
        });
    });

    it("builds isolation rules that cover both apex and www variants of a site", () => {
        const rules = buildIsolationModeRules([
            { value: "washingtonpost.com", enabled: true },
        ]);

        expect(rules).toHaveLength(1);
        expect(rules[0]).toMatchObject({
            action: { type: "block" },
            condition: {
                initiatorDomains: ["washingtonpost.com", "www.washingtonpost.com"],
                domainType: "thirdParty",
                resourceTypes: ["script", "object", "sub_frame"],
            },
        });
    });
});
