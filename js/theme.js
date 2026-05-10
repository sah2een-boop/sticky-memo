/* Theme Manager */
const Theme = {
    init() {
        const saved = localStorage.getItem('sticky_theme');
        if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark');
        }
        this.updateIcon();
    },

    toggle() {
        document.documentElement.classList.toggle('dark');
        const isDark = document.documentElement.classList.contains('dark');
        localStorage.setItem('sticky_theme', isDark ? 'dark' : 'light');
        this.updateIcon();
    },

    updateIcon() {
        const isDark = document.documentElement.classList.contains('dark');
        const lightIcon = document.getElementById('theme-icon-light');
        const darkIcon = document.getElementById('theme-icon-dark');
        if (lightIcon) lightIcon.style.display = isDark ? 'none' : 'block';
        if (darkIcon) darkIcon.style.display = isDark ? 'block' : 'none';
    }
};

Theme.init();
