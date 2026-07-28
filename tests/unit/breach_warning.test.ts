import { jest } from "@jest/globals";

const getLocal = jest.fn() as jest.Mock;
const setLocal = jest.fn() as jest.Mock;

jest.unstable_mockModule("../../src/js/shared/storage_api", () => ({
    getLocal,
    setLocal,
}));

const { BreachWarning, getBreachDismissedKey } = await import("../../src/js/content/modules/BreachWarning");

describe("BreachWarning", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
        sessionStorage.clear();
        getLocal.mockReset();
        setLocal.mockReset();
        jest.restoreAllMocks();
        (getLocal as any).mockResolvedValue({ toolActivityLog: [] });
    });

    it("uses the same dismissal key for www and apex variants", () => {
        expect(getBreachDismissedKey("www.washingtonpost.com")).toBe(
            getBreachDismissedKey("washingtonpost.com"),
        );
    });

    it("keeps unrelated subdomains distinct", () => {
        expect(getBreachDismissedKey("blog.example.com")).not.toBe(
            getBreachDismissedKey("example.com"),
        );
    });

    it("shows an accessible breach warning banner", () => {
        const warning = new BreachWarning(jest.fn());

        warning.setBreached(true);

        const banner = document.getElementById("zg-breach-warning-banner") as HTMLElement | null;
        expect(banner).not.toBeNull();
        expect(banner?.getAttribute("role")).toBe("alert");
        expect(banner?.getAttribute("aria-live")).toBe("polite");
        expect(banner?.textContent).toContain("Data breach notice:");
        expect(banner?.textContent).toContain("Dismiss for this tab");

        warning.setBreached(false);
    });

    it("records tool activity when the banner is shown", async () => {
        const warning = new BreachWarning(jest.fn());

        warning.setBreached(true);
        await Promise.resolve();
        await Promise.resolve();

        expect(setLocal).toHaveBeenCalledWith({
            toolActivityLog: [
                expect.objectContaining({
                    tool: "Data Breach Warning",
                    title: "Breach Warning Shown",
                    message: "Displayed a breach-history warning banner for this site.",
                    tone: "info",
                    domain: window.location.hostname,
                }),
            ],
        });

        warning.setBreached(false);
    });

    it("records banner activity only once per instance", async () => {
        const warning = new BreachWarning(jest.fn());

        warning.setBreached(true);
        warning.setBreached(false);
        warning.setBreached(true);
        await Promise.resolve();
        await Promise.resolve();

        expect(setLocal).toHaveBeenCalledTimes(1);

        warning.setBreached(false);
    });

    it("dismisses the banner for the current tab session", () => {
        const warning = new BreachWarning(jest.fn());

        warning.setBreached(true);
        document.querySelector<HTMLButtonElement>(".zenithguard-breach-warning .z-dismiss-btn")?.click();
        warning.setBreached(true);

        expect(document.getElementById("zg-breach-warning-banner")).toBeNull();
        expect(sessionStorage.getItem(getBreachDismissedKey(window.location.hostname))).toBe("true");
    });

    it("removes the banner when the current site is no longer marked breached", () => {
        const warning = new BreachWarning(jest.fn());

        warning.setBreached(true);
        warning.setBreached(false);

        expect(document.getElementById("zg-breach-warning-banner")).toBeNull();
    });

    it("shows a password reminder only while the site is marked breached", () => {
        const showToast = jest.fn();
        const warning = new BreachWarning(showToast);
        const input = document.createElement("input");
        input.type = "password";
        document.body.append(input);

        warning.setBreached(false);
        input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
        expect(showToast).not.toHaveBeenCalled();

        warning.setBreached(true);
        input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

        expect(showToast).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringContaining("known data breach"),
            type: "error",
        }));

        warning.setBreached(false);
    });
});
