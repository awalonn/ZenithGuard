
export { };

declare global {
    interface Window {
        ZenithGuardToastUtils: {
            showToast: (options: { message: string, type?: 'success' | 'error' | 'info' | 'loading', duration?: number, id?: string | null }) => void;
        };
        ZenithGuardInspector: {
            start: (callback: (selector: string) => void) => void;
        };
        ZenithGuardZapper: {
            start: (callback: (selector: string) => void) => void;
        };
        ZenithGuardSelectorGenerator: {
            generate: (element: Element) => string | null;
        };
        ZenithGuardAIHider: {
            start: (callback: (selector: string) => void, context: any) => void;
        };
    }
}
