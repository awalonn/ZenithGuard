import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("popup extension surface", () => {
    it("keeps the recovered popup page and main source entry", () => {
        const popupHtml = fs.readFileSync(
            path.join(projectRoot, "src/pages/popup.html"),
            "utf8",
        );
        const popupSource = fs.readFileSync(
            path.join(projectRoot, "src/ui/popup/Popup.svelte"),
            "utf8",
        );
        const toolsTabSource = fs.readFileSync(
            path.join(projectRoot, "src/ui/popup/components/ToolsTab.svelte"),
            "utf8",
        );

        expect(popupHtml).toContain("/src/ui/popup/main.ts");
        expect(popupSource).toContain("ToolsTab");
        expect(toolsTabSource).toContain("Recent Tool Activity");
    });
});
