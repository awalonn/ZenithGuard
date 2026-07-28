import { normalizeNetworkBlocklistMetaRecord } from "../../src/js/shared/network_blocklist_meta";

describe("network blocklist metadata normalizer", () => {
    it("canonicalizes hostname keys, keeps the freshest metadata, and drops invalid fields", () => {
        expect(normalizeNetworkBlocklistMetaRecord({
            "www.Example.com": {
                source: "logger",
                addedAt: 10,
                extra: "ignored",
            },
            "example.com": {
                source: "settings",
                addedAt: 20,
            },
            "bad.example": {
                source: 123,
                addedAt: "bad",
            },
            "": {
                source: "logger",
                addedAt: 30,
            },
            "skip.example": null,
        })).toEqual({
            "example.com": {
                source: "settings",
                addedAt: 20,
            },
            "bad.example": {},
        });
    });
});
