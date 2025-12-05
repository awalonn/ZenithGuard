/**
 * Input validation utilities for ZenithGuard
 * Provides security validation for user inputs across the extension
 */

interface ValidationResult {
    valid: boolean;
    error?: string;
    url?: string;
}

interface UrlSanitizationOptions {
    allowedProtocols?: string[];
}

/**
 * Validates a CSS selector for syntax and security
 * @param {string} selector - The CSS selector to validate
 * @returns {ValidationResult} Validation result
 */
export function validateCssSelector(selector: string): ValidationResult {
    if (!selector || typeof selector !== 'string') {
        return { valid: false, error: 'Selector must be a non-empty string' };
    }

    const trimmed = selector.trim();

    if (trimmed.length === 0) {
        return { valid: false, error: 'Selector cannot be empty' };
    }

    if (trimmed.length > 500) {
        return { valid: false, error: 'Selector is too long (max 500 characters)' };
    }

    // Check for potentially dangerous patterns
    const dangerousPatterns = [
        /<script/i,
        /javascript:/i,
        /on\w+=/i, // Event handlers like onclick=
        /eval\(/i,
        /expression\(/i // IE-specific CSS expression
    ];

    for (const pattern of dangerousPatterns) {
        if (pattern.test(trimmed)) {
            return { valid: false, error: 'Selector contains potentially unsafe content' };
        }
    }

    // Try to validate the selector by testing it
    try {
        document.querySelector(trimmed);
        return { valid: true };
    } catch (error: any) {
        return {
            valid: false,
            error: `Invalid CSS selector syntax: ${error.message}`
        };
    }
}

/**
 * Validates and sanitizes a URL
 * @param {string} url - The URL to validate
 * @param {UrlSanitizationOptions} options - Validation options
 * @returns {ValidationResult} Validation result with sanitized URL
 */
export function sanitizeUrl(url: string, options: UrlSanitizationOptions = {}): ValidationResult {
    const { allowedProtocols = ['http:', 'https:'] } = options;

    if (!url || typeof url !== 'string') {
        return { valid: false, error: 'URL must be a non-empty string' };
    }

    const trimmed = url.trim();

    if (trimmed.length === 0) {
        return { valid: false, error: 'URL cannot be empty' };
    }

    if (trimmed.length > 2048) {
        return { valid: false, error: 'URL is too long (max 2048 characters)' };
    }

    try {
        const urlObj = new URL(trimmed);

        if (!allowedProtocols.includes(urlObj.protocol)) {
            return {
                valid: false,
                error: `URL protocol must be one of: ${allowedProtocols.join(', ')}`
            };
        }

        return { valid: true, url: urlObj.href };
    } catch (error: any) {
        return {
            valid: false,
            error: `Invalid URL format: ${error.message}`
        };
    }
}

/**
 * Validates user input for AI description prompts
 * @param {string} text - The description text to validate
 * @returns {ValidationResult} Validation result
 */
export function validateAiDescription(text: string): ValidationResult {
    if (!text || typeof text !== 'string') {
        return { valid: false, error: 'Description must be a non-empty string' };
    }

    const trimmed = text.trim();

    if (trimmed.length === 0) {
        return { valid: false, error: 'Description cannot be empty' };
    }

    if (trimmed.length < 3) {
        return { valid: false, error: 'Description is too short (min 3 characters)' };
    }

    if (trimmed.length > 500) {
        return { valid: false, error: 'Description is too long (max 500 characters)' };
    }

    return { valid: true };
}

/**
 * Validates a domain name
 * @param {string} domain - The domain to validate
 * @returns {ValidationResult} Validation result
 */
export function isValidDomain(domain: string): ValidationResult {
    if (!domain || typeof domain !== 'string') {
        return { valid: false, error: 'Domain must be a non-empty string' };
    }

    const trimmed = domain.trim();

    if (trimmed.length === 0) {
        return { valid: false, error: 'Domain cannot be empty' };
    }

    if (trimmed.length > 253) {
        return { valid: false, error: 'Domain is too long (max 253 characters)' };
    }

    // Basic domain validation pattern
    const domainPattern = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;

    if (!domainPattern.test(trimmed)) {
        return { valid: false, error: 'Invalid domain format' };
    }

    return { valid: true };
}
