import {
    getAnalyzerPageUrl,
    getLoggerPageUrl,
    getSettingsPageUrl,
} from "../../src/js/shared/browser";

describe("shared browser helpers", () => {
    beforeEach(() => {
        (globalThis as { chrome?: typeof chrome }).chrome = {
            runtime: {
                getURL: (path: string) => `chrome-extension://zenithguard/${path}`,
            },
        } as typeof chrome;
    });

    it("builds analyzer urls with tab id", () => {
        expect(getAnalyzerPageUrl(7)).toBe(
            "chrome-extension://zenithguard/src/pages/analyzer.html?tabId=7",
        );
    });

    it("builds logger urls with filters", () => {
        expect(
            getLoggerPageUrl({
                tabId: 11,
                search: "redditstatic",
                source: "Built-in",
                status: "blocked",
                review: "needs-review",
            }),
        ).toBe(
            "chrome-extension://zenithguard/src/pages/logger.html?tabId=11&search=redditstatic&source=Built-in&status=blocked&review=needs-review",
        );
    });

    it("builds settings urls with section and domain filters", () => {
        expect(
            getSettingsPageUrl({
                section: "my-rules",
                domain: "example.com",
                focus: "network-blocklist",
            }),
        ).toBe(
            "chrome-extension://zenithguard/src/pages/settings.html?section=my-rules&domain=example.com&focus=network-blocklist",
        );
    });
});
