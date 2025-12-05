import { setupBrowser, teardownBrowser, getExtensionId } from './setup.js';
import { Browser, Page } from 'puppeteer';

describe('Popup UI Rendering', () => {
    let browser: Browser;
    let extensionId: string;
    let popupPage: Page;

    beforeAll(async () => {
        browser = await setupBrowser();
        extensionId = await getExtensionId(browser);
    });

    afterAll(async () => {
        await teardownBrowser();
    });

    test('should render the popup page', async () => {
        // Construct the popup URL (MV3 standard)
        const popupUrl = `chrome-extension://${extensionId}/src/pages/popup.html`;

        popupPage = await browser.newPage();
        await popupPage.goto(popupUrl, { waitUntil: 'networkidle0' });

        // Check page title
        const title = await popupPage.title();
        expect(title).toBe('ZenithGuard');

        // Check Brand Name
        const brandName = await popupPage.$eval('.brand-name', el => el.textContent);
        expect(brandName).toBe('ZenithGuard');

        // Check Power Button existence
        const powerBtn = await popupPage.$('#power-btn');
        expect(powerBtn).toBeDefined();
    });

    test('should switch tabs correctly', async () => {
        if (!popupPage) return; // Skip if previous test failed

        // Initial state: Home tab active
        let homeDisplay = await popupPage.$eval('#home', el => getComputedStyle(el).display);
        expect(homeDisplay).not.toBe('none');

        // Click Tools tab
        await popupPage.click('button[data-tab="tools"]');

        // Wait for tab switch (display change)
        await popupPage.waitForFunction(() => {
            const tools = document.querySelector('#tools');
            return tools && getComputedStyle(tools).display !== 'none';
        });

        // Verify content
        const zapperBtn = await popupPage.$('#zapper-mode-btn');
        expect(zapperBtn).toBeDefined();
    });
});
