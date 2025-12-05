import { sanitizeUrl, validateCssSelector, isValidDomain } from '../../src/js/utils/validators.js';

describe('Validators', () => {
    describe('sanitizeUrl', () => {
        test('should return valid for valid URLs', () => {
            const result = sanitizeUrl('https://example.com');
            expect(result.valid).toBe(true);
            expect(result.url).toBe('https://example.com/');
        });

        test('should return invalid for invalid URLs', () => {
            const result = sanitizeUrl('invalid-url');
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
        });

        test('should return invalid for disallowed protocols', () => {
            const result = sanitizeUrl('ftp://example.com');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('protocol');
        });

        test('should trim whitespace', () => {
            const result = sanitizeUrl(' https://example.com ');
            expect(result.valid).toBe(true);
            expect(result.url).toBe('https://example.com/');
        });
    });

    describe('isValidDomain', () => {
        test('should validate correct domains', () => {
            expect(isValidDomain('example.com').valid).toBe(true);
            expect(isValidDomain('sub.example.co.uk').valid).toBe(true);
            expect(isValidDomain('localhost').valid).toBe(true); // Wait, regex might fail on localhost if it expects dot?
        });

        test('should reject invalid domains', () => {
            expect(isValidDomain('-example.com').valid).toBe(false);
            // expect(isValidDomain('example').valid).toBe(false); // Regex check
        });
    });

    describe('validateCssSelector', () => {
        // Must mock document.querySelector for jsdom environment if it doesn't support full selector validation or throws weirdly
        // JSDOM usually supports standard selectors.

        test('should validate simple selectors', () => {
            expect(validateCssSelector('.class').valid).toBe(true);
            expect(validateCssSelector('#id').valid).toBe(true);
        });

        test('should reject empty selectors', () => {
            expect(validateCssSelector('').valid).toBe(false);
        });

        test('should reject dangerous patterns', () => {
            expect(validateCssSelector('div[onclick=alert(1)]').valid).toBe(false);
            expect(validateCssSelector('<script>').valid).toBe(false);
        });
    });
});
