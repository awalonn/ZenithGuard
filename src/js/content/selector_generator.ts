// src/js/content/selector_generator.ts

window.ZenithGuardSelectorGenerator = (() => {
    /**
     * Generates the most stable and unique CSS selector for a given element.
     * @param {HTMLElement} element - The DOM element to generate a selector for.
     * @returns {string|null} The generated selector.
     */
    function generate(element: Element): string | null {
        if (!element) return null;

        // 1. ID (High Reliability)
        if (element.id && isStableIdentifier(element.id)) {
            const selector = `#${CSS.escape(element.id)}`;
            if (document.querySelectorAll(selector).length === 1) return selector;
        }

        // 2. Attributes (High Reliability)
        const uniqueAttrs = ['data-testid', 'data-cy', 'data-test-id', 'role', 'name'];
        for (const attr of uniqueAttrs) {
            const value = element.getAttribute(attr);
            if (value && isStableIdentifier(value)) {
                const selector = `${element.tagName.toLowerCase()}[${attr}="${CSS.escape(value)}"]`;
                if (document.querySelectorAll(selector).length === 1) return selector;
            }
        }

        // 3. Class Names (Medium Reliability)
        if (element.className && typeof element.className === 'string') {
            const classes = element.className.trim().split(/\s+/);
            const validClasses = classes.filter(c => isStableIdentifier(c) && !c.includes(':'));
            if (validClasses.length > 0) {
                // Try full class combination first
                const selector = element.tagName.toLowerCase() + '.' + validClasses.map(c => CSS.escape(c)).join('.');
                if (document.querySelectorAll(selector).length === 1) return selector;
            }
        }

        // 4. Recursive Path (Guaranteed Fallback)
        return getPath(element);
    }

    function getPath(element: Element | null): string | null {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;

        const el = element as Element;

        if (el.tagName.toLowerCase() === 'body') return 'body';
        if (el.tagName.toLowerCase() === 'html') return 'html';

        if (el.id && isStableIdentifier(el.id)) {
            return `#${CSS.escape(el.id)}`;
        }

        const parentPath = getPath(el.parentElement);
        if (!parentPath) return null;

        const siblings = Array.from(el.parentElement!.children);
        const tag = el.tagName.toLowerCase();
        const siblingsOfType = siblings.filter(s => s.tagName.toLowerCase() === tag);

        if (siblingsOfType.length === 1) {
            return `${parentPath} > ${tag}`;
        }

        const index = siblingsOfType.indexOf(el) + 1;
        return `${parentPath} > ${tag}:nth-of-type(${index})`;
    }

    function isStableIdentifier(id: string | null): boolean {
        if (!id) return false;
        // Filter out numbers-only or super long random strings
        if (/^\d+$/.test(id)) return false;
        if (id.length > 50) return false;
        return true;
    }

    return { generate };
})();