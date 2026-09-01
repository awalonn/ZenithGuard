import {
    isGoogleIdentityHostname,
    isGoogleIdentityUrl,
} from "../../src/js/shared/google_identity";

describe("Google Identity compatibility", () => {
    it("recognizes only the Google Accounts identity host", () => {
        expect(isGoogleIdentityHostname("accounts.google.com")).toBe(true);
        expect(isGoogleIdentityHostname("ACCOUNTS.GOOGLE.COM.")).toBe(true);
        expect(isGoogleIdentityHostname("google.com")).toBe(false);
        expect(isGoogleIdentityHostname("accounts.google.com.attacker.example")).toBe(false);
    });

    it("recognizes Google Identity endpoints without broadly trusting Google", () => {
        expect(isGoogleIdentityUrl(
            "https://accounts.google.com/gsi/client",
            "https://site.example/login",
        )).toBe(true);
        expect(isGoogleIdentityUrl(
            "https://googleads.g.doubleclick.net/pagead/ads",
            "https://site.example/login",
        )).toBe(false);
    });
});
