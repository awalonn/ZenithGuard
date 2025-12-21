// src/js/settings/modules/ui_manager.ts
import { AppSettings } from '../../types.js';
import { showToast } from '../../utils/toast.js';

export class UIManager {

    private navButtons: NodeListOf<HTMLButtonElement> | null;
    private contentSections: NodeListOf<HTMLElement> | null;
    private themeToggle: HTMLInputElement | null;
    private toastContainer: HTMLElement | null;

    constructor() {
        // Defer DOM selections to the initialize method to ensure the DOM is ready.
        this.navButtons = null;
        this.contentSections = null;
        this.themeToggle = null;
        this.toastContainer = document.getElementById('zg-toast-container');
    }

    initialize(settings: Partial<AppSettings> & { theme?: string }): void {
        // Perform DOM selections now that we are sure the DOM is fully loaded.
        this.navButtons = document.querySelectorAll('.nav-btn');
        this.contentSections = document.querySelectorAll('.content-section');
        this.themeToggle = document.getElementById('toggle-theme') as HTMLInputElement;

        this.attachNavListeners();
        this.attachThemeListener();
        this.applyTheme(settings.theme || 'dark');
    }

    private attachNavListeners(): void {
        if (!this.navButtons || !this.contentSections) return;
        this.navButtons.forEach(button => {
            button.addEventListener('click', () => {
                const sectionId = button.dataset.section;
                if (!this.navButtons || !this.contentSections) return;

                this.navButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                this.contentSections.forEach(section => {
                    section.classList.toggle('active', section.id === sectionId);
                });
            });
        });
    }

    private attachThemeListener(): void {
        if (!this.themeToggle) return;
        this.themeToggle.addEventListener('change', async () => {
            if (!this.themeToggle) return;
            const newTheme = this.themeToggle.checked ? 'light' : 'dark';
            // @ts-ignore - Theme handled separately from AppSettings interface temporarily or extend AppSettings if needed
            await chrome.storage.sync.set({ theme: newTheme });
            this.applyTheme(newTheme);
            this.showToast('Theme saved!');
        });
    }

    applyTheme(theme: string): void {
        if (!this.themeToggle) return;
        if (theme === 'light') {
            document.body.classList.add('light-theme');
            this.themeToggle.checked = true;
        } else {
            document.body.classList.remove('light-theme');
            this.themeToggle.checked = false;
        }
    }

    showToast(message: string, type: 'success' | 'error' | 'info' = 'success'): void {
        showToast({ message, type });
    }
}