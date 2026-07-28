export const AUXILIARY_ENTRY_DEFINITIONS = [
    {
        entry: "src/js/background/background.ts",
        outFile: "js/background.js",
        format: "es",
    },
    {
        entry: "src/js/content_bundle.ts",
        outFile: "js/content_bundle.js",
        format: "iife",
        name: "ZenithGuardContentBundle",
    },
    {
        entry: "src/js/page_popup_guard.ts",
        outFile: "js/page_popup_guard.js",
        format: "iife",
        name: "ZenithGuardPagePopupGuard",
    },
    {
        entry: "src/js/ai_hider.ts",
        outFile: "js/ai_hider.js",
        format: "iife",
        name: "ZenithGuardAiHiderEntry",
    },
    {
        entry: "src/js/inspector.ts",
        outFile: "js/inspector.js",
        format: "iife",
        name: "ZenithGuardInspectorEntry",
    },
    {
        entry: "src/js/zapper.ts",
        outFile: "js/zapper.js",
        format: "iife",
        name: "ZenithGuardZapperEntry",
    },
    {
        entry: "src/js/toast.ts",
        outFile: "js/toast.js",
        format: "iife",
        name: "ZenithGuardToastEntry",
    },
    {
        entry: "src/js/policy_finder.ts",
        outFile: "js/policy_finder.js",
        format: "iife",
        name: "ZenithGuardPolicyFinder",
    },
    {
        entry: "src/js/yt_interceptor.ts",
        outFile: "js/yt_interceptor.js",
        format: "iife",
        name: "ZenithGuardYouTubeInterceptor",
    },
];
