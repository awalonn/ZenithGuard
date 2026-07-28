import { shouldResetTransientPopupState } from "../../src/ui/popup/session_state";

describe("popup transient session state", () => {
    it("resets transient popup state when the tab scope changes", () => {
        expect(shouldResetTransientPopupState(
            {
                tabId: 7,
                hostname: "example.com",
                pageUrl: "https://example.com/article",
                isExtensionPage: false,
            },
            {
                tabId: 8,
                hostname: "example.org",
                pageUrl: "https://example.org/home",
                isExtensionPage: false,
            },
        )).toBe(true);
    });

    it("keeps transient popup state when the page scope stays the same", () => {
        expect(shouldResetTransientPopupState(
            {
                tabId: 7,
                hostname: "example.com",
                pageUrl: "https://example.com/article",
                isExtensionPage: false,
            },
            {
                tabId: 7,
                hostname: "example.com",
                pageUrl: "https://example.com/article",
                isExtensionPage: false,
            },
        )).toBe(false);
    });
});
