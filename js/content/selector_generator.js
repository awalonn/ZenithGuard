// selector_generator.js

window.ZenithGuardSelectorGenerator = (() => {
  /**
   * Generates the most stable and unique CSS selector for a given element.
   * It prioritizes selectors in the order of reliability:
   * 1. Unique ID
   * 2. Stable data attributes (e.g., data-testid)
   * 3. Specific ARIA roles
   * 4. Form element names
   * 5. Stable, non-procedural class names
   * 6. Parent-based fallback using :nth-child (last resort)
   * @param {HTMLElement} element - The DOM element to generate a selector for.
   * @param {number} [depth=0] - Internal recursion depth counter.
   * @returns {string|null} The generated selector, or null if no unique selector could be found.
   */
  function generate(element, depth = 0) {
    if (!element || depth > 5 || element === document.body) {
      return null;
    }

    const tagName = element.tagName.toLowerCase();

    // Priority 1: Unique ID (if not purely numeric)
    const id = element.id ? element.id.trim() : null;
    if (id && !/^\d+$/.test(id)) {
      const selector = `#${id.replace(/(:|\.|\[|\]|,)/g, '\\$1')}`;
      try { if (document.querySelectorAll(selector).length === 1) return selector; } catch (e) {}
    }

    // Priority 2: Stable Data Attributes
    const stableAttrs = ['data-testid', 'data-cy', 'data-test-id', 'data-qa'];
    for (const attr of stableAttrs) {
      const attrValue = element.getAttribute(attr);
      if (attrValue) {
        const selector = `${tagName}[${attr}="${attrValue}"]`;
        try { if (document.querySelectorAll(selector).length === 1) return selector; } catch (e) {}
      }
    }

    // Priority 3: Specific ARIA Roles
    const role = element.getAttribute('role');
    const specificRoles = ['button', 'navigation', 'main', 'search', 'dialog', 'alertdialog', 'menu', 'banner', 'contentinfo'];
    if (role && specificRoles.includes(role)) {
      const selector = `${tagName}[role="${role}"]`;
      try { if (document.querySelectorAll(selector).length === 1) return selector; } catch (e) {}
    }

    // Priority 4: Form element 'name' attribute
    const formElements = ['input', 'select', 'textarea', 'button', 'form'];
    if (formElements.includes(tagName)) {
      const name = element.getAttribute('name');
      if (name) {
        const selector = `${tagName}[name="${name}"]`;
        try { if (document.querySelectorAll(selector).length === 1) return selector; } catch (e) {}
      }
    }

    // Priority 5: Stable, non-procedural class names
    let stableClasses = [];
    if (element.className && typeof element.className === 'string') {
      stableClasses = element.className.trim().split(/\s+/).filter(c =>
        c && !/[:\\[\\]]/.test(c) && !/^(is-|has-|js-)/.test(c) && !/(active|open|selected|disabled|hidden)/.test(c) && !/\d/.test(c)
      );
    }
    if (stableClasses.length > 0) {
      const classSelector = '.' + stableClasses.join('.');
      const selector = tagName + classSelector;
      try { if (document.querySelectorAll(selector).length === 1) return selector; } catch (e) {}
    }

    // Priority 6: Parent-based fallback (last resort)
    const parent = element.parentElement;
    if (parent) {
      const parentSelector = generate(parent, depth + 1);
      if (parentSelector) {
        const siblings = Array.from(parent.children);
        const nthIndex = siblings.indexOf(element) + 1;
        const nthSelector = `${parentSelector} > ${tagName}:nth-child(${nthIndex})`;
        try {
          const matchedElements = document.querySelectorAll(nthSelector);
          if (matchedElements.length === 1 && matchedElements[0] === element) {
            return nthSelector;
          }
        } catch (e) {}
      }
    }

    return null;
  }

  return { generate };
})();