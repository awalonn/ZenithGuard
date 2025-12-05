import { setupBrowser, teardownBrowser, getExtensionId } from './setup.js';
import { Browser } from 'puppeteer';

describe('Extension Loading', () => {
    let browser: Browser;

    beforeAll(async () => {
        browser = await setupBrowser();
    });

    afterAll(async () => {
        await teardownBrowser();
    });

    test('should load the extension and have a valid ID', async () => {
        const extensionId = await getExtensionId(browser);
        expect(extensionId).toBeDefined();
        expect(extensionId.length).toBeGreaterThan(0);
        console.log(`Extension loaded with ID: ${extensionId}`);
    });

    test('should register service worker', async () => {
        const targets = await browser.targets();
        const serviceWorker = targets.find(t => t.type() === 'service_worker');
        expect(serviceWorker).toBeDefined();
    });
});
