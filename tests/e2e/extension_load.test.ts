import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("extension package surface", () => {
    it("keeps the expected background and popup entrypoints", () => {
        const manifest = JSON.parse(
            fs.readFileSync(path.join(projectRoot, "manifest.json"), "utf8"),
        );

        expect(manifest.background?.service_worker).toBe("js/background.js");
        expect(manifest.action?.default_popup).toBe("src/pages/popup.html");
        expect(manifest.options_page).toBe("src/pages/settings.html");
    });
});
