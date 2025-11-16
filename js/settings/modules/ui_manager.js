// js/settings/modules/ui_manager.js
import { showToast as showGlobalToast } from '../../utils/toast.js';

export class UIManager {
    constructor() {
        // Defer DOM selections to the initialize method to ensure the DOM is ready.
        this.navButtons = null;
        this.contentSections = null;
        this.themeToggle = null;
        this.toastContainer = document.getElementById('zg-toast-container');
    }

    initialize(settings) {
        // Perform DOM selections now that we are sure the DOM is fully loaded.
        this.navButtons = document.querySelectorAll('.nav-btn');
        this.contentSections = document.querySelectorAll('.content-section');
        this.themeToggle = document.getElementById('toggle-theme');
        
        this.attachNavListeners();
        this.attachThemeListener();
        this.applyTheme(settings.theme || 'dark');
    }

    attachNavListeners() {
        this.navButtons.forEach(button => {
            button.addEventListener('click', () => {
                const sectionId = button.dataset.section;
                this.navButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                this.contentSections.forEach(section => {
                    section.classList.toggle('active', section.id === sectionId);
                });
            });
        });
    }

    attachThemeListener() {
        this.themeToggle.addEventListener('change', async () => {
            const newTheme = this.themeToggle.checked ? 'light' : 'dark';
            await chrome.storage.sync.set({ theme: newTheme });
            this.applyTheme(newTheme);
            this.showToast('Theme saved!');
        });
    }

    applyTheme(theme) {
        if (theme === 'light') {
            document.body.classList.add('light-theme');
            this.themeToggle.checked = true;
        } else {
            document.body.classList.remove('light-theme');
            this.themeToggle.checked = false;
        }
    }

    showToast = (message, type = 'success') => {
        // This method maintains a simple API for other settings modules
        // while calling the more feature-rich global toast handler.
        showGlobalToast({ message, type });
    }
}
