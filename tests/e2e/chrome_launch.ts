export function packagedExtensionLaunchArgs(extensionPath: string): string[] {
    return [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-features=Translate,OptimizationHints",
        "--window-size=1365,900",
        ...(process.env.CI === "true" && process.platform === "linux" ? ["--no-sandbox"] : []),
    ];
}
