import { jest } from "@jest/globals";

const openLoggerPage = jest.fn();
const openSettingsPage = jest.fn();
const openAnalyzerPage = jest.fn();
const getActiveTab = jest.fn();
const getTabById = jest.fn();

jest.unstable_mockModule("../../src/js/shared/browser", () => ({
    openLoggerPage,
    openSettingsPage,
    openAnalyzerPage,
    getActiveTab,
    getTabById,
}));

const analyzerController = await import("../../src/ui/analyzer/analyzer_controller");
const loggerController = await import("../../src/ui/logger/logger_controller");

describe("analyzer/logger handoff controllers", () => {
    beforeEach(() => {
        openLoggerPage.mockReset();
        openSettingsPage.mockReset();
        openAnalyzerPage.mockReset();
        getActiveTab.mockReset();
        getTabById.mockReset();
    });

    it("opens Logger from Analyzer with tab and domain search without a stale status filter", async () => {
        await analyzerController.openFindingInLogger(17, {
            domain: "redditstatic.com",
            observedStatus: "blocked",
        } as Parameters<typeof analyzerController.openFindingInLogger>[1]);

        expect(openLoggerPage).toHaveBeenCalledWith({
            tabId: 17,
            search: "redditstatic.com",
        });
    });

    it("opens My Rules from Analyzer scoped to the matched domain", async () => {
        await analyzerController.manageFindingInRules({
            domain: "example.com",
        } as Parameters<typeof analyzerController.manageFindingInRules>[0]);

        expect(openSettingsPage).toHaveBeenCalledWith({
            section: "my-rules",
            domain: "example.com",
            focus: "network-blocklist",
        });
    });

    it("opens Analyzer from Logger for the current tab", async () => {
        await loggerController.openLoggerAnalyzer(42);

        expect(openAnalyzerPage).toHaveBeenCalledWith(42);
    });

    it("opens My Rules from Logger scoped to the selected entry domain", async () => {
        await loggerController.manageLoggerEntryInRules({
            domain: "mgid.com",
        } as Parameters<typeof loggerController.manageLoggerEntryInRules>[0]);

        expect(openSettingsPage).toHaveBeenCalledWith({
            section: "my-rules",
            domain: "mgid.com",
            focus: "network-blocklist",
        });
    });
});
