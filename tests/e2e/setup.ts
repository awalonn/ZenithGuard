import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

beforeAll(() => {
    expect(fs.existsSync(path.join(projectRoot, "manifest.json"))).toBe(true);
});
