import puppeteer, { Browser, Page } from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to extension build output
const EXTENSION_PATH = path.resolve(__dirname, '../../dist');

let browser: Browser;
let extensionPage: Page;

export const setupBrowser = async () => {
    browser = await puppeteer.launch({
        headless: 'new', // Use new headless mode
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ],
        executablePath: process.env.PUPPETEER_EXEC_PATH // Optional override
    });

    // Wait for extension to be ready by finding one of its pages or waiting
    // background page is usually the first target of interest or popup
    return browser;
};

export const teardownBrowser = async () => {
    if (browser) {
        await browser.close();
    }
};

export const getExtensionId = async (browser: Browser): Promise<string> => {
    const startTime = Date.now();
    const TIMEOUT = 10000; // 10 seconds

    while (Date.now() - startTime < TIMEOUT) {
        const targets = await browser.targets();
        const extensionTarget = targets.find(target => target.type() === 'service_worker' && target.url().includes('chrome-extension://'));

        if (extensionTarget) {
            const url = extensionTarget.url();
            const id = url.split('/')[2];
            return id;
        }

        // Wait 500ms before next check
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Final debug attempt
    const finalTargets = await browser.targets();
    console.error('Available targets:', finalTargets.map(t => `${t.type()} - ${t.url()}`));

    throw new Error('Could not find extension target after timeout');
};
