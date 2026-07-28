function isStableToken(value: string): boolean {
    return Boolean(value) && !/^\d+$/.test(value) && value.length <= 50;
}

function buildNthPath(element: Element | null): string | null {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
        return null;
    }

    const current = element as HTMLElement;
    const tag = current.tagName.toLowerCase();
    if (tag === "html" || tag === "body") {
        return tag;
    }

    if (current.id && isStableToken(current.id)) {
        return `#${CSS.escape(current.id)}`;
    }

    const parentSelector = buildNthPath(current.parentElement);
    if (!parentSelector || !current.parentElement) {
        return null;
    }

    const siblings = Array.from(current.parentElement.children).filter((child) => child.tagName.toLowerCase() === tag);
    if (siblings.length === 1) {
        return `${parentSelector} > ${tag}`;
    }

    const index = siblings.indexOf(current) + 1;
    return `${parentSelector} > ${tag}:nth-of-type(${index})`;
}

export function generateUniqueSelector(element: Element | null): string | null {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
        return null;
    }

    const current = element as HTMLElement;
    if (current.id && isStableToken(current.id)) {
        const selector = `#${CSS.escape(current.id)}`;
        if (document.querySelectorAll(selector).length === 1) {
            return selector;
        }
    }

    for (const attribute of ["data-testid", "data-cy", "data-test-id", "role", "name"]) {
        const value = current.getAttribute(attribute);
        if (!value || !isStableToken(value)) {
            continue;
        }

        const selector = `${current.tagName.toLowerCase()}[${attribute}="${CSS.escape(value)}"]`;
        if (document.querySelectorAll(selector).length === 1) {
            return selector;
        }
    }

    if (current.className && typeof current.className === "string") {
        const classNames = current.className.trim().split(/\s+/).filter((className) => isStableToken(className) && !className.includes(":"));
        if (classNames.length > 0) {
            const selector = `${current.tagName.toLowerCase()}.${classNames.map((className) => CSS.escape(className)).join(".")}`;
            if (document.querySelectorAll(selector).length === 1) {
                return selector;
            }
        }
    }

    return buildNthPath(current);
}
