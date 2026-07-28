const { getVisitAnywayTarget } = await import("../../src/js/blocked/blocked");

export {};

describe("blocked page visit target", () => {
    it("uses the latest blocked main-frame URL as the visit-anyway target", () => {
        const target = getVisitAnywayTarget({
            entries: [
                {
                    url: "https://older.example/path",
                    status: "blocked",
                    type: "main_frame",
                    timestamp: 10,
                },
                {
                    url: "https://cdn.example/script.js",
                    status: "blocked",
                    type: "script",
                    timestamp: 30,
                },
                {
                    url: "https://tqzhknl5.r.eu-west-1.awstrack.me/L0/example",
                    status: "blocked",
                    type: "main_frame",
                    timestamp: 20,
                },
            ],
        });

        expect(target).toEqual({
            url: "https://tqzhknl5.r.eu-west-1.awstrack.me/L0/example",
            hostname: "tqzhknl5.r.eu-west-1.awstrack.me",
        });
    });

    it("ignores non-http URLs and non-blocked entries", () => {
        expect(getVisitAnywayTarget({
            entries: [
                {
                    url: "chrome-extension://zenithguard/src/pages/blocked.html",
                    status: "blocked",
                    type: "main_frame",
                    timestamp: 20,
                },
                {
                    url: "https://allowed.example",
                    status: "allowed",
                    type: "main_frame",
                    timestamp: 10,
                },
            ],
        })).toBeNull();
    });
});
