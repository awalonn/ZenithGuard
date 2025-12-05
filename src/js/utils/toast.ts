// js/utils/toast.ts - Centralized Toast Notification Handler
// REFACTORED: This is no longer an ES module.
// It attaches its functions to the window object to be accessible
// from content scripts injected via scripting.executeScript.

// Ensure the utility namespace exists
// @ts-ignore - Window augmentation is tricky in non-module scripts
window.ZenithGuardToastUtils = window.ZenithGuardToastUtils || {};

type ToastType = 'success' | 'error' | 'loading' | 'info';

interface ToastOptions {
    message: string;
    type?: ToastType;
    duration?: number;
    id?: string | null;
}

// Define the shape of our global object
export interface ZenithGuardToastUtils {
    showToast: (options: ToastOptions) => void;
}

declare global {
    interface Window {
        ZenithGuardToastUtils: ZenithGuardToastUtils;
    }
}

/**
 * Displays a toast notification. Can be used from content scripts or extension pages.
 * @param {object} options - The options for the toast.
 * @param {string} options.message - The message to display.
 * @param {string} [options.type='success'] - The type of toast ('success', 'error', 'loading', 'info').
 * @param {number} [options.duration=3000] - Duration in ms. 0 for a persistent toast.
 * @param {string|null} [options.id=null] - An optional ID for the toast element.
 */
window.ZenithGuardToastUtils.showToast = ({ message, type = 'success', duration = 3000, id = null }: ToastOptions) => {
    // Ensure a container exists, creating one if necessary.
    let container = document.getElementById('zg-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'zg-toast-container';
        document.body.appendChild(container);
    }

    // If an ID is provided, remove any existing toast with the same ID
    if (id) {
        const existingToast = document.getElementById(id);
        if (existingToast) existingToast.remove();
    }

    const toast = document.createElement('div');
    if (id) toast.id = id;
    toast.className = `zg-toast zg-toast-${type}`;

    // Explicitly type the map to allow indexing by ToastType
    const iconHtmlMap: Record<ToastType, string> = {
        success: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" /></svg>`,
        error: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd" /></svg>`,
        loading: `<div class="zg-toast-spinner"></div>`,
        info: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>`
    };

    const iconHtml = iconHtmlMap[type] || '';

    // Add prefix to message
    toast.innerHTML = `${iconHtml}<span>ZenithGuard: ${message}</span>`;

    container.appendChild(toast);

    if (duration > 0) {
        setTimeout(() => {
            toast.classList.add('hiding');
            // Remove the element after the animation completes to prevent DOM clutter.
            toast.addEventListener('animationend', () => toast.remove(), { once: true });
        }, duration);
    }
};