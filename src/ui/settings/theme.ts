export type ThemeMode = "dark" | "light";

export function applyThemeToDocument(isDarkMode: boolean): void {
    document.body.classList.toggle("dark-theme", isDarkMode);
    document.body.classList.toggle("light-theme", !isDarkMode);
}
