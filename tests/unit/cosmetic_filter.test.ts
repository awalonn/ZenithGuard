import { jest } from "@jest/globals";

const getLocal = jest.fn() as jest.Mock;
const getSync = jest.fn() as jest.Mock;
const setLocal = jest.fn() as jest.Mock;
const setSync = jest.fn() as jest.Mock;

jest.unstable_mockModule("../../src/js/shared/storage_api", () => ({
    getLocal,
    getSync,
    setLocal,
    setSync,
}));

const { CosmeticFilter, findMatchingRuleBucketKey } = await import("../../src/js/content/modules/CosmeticFilter");

describe("CosmeticFilter", () => {
    beforeEach(() => {
        getLocal.mockReset();
        getSync.mockReset();
        setLocal.mockReset();
        setSync.mockReset();
        jest.restoreAllMocks();
        document.head.innerHTML = "";
        document.body.innerHTML = "";
    });

    it("records manual tool activity when a new hiding rule is saved", async () => {
        (getSync as any).mockResolvedValue({ customHidingRules: {} });
        (getLocal as any).mockResolvedValue({ toolActivityLog: [] });

        const showToast = jest.fn();
        const filter = new CosmeticFilter(showToast);

        await filter.saveHidingRule(".paywall", {
            tool: "Inspector",
            title: "Inspector Hide Saved",
            message: "Saved a manual hiding rule from Inspector.",
        });

        expect(setSync).toHaveBeenCalledWith({
            customHidingRules: {
                "localhost": [
                    { value: ".paywall", enabled: true },
                ],
            },
        });
        expect(setLocal).toHaveBeenCalledWith({
            toolActivityLog: [
                expect.objectContaining({
                    tool: "Inspector",
                    title: "Inspector Hide Saved",
                    message: "Saved a manual hiding rule from Inspector.",
                    tone: "success",
                    domain: "localhost",
                }),
            ],
        });
        expect(showToast).toHaveBeenCalledWith({ message: "Hiding rule saved!" });
    });

    it("does not record tool activity for duplicate hiding rules", async () => {
        (getSync as any).mockResolvedValue({
            customHidingRules: {
                "localhost": [
                    { value: ".paywall", enabled: true },
                ],
            },
        });

        const showToast = jest.fn();
        const filter = new CosmeticFilter(showToast);

        await filter.saveHidingRule(".paywall", {
            tool: "Inspector",
            title: "Inspector Hide Saved",
        });

        expect(setSync).not.toHaveBeenCalled();
        expect(setLocal).not.toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith({ message: "This hiding rule already exists." });
    });

    it("re-enables an existing disabled hiding rule instead of treating it as a duplicate", async () => {
        (getSync as any).mockResolvedValue({
            customHidingRules: {
                "localhost": [
                    { value: ".paywall", enabled: false },
                ],
            },
        });
        (getLocal as any).mockResolvedValue({ toolActivityLog: [] });

        const showToast = jest.fn();
        const filter = new CosmeticFilter(showToast);

        await filter.saveHidingRule(".paywall", {
            tool: "Zapper",
            title: "Zapper Hide Saved",
            message: "Saved a hiding rule from Zapper cleanup.",
        });

        expect(setSync).toHaveBeenCalledWith({
            customHidingRules: {
                "localhost": [
                    { value: ".paywall", enabled: true },
                ],
            },
        });
        expect(setLocal).toHaveBeenCalledWith({
            toolActivityLog: [
                expect.objectContaining({
                    tool: "Zapper",
                    domain: "localhost",
                }),
            ],
        });
        expect(showToast).toHaveBeenCalledWith({ message: "Hiding rule saved!" });
    });

    it("finds an apex-domain hiding-rule bucket from a www hostname", () => {
        const key = findMatchingRuleBucketKey("www.example.com", {
            "example.com": [
                { value: ".existing", enabled: true },
            ],
        });

        expect(key).toBe("example.com");
    });

    it("finds a www hiding-rule bucket from an apex hostname", () => {
        const key = findMatchingRuleBucketKey("example.com", {
            "www.example.com": [
                { value: ".existing", enabled: true },
            ],
        });

        expect(key).toBe("www.example.com");
    });

    it("keeps built-in ad slot cleanup active when late placeholders are inserted without custom rules", async () => {
        jest.useFakeTimers();

        try {
            const filter = new CosmeticFilter(jest.fn());
            filter.applyHidingRules([], "custom");

            const style = document.getElementById("zenithguard-styles-custom") as HTMLStyleElement | null;
            expect(style?.textContent).toContain("google_ads_iframe");

            const container = document.createElement("div");
            container.className = "ad-container";
            const frame = document.createElement("iframe");
            frame.id = "google_ads_iframe_/123";
            container.appendChild(frame);
            document.body.appendChild(container);

            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(150);
            await Promise.resolve();

            expect(frame.style.display).toBe("none");
            expect(container.style.display).toBe("none");
        } finally {
            jest.useRealTimers();
        }
    });

    it("does not rescan built-in cleanup after unrelated DOM mutations", async () => {
        jest.useFakeTimers();

        try {
            const filter = new CosmeticFilter(jest.fn());
            const cleanupSpy = jest.spyOn(filter as any, "collapseBuiltInAdPlaceholders");
            filter.applyHidingRules([], "custom");
            cleanupSpy.mockClear();

            const card = document.createElement("section");
            card.className = "post-card video-player-shell";
            card.textContent = "Discussion text";
            document.body.appendChild(card);

            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(150);
            await Promise.resolve();

            expect(cleanupSpy).not.toHaveBeenCalled();
        } finally {
            jest.useRealTimers();
        }
    });

    it("still rescans built-in cleanup when a late ad-like subtree is inserted", async () => {
        jest.useFakeTimers();

        try {
            const filter = new CosmeticFilter(jest.fn());
            filter.applyHidingRules([], "custom");

            const container = document.createElement("div");
            container.className = "ad-container";
            const frame = document.createElement("iframe");
            frame.name = "google_ads_iframe_/late";
            container.appendChild(frame);
            document.body.appendChild(container);

            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(150);
            await Promise.resolve();

            expect(frame.style.display).toBe("none");
            expect(container.style.display).toBe("none");
        } finally {
            jest.useRealTimers();
        }
    });

    it("collapses generic ad-only wrappers around known Google ad frames", async () => {
        jest.useFakeTimers();

        try {
            const filter = new CosmeticFilter(jest.fn());
            filter.applyHidingRules([], "custom");

            const shell = document.createElement("div");
            shell.id = "third-party-shell";
            const frame = document.createElement("iframe");
            frame.src = "https://googleads.g.doubleclick.net/pagead/ads?client=ca-pub-123";
            shell.appendChild(frame);
            document.body.appendChild(shell);

            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(150);
            await Promise.resolve();

            expect(frame.style.display).toBe("none");
            expect(shell.style.display).toBe("none");
        } finally {
            jest.useRealTimers();
        }
    });

    it("does not sandbox Google Identity Services frames", () => {
        const identityFrame = document.createElement("iframe");
        identityFrame.src = "https://accounts.google.com/gsi/button";
        const ordinaryThirdPartyFrame = document.createElement("iframe");
        ordinaryThirdPartyFrame.src = "https://embed.example/video";
        document.body.append(identityFrame, ordinaryThirdPartyFrame);

        const filter = new CosmeticFilter(jest.fn());
        filter.applyIframeSandboxing();

        expect(identityFrame.hasAttribute("sandbox")).toBe(false);
        expect(ordinaryThirdPartyFrame.getAttribute("sandbox"))
            .toBe("allow-scripts allow-same-origin allow-presentation allow-popups allow-forms");
    });

    it("keeps cleanup active for late ad shells inserted inside open shadow roots", async () => {
        jest.useFakeTimers();

        try {
            const host = document.createElement("div");
            document.body.appendChild(host);
            const shadowRoot = host.attachShadow({ mode: "open" });

            const filter = new CosmeticFilter(jest.fn());
            filter.applyHidingRules([], "custom");

            const shell = document.createElement("div");
            shell.className = "ad-container";
            const frame = document.createElement("iframe");
            frame.name = "google_ads_iframe_/shadow";
            shell.appendChild(frame);
            shadowRoot.appendChild(shell);

            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(150);
            await Promise.resolve();

            expect(frame.style.display).toBe("none");
            expect(shell.style.display).toBe("none");
        } finally {
            jest.useRealTimers();
        }
    });

    it("does not collapse content containers that also contain meaningful page text", async () => {
        jest.useFakeTimers();

        try {
            const filter = new CosmeticFilter(jest.fn());
            filter.applyHidingRules([], "custom");

            const article = document.createElement("article");
            article.textContent = "This is a real article paragraph.";
            const frame = document.createElement("iframe");
            frame.name = "google_ads_iframe_/123";
            article.appendChild(frame);
            document.body.appendChild(article);

            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(150);
            await Promise.resolve();

            expect(frame.style.display).toBe("none");
            expect(article.style.display).toBe("");
        } finally {
            jest.useRealTimers();
        }
    });

    it("collapses leftover floating video ad shells that only contain skip-ad controls", async () => {
        jest.useFakeTimers();

        try {
            const filter = new CosmeticFilter(jest.fn());
            filter.applyHidingRules([], "custom");

            const shell = document.createElement("div");
            shell.className = "floating-video-ad";
            shell.textContent = "Skip Ad \u25b6";
            document.body.appendChild(shell);

            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(150);
            await Promise.resolve();

            expect(shell.style.display).toBe("none");
            expect(shell.style.height).toBe("0px");
        } finally {
            jest.useRealTimers();
        }
    });

    it("collapses empty Freestar leaderboard shells after ad requests are blocked", async () => {
        jest.useFakeTimers();

        try {
            const filter = new CosmeticFilter(jest.fn());
            filter.applyHidingRules([], "custom");

            const wrapper = document.createElement("div");
            wrapper.className = "leaderboard-video";
            const shell = document.createElement("div");
            shell.id = "zerogpt_leaderboard_top";
            shell.className = "freestar-ad";
            wrapper.appendChild(shell);
            document.body.appendChild(wrapper);

            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(150);
            await Promise.resolve();

            expect(shell.style.display).toBe("none");
            expect(wrapper.style.display).toBe("none");
        } finally {
            jest.useRealTimers();
        }
    });

    it("collapses empty leaderboard wrappers around blocked page-top ad slots", async () => {
        jest.useFakeTimers();

        try {
            const filter = new CosmeticFilter(jest.fn());
            filter.applyHidingRules([], "custom");

            const wrapper = document.createElement("div");
            wrapper.id = "leaderboard-wrap";
            const leaderboard = document.createElement("div");
            leaderboard.id = "leaderboard";
            const slot = document.createElement("div");
            slot.id = "ad_page_top_1";
            leaderboard.appendChild(slot);
            wrapper.appendChild(leaderboard);
            document.body.appendChild(wrapper);

            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(150);
            await Promise.resolve();

            expect(slot.style.display).toBe("none");
            expect(leaderboard.style.display).toBe("none");
            expect(wrapper.style.display).toBe("none");
        } finally {
            jest.useRealTimers();
        }
    });

    it("collapses Yahoo responsive display ad shells with ad-only labels", async () => {
        jest.useFakeTimers();

        try {
            const filter = new CosmeticFilter(jest.fn());
            filter.applyHidingRules([], "custom");

            const shell = document.createElement("div");
            shell.className = "responsive-sda ad-center";
            shell.textContent = "Advertisement";
            document.body.appendChild(shell);

            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(150);
            await Promise.resolve();

            expect(shell.style.display).toBe("none");
            expect(shell.style.height).toBe("0px");
        } finally {
            jest.useRealTimers();
        }
    });

    it("collapses Dotdash Meredith empty GPT ad slots", async () => {
        jest.useFakeTimers();

        try {
            const filter = new CosmeticFilter(jest.fn());
            filter.applyHidingRules([], "custom");

            const shell = document.createElement("div");
            shell.id = "mm-ads-square-flex-1_1-0";
            shell.className = "comp mm-ads-square-flex-1 mm-ads-square mm-ads-gpt-adunit gpt square";
            document.body.appendChild(shell);

            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(150);
            await Promise.resolve();

            expect(shell.style.display).toBe("none");
            expect(shell.dataset.zgCosmeticCleaned).toBe("1");
        } finally {
            jest.useRealTimers();
        }
    });

    it("collapses AdsNinja injected ad zones without hiding adjacent content wrappers", async () => {
        jest.useFakeTimers();

        try {
            const filter = new CosmeticFilter(jest.fn());
            filter.applyHidingRules([], "custom");

            const contentWrapper = document.createElement("section");
            contentWrapper.className = "wrapper adsninja-injected-repeatable-ad-afterend";
            contentWrapper.append("Game reviews and entertainment news");
            const shell = document.createElement("div");
            shell.id = "adsninja-ad-zone-adsninja-ad-unit-1746738456007";
            shell.className = "adsninja-ad-zone an-zone";
            shell.textContent = "Remove Ads googletag.cmd.push(function() {})";
            contentWrapper.appendChild(shell);
            document.body.appendChild(contentWrapper);

            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(150);
            await Promise.resolve();

            expect(shell.style.display).toBe("none");
            expect(shell.dataset.zgCosmeticCleaned).toBe("1");
            expect(contentWrapper.style.display).toBe("");
        } finally {
            jest.useRealTimers();
        }
    });

    it("collapses NBC top banner shells that only contain ad labels", async () => {
        jest.useFakeTimers();

        try {
            const filter = new CosmeticFilter(jest.fn());
            filter.applyHidingRules([], "custom");

            const shell = document.createElement("div");
            shell.className = "header-and-footer--banner-ad ad-container topbannerAd";
            shell.textContent = "Advertisement";
            document.body.appendChild(shell);

            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(150);
            await Promise.resolve();

            expect(shell.style.display).toBe("none");
            expect(shell.dataset.zgCosmeticCleaned).toBe("1");
        } finally {
            jest.useRealTimers();
        }
    });

    it("collapses IGN empty side and billboard ad wrappers", async () => {
        jest.useFakeTimers();

        try {
            const filter = new CosmeticFilter(jest.fn());
            filter.applyHidingRules([], "custom");

            const sideRail = document.createElement("div");
            sideRail.className = "side-ad-trail";
            const sticky = document.createElement("div");
            sticky.className = "ad-wrapper pgQSsticky";
            sideRail.appendChild(sticky);
            const billboard = document.createElement("div");
            billboard.className = "zad billboard";
            document.body.append(sideRail, billboard);

            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(150);
            await Promise.resolve();

            expect(sticky.style.display).toBe("none");
            expect(sideRail.style.display).toBe("none");
            expect(billboard.style.display).toBe("none");
        } finally {
            jest.useRealTimers();
        }
    });

    it("collapses Fox News ad containers that only contain ad bootstrap scripts", async () => {
        jest.useFakeTimers();

        try {
            const filter = new CosmeticFilter(jest.fn());
            filter.applyHidingRules([], "custom");

            const wrapper = document.createElement("div");
            wrapper.className = "ad-container desktop ad-h-250 ad-w-970";
            wrapper.textContent = "window.foxstrike = window.foxstrike || {}; window.foxstrike.cmd.push(function() {});";
            const slot = document.createElement("div");
            slot.id = "desktop_desk-hp-lb1";
            slot.className = "ad gam";
            wrapper.appendChild(slot);
            document.body.appendChild(wrapper);

            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(150);
            await Promise.resolve();

            expect(slot.style.display).toBe("none");
            expect(wrapper.style.display).toBe("none");
        } finally {
            jest.useRealTimers();
        }
    });

    it("collapses NYPost ad label and DFP rail wrappers", async () => {
        jest.useFakeTimers();

        try {
            const filter = new CosmeticFilter(jest.fn());
            filter.applyHidingRules([], "custom");

            const labelShell = document.createElement("div");
            labelShell.className = "ad ad--container b-top b-bottom";
            labelShell.textContent = "Advertisement";
            const rail = document.createElement("div");
            rail.className = "widget-wrapper d-none d-block-lg widget-wrapper--sticky-lg nypost_dfp_ad_rec_atf_widget widget_nypost_dfp_ad_widget";
            document.body.append(labelShell, rail);

            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(150);
            await Promise.resolve();

            expect(labelShell.style.display).toBe("none");
            expect(rail.style.display).toBe("none");
        } finally {
            jest.useRealTimers();
        }
    });

    it("collapses Daily Mail advertisement label strips", async () => {
        jest.useFakeTimers();

        try {
            const filter = new CosmeticFilter(jest.fn());
            filter.applyHidingRules([], "custom");

            const wrapper = document.createElement("span");
            wrapper.className = "mol-ads-label-container";
            const label = document.createElement("span");
            label.className = "mol-ads-label";
            label.textContent = "Advertisement";
            wrapper.appendChild(label);
            document.body.appendChild(wrapper);

            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(150);
            await Promise.resolve();

            expect(label.style.display).toBe("none");
            expect(wrapper.style.display).toBe("none");
        } finally {
            jest.useRealTimers();
        }
    });

    it("collapses Rolling Stone page-top GPT leaderboard shells", async () => {
        jest.useFakeTimers();

        try {
            const filter = new CosmeticFilter(jest.fn());
            filter.applyHidingRules([], "custom");

            const wrapper = document.createElement("div");
            wrapper.className = "above-header-ad a-prepare-for-header-leaderboard-ad";
            const leaderboard = document.createElement("div");
            leaderboard.id = "adm-leaderboard";
            leaderboard.className = "admz";
            const slot = document.createElement("div");
            slot.id = "gpt-dsk-tab-hp-leaderboard-uid1";
            slot.className = "adw-728 adh-90";
            leaderboard.appendChild(slot);
            wrapper.appendChild(leaderboard);
            document.body.appendChild(wrapper);

            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(150);
            await Promise.resolve();

            expect(slot.style.display).toBe("none");
            expect(leaderboard.style.display).toBe("none");
            expect(wrapper.style.display).toBe("none");
        } finally {
            jest.useRealTimers();
        }
    });

    it("collapses TheWrap header ad shells after GPT is blocked", async () => {
        jest.useFakeTimers();

        try {
            const filter = new CosmeticFilter(jest.fn());
            filter.applyHidingRules([], "custom");

            const wrapper = document.createElement("div");
            wrapper.className = "site-header-ad-wrapper";
            const shell = document.createElement("div");
            shell.className = "yad-skin-ad-top wp-block-the-wrap-ad";
            wrapper.appendChild(shell);
            document.body.appendChild(wrapper);

            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(150);
            await Promise.resolve();

            expect(shell.style.display).toBe("none");
            expect(wrapper.style.display).toBe("none");
        } finally {
            jest.useRealTimers();
        }
    });

    it("collapses Dexerto sidebar and bottom adhesion ad modules", async () => {
        jest.useFakeTimers();

        try {
            const filter = new CosmeticFilter(jest.fn());
            filter.applyHidingRules([], "custom");

            const sidebar = document.createElement("div");
            sidebar.id = "Sidebar1";
            sidebar.className = "w-full flex justify-center Ad-module-scss-module__ePvyKG__ad min-h-[606px] items-start SidebarAd-module-scss-module__xY_oMW__min-size-iframe-desktop";
            const adhesion = document.createElement("div");
            adhesion.id = "bottom-adhesion";
            adhesion.className = "Ad-module-scss-module__ePvyKG__ad flex justify-center items-center fixed bottom-0";
            document.body.append(sidebar, adhesion);

            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(150);
            await Promise.resolve();

            expect(sidebar.style.display).toBe("none");
            expect(adhesion.style.display).toBe("none");
        } finally {
            jest.useRealTimers();
        }
    });

    it("collapses WebMD ad-position placeholders left after delivery blocks", async () => {
        jest.useFakeTimers();

        try {
            const filter = new CosmeticFilter(jest.fn());
            filter.applyHidingRules([], "custom");

            const wrapper = document.createElement("div");
            wrapper.className = "ad-wrapper ad-container-922";
            const slot = document.createElement("div");
            slot.id = "ad-pos-922-1";
            slot.className = "module ad ad-922";
            wrapper.appendChild(slot);
            document.body.appendChild(wrapper);

            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(150);
            await Promise.resolve();

            expect(slot.style.display).toBe("none");
            expect(wrapper.style.display).toBe("none");
        } finally {
            jest.useRealTimers();
        }
    });

    it("collapses Ziff Davis skybox ad shells after delivery scripts are blocked", async () => {
        jest.useFakeTimers();

        try {
            const filter = new CosmeticFilter(jest.fn());
            filter.applyHidingRules([], "custom");

            const shell = document.createElement("div");
            shell.className = "c-adSkyBox c-adSkyBox_expanded";
            shell.textContent = "X";
            document.body.appendChild(shell);

            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(150);
            await Promise.resolve();

            expect(shell.style.display).toBe("none");
        } finally {
            jest.useRealTimers();
        }
    });

    it("does not collapse video-ad-like containers with meaningful page text", async () => {
        jest.useFakeTimers();

        try {
            const filter = new CosmeticFilter(jest.fn());
            filter.applyHidingRules([], "custom");

            const card = document.createElement("section");
            card.className = "video-advice-card";
            card.textContent = "Video advice for protecting your account.";
            document.body.appendChild(card);

            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(150);
            await Promise.resolve();

            expect(card.style.display).toBe("");
        } finally {
            jest.useRealTimers();
        }
    });

    it("collapses clearly labeled Google Search sponsored results", async () => {
        jest.useFakeTimers();

        try {
            document.body.innerHTML = `
                <div id="search">
                    <div id="tads">
                        <div class="uEierd">
                            <span>Sponsored</span>
                            <a href="https://ads.example.test/product">Beko appliance offer</a>
                        </div>
                    </div>
                    <div id="rso">
                        <div class="g">
                            <a href="https://organic.example.test/article">Organic result</a>
                            <span>This page explains sponsored product registration emails.</span>
                        </div>
                    </div>
                </div>
            `;

            const ad = document.querySelector(".uEierd") as HTMLElement;
            const organic = document.querySelector(".g") as HTMLElement;
            const filter = new CosmeticFilter(jest.fn());
            jest.spyOn(filter as any, "getCurrentLocation").mockReturnValue(new URL("https://www.google.com/search?q=dishwasher"));
            filter.applyHidingRules([], "custom");

            jest.advanceTimersByTime(150);
            await Promise.resolve();

            expect(ad.style.display).toBe("none");
            expect(organic.style.display).toBe("");
        } finally {
            jest.useRealTimers();
        }
    });

    it("collapses late Google Search sponsored results", async () => {
        jest.useFakeTimers();

        try {
            document.body.innerHTML = `<div id="search"><div id="tads"></div></div>`;
            const filter = new CosmeticFilter(jest.fn());
            jest.spyOn(filter as any, "getCurrentLocation").mockReturnValue(new URL("https://www.google.com/search?q=washer"));
            filter.applyHidingRules([], "custom");

            const topAds = document.getElementById("tads") as HTMLElement;
            const ad = document.createElement("div");
            ad.setAttribute("data-text-ad", "1");
            ad.innerHTML = `<span>Sponsored</span><a href="https://ads.example.test/late">Late ad</a>`;
            topAds.appendChild(ad);

            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(150);
            await Promise.resolve();

            expect(ad.style.display).toBe("none");
        } finally {
            jest.useRealTimers();
        }
    });

    it("records a rate-limited activity entry when built-in cleanup removes ad shells", async () => {
        jest.useFakeTimers();
        (getLocal as any).mockResolvedValue({ toolActivityLog: [] });

        try {
            const filter = new CosmeticFilter(jest.fn());
            filter.applyHidingRules([], "custom");

            const container = document.createElement("div");
            container.className = "ad-container";
            const frame = document.createElement("iframe");
            frame.name = "google_ads_iframe_/activity";
            container.appendChild(frame);
            document.body.appendChild(container);

            filter.applyHidingRules([], "custom");
            jest.advanceTimersByTime(750);
            await Promise.resolve();
            await Promise.resolve();

            expect(setLocal).toHaveBeenCalledWith({
                toolActivityLog: [
                    expect.objectContaining({
                        tool: "Cosmetic Cleanup",
                        title: "Ad Shells Cleaned",
                        message: "Collapsed 2 leftover ad shells after blocking.",
                        tone: "success",
                        domain: "localhost",
                    }),
                ],
            });
            expect(setLocal).toHaveBeenCalledWith({
                cosmeticCleanupSummaryByHostname: {
                    localhost: expect.objectContaining({
                        count: 2,
                        latestHint: expect.stringContaining("iframe"),
                        pageUrl: window.location.href,
                    }),
                },
            });
        } finally {
            jest.useRealTimers();
        }
    });

    it("removes likely transparent click blockers above unlocked content", () => {
        document.body.innerHTML = `
            <div id="paywall-scrim"></div>
            <main id="main-content">Article text</main>
        `;

        const scrim = document.getElementById("paywall-scrim") as HTMLElement;
        const main = document.getElementById("main-content") as HTMLElement;

        scrim.getBoundingClientRect = () => ({
            x: 0, y: 0, top: 0, left: 0, right: 1200, bottom: 600, width: 1200, height: 600, toJSON: () => ({}),
        }) as DOMRect;
        main.getBoundingClientRect = () => ({
            x: 100, y: 100, top: 100, left: 100, right: 900, bottom: 900, width: 800, height: 800, toJSON: () => ({}),
        }) as DOMRect;

        jest.spyOn(window, "getComputedStyle").mockImplementation((element: Element) => {
            if (element === scrim) {
                return {
                    position: "fixed",
                    zIndex: "999",
                    pointerEvents: "auto",
                    opacity: "0.1",
                    backgroundColor: "rgba(0, 0, 0, 0.2)",
                    backdropFilter: "blur(2px)",
                } as CSSStyleDeclaration;
            }

            return {
                position: "static",
                zIndex: "0",
                pointerEvents: "auto",
                opacity: "1",
                backgroundColor: "rgba(255, 255, 255, 1)",
                backdropFilter: "none",
            } as CSSStyleDeclaration;
        });

        Object.defineProperty(document, "elementsFromPoint", {
            configurable: true,
            value: jest.fn(() => [scrim, main]),
        });

        const filter = new CosmeticFilter(jest.fn());
        const result = filter.applyWallFix({
            overlaySelector: "#missing-paywall",
            contentUnlockSelector: "#main-content",
        });

        expect(result.contentUnlockMatchCount).toBe(1);
        expect(result.overlayMatchCount).toBe(1);
        expect(scrim.style.pointerEvents).toBe("none");
        expect(scrim.style.display).toBe("none");
    });

    it("keeps removing late interaction blockers during wall-fix reapply", () => {
        document.body.innerHTML = `<main id="main-content">Article text</main>`;

        const main = document.getElementById("main-content") as HTMLElement;
        main.getBoundingClientRect = () => ({
            x: 100, y: 100, top: 100, left: 100, right: 900, bottom: 900, width: 800, height: 800, toJSON: () => ({}),
        }) as DOMRect;

        const styleSpy = jest.spyOn(window, "getComputedStyle").mockImplementation((element: Element) => {
            if ((element as HTMLElement).id === "late-scrim") {
                return {
                    position: "fixed",
                    zIndex: "999",
                    pointerEvents: "auto",
                    opacity: "0.1",
                    backgroundColor: "rgba(0, 0, 0, 0.2)",
                    backdropFilter: "blur(2px)",
                } as CSSStyleDeclaration;
            }

            return {
                position: "static",
                zIndex: "0",
                pointerEvents: "auto",
                opacity: "1",
                backgroundColor: "rgba(255, 255, 255, 1)",
                backdropFilter: "none",
            } as CSSStyleDeclaration;
        });

        let overlayNode: HTMLElement | null = null;
        Object.defineProperty(document, "elementsFromPoint", {
            configurable: true,
            value: jest.fn(() => overlayNode ? [overlayNode, main] : [main]),
        });

        const filter = new CosmeticFilter(jest.fn());
        filter.applyWallFix({
            overlaySelector: "#missing-paywall",
            contentUnlockSelector: "#main-content",
        });

        overlayNode = document.createElement("div");
        overlayNode.id = "late-scrim";
        overlayNode.getBoundingClientRect = () => ({
            x: 0, y: 0, top: 0, left: 0, right: 1200, bottom: 600, width: 1200, height: 600, toJSON: () => ({}),
        }) as DOMRect;
        document.body.appendChild(overlayNode);

        (filter as any).enforceAggressiveFiltering();

        expect(overlayNode.style.pointerEvents).toBe("none");
        expect(overlayNode.style.display).toBe("none");
        styleSpy.mockRestore();
    });

    it("does not throw when wall-fix observer starts before a real document root exists", () => {
        const originalDocumentElement = document.documentElement;
        const originalBody = document.body;

        Object.defineProperty(document, "documentElement", {
            configurable: true,
            value: null,
        });
        Object.defineProperty(document, "body", {
            configurable: true,
            value: null,
        });

        const filter = new CosmeticFilter(jest.fn());

        expect(() => {
            filter.applyWallFix({
                overlaySelector: ".paywall",
            });
        }).not.toThrow();

        Object.defineProperty(document, "documentElement", {
            configurable: true,
            value: originalDocumentElement,
        });
        Object.defineProperty(document, "body", {
            configurable: true,
            value: originalBody,
        });
    });
});
