/**
 * theme.js - Shared theme persistence and toggle logic
 */

// 1. Immediate initialization (to be called in <head> or start of <body>)
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'light') {
        document.documentElement.classList.add('light-mode');
        if (document.body) document.body.classList.add('light-mode');
    } else {
        document.documentElement.classList.remove('light-mode');
        if (document.body) document.body.classList.remove('light-mode');
    }
}

// 2. Toggle functionality
function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    document.documentElement.classList.toggle('light-mode', isLight);
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    updateThemeIcons(isLight);
}

// 3. Icon synchronization
function updateThemeIcons(isLight) {
    const moonIcon = document.querySelector('.icon-moon');
    const sunIcon = document.querySelector('.icon-sun');
    if (moonIcon) moonIcon.style.display = isLight ? 'none' : 'block';
    if (sunIcon) sunIcon.style.display = isLight ? 'block' : 'none';
}

// 4. Initialize icons when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const isLight = document.body.classList.contains('light-mode');
    updateThemeIcons(isLight);
});

// Run immediate init if possible (though callers should also call it directly)
if (document.body) initTheme();
else document.addEventListener('DOMContentLoaded', initTheme);
