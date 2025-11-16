// zapper.js - Element Zapper Tool

window.ZenithGuardZapper = (() => {
    let isActive = false;
    let highlight = null;
    let banner = null;
    let lastHovered = null;
    let activeHideCallback = null;

    function start(hideCallback) {
        if (isActive) return;
        isActive = true;
        activeHideCallback = hideCallback;
        createUI();
        attachListeners();
    }

    function stop() {
        if (!isActive) return;
        isActive = false;
        activeHideCallback = null;
        destroyUI();
        removeListeners();
    }

    function createUI() {
        highlight = document.createElement('div');
        highlight.id = 'zg-zapper-highlight';
        
        banner = document.createElement('div');
        banner.id = 'zg-zapper-banner';
        banner.innerHTML = `
            <span>⚡ <strong>Zapper Mode Active:</strong> Click elements to hide them. Press ESC to exit.</span>
            <button id="zg-zapper-exit-btn">Exit Zapper</button>
        `;
        document.body.appendChild(highlight);
        document.body.appendChild(banner);
    }

    function destroyUI() {
        banner?.remove();
        highlight?.remove();
        highlight = null;
        banner = null;
    }

    function attachListeners() {
        document.addEventListener('mouseover', handleMouseOver, true);
        document.addEventListener('click', handleClick, true);
        document.addEventListener('keydown', handleKeyDown, true);
        banner.querySelector('#zg-zapper-exit-btn').addEventListener('click', stop);
    }

    function removeListeners() {
        document.removeEventListener('mouseover', handleMouseOver, true);
        document.removeEventListener('click', handleClick, true);
        document.removeEventListener('keydown', handleKeyDown, true);
    }
    
    function handleMouseOver(event) {
        if (!isActive) return;
        const target = event.target;
        if (!target || target === banner || banner?.contains(target)) {
             // If mouse is over the banner, hide the highlight
            highlight.style.display = 'none';
            return;
        }
        
        lastHovered = target;
        const rect = lastHovered.getBoundingClientRect();
        
        Object.assign(highlight.style, {
            display: 'block',
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            top: `${rect.top + window.scrollY}px`,
            left: `${rect.left + window.scrollX}px`
        });
    }

    function handleClick(event) {
        if (!isActive) return;
        event.preventDefault();
        event.stopPropagation();
        
        const target = event.target;
        if (!target || target === banner || banner?.contains(target)) {
            return;
        }

        const selector = window.ZenithGuardSelectorGenerator.generate(target);
        if (selector && activeHideCallback) {
            activeHideCallback(selector);
            // Hide the element immediately for instant feedback, even before rule applies
            target.style.display = 'none'; 
        } else {
             console.warn('ZenithGuard Zapper: Could not generate a unique selector.');
        }
    }

    function handleKeyDown(event) {
        if (isActive && event.key === 'Escape') {
            stop();
        }
    }

    return { start, stop };
})();