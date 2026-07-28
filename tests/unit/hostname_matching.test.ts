import {
    findMatchingRecordEntry,
    findMatchingRecordValue,
    findMatchingStringIndex,
    hostnamesMatch,
    listHasMatchingHostname,
} from "../../src/js/shared/hostname_matching";

describe("hostname matching helpers", () => {
    it("matches related apex and www hostnames symmetrically", () => {
        expect(hostnamesMatch("washingtonpost.com", "www.washingtonpost.com")).toBe(true);
        expect(hostnamesMatch("www.washingtonpost.com", "washingtonpost.com")).toBe(true);
    });

    it("finds matching hostnames inside string lists", () => {
        expect(listHasMatchingHostname(["washingtonpost.com"], "www.washingtonpost.com")).toBe(true);
        expect(findMatchingStringIndex(["washingtonpost.com"], "www.washingtonpost.com")).toBe(0);
    });

    it("finds matching record entries across apex and www variants", () => {
        const entries = {
            "www.washingtonpost.com": {
                overlaySelector: ".paywall",
            },
        };

        expect(findMatchingRecordEntry(entries, "washingtonpost.com")).toEqual({
            key: "www.washingtonpost.com",
            value: {
                overlaySelector: ".paywall",
            },
        });

        expect(findMatchingRecordValue(entries, "washingtonpost.com")).toEqual({
            overlaySelector: ".paywall",
        });
    });
});
