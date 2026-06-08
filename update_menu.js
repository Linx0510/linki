const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

const _USER_PAGES = [
  'index.html', 'my-quests.html', 'community.html', 'statistics.html', 
  'quests-catalog.html', 'experts-catalog.html', 'user-settings.html', 
  'support.html', 'about.html', 'quest-dashboard.html', 'quest-tracker.html', 
  'legal.html', 'cookie.html', 'notifications.html', 'auth.html'
];

const _MENU_HTML = `
  <a href="index.html" class="nav-item" data-page="index.html">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    Главная
  </a>

  <div class="nav-section-lbl">Квесты</div>
  <a href="my-quests.html" class="nav-item" data-page="my-quests.html">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4a2 2 0 0 0-2 2v1a4 4 0 0 0 4 4h.5"/><path d="M18 9h2a2 2 0 0 1 2 2v1a4 4 0 0 1-4 4h-.5"/><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v9a5 5 0 0 1-10 0V4Z"/></svg>
    Мои квесты <span class="nav-badge pink">3</span>
  </a>
  <a href="quests-catalog.html" class="nav-item" data-page="quests-catalog.html">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22a8 8 0 0 1-8-8c0-5 8-12 8-12s8 7 8 12a8 8 0 0 1-8 8Z"/></svg>
    Каталог квестов
  </a>

  <div class="nav-divider"></div>
  <div class="nav-section-lbl">Сообщество</div>
  <a href="community.html" class="nav-item" data-page="community.html">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="17" cy="7" r="4"/><path d="M10.5 14c0-1.93 2.91-3.5 6.5-3.5"/><circle cx="7" cy="14" r="4"/><path d="M1 20c0-2.21 2.687-4 6-4s6 1.79 6 4"/></svg>
    Сообщество
  </a>
  <a href="statistics.html" class="nav-item" data-page="statistics.html">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
    Статистика
  </a>
  <a href="experts-catalog.html" class="nav-item" data-page="experts-catalog.html">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    Эксперты
  </a>

  <div class="nav-divider"></div>
  <div class="nav-section-lbl">Профиль</div>
  <a href="user-settings.html" class="nav-item" data-page="user-settings.html">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>
    Мой профиль
  </a>
  <a href="support.html" class="nav-item" data-page="support.html">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    Поддержка
  </a>
  <a href="about.html" class="nav-item" data-page="about.html">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
    О системе
  </a>
`;

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  let original = content;

  // 1. Remove all nav-section-lbl and nav-divider
  content = content.replace(/<div class="nav-section-lbl">.*?<\/div>\s*/g, '');
  // sometimes it contains other attributes, match general
  content = content.replace(/<div class="nav-section-lbl"[\s\S]*?<\/div>\s*/g, '');
  content = content.replace(/<div class="nav-divider">.*?<\/div>\s*/g, '');

  // 2. Inject user menu on User-facing pages
  if (_USER_PAGES.includes(file)) {
    // we need to find where <div class="sidebar-head"> ends and <div class="sidebar-footer"> begins
    // looking for <div class="sidebar-footer">
    const footerStart = content.indexOf('<div class="sidebar-footer">');
    if (footerStart !== -1) {
      // Find where sidebar-head ends
      // The easiest way is to find `<div class="sidebar-user"` and then its closing tag
      const userBoxStart = content.indexOf('<div class="sidebar-user"');
      if (userBoxStart !== -1) {
        // Find the matching end of sidebar-head which is </div></div> after sidebar-user
        // since the markup can vary slightly, let's look backwards from footerStart to find the first `<a href`
        // Actually, we can just replace everything between the first <a href=... class="nav-item"> and footerStart
        // Wait! In community.html, it's completely missing after my-quests.html
        // And there are things like <a href="changelog.html"... floating around!
        // We should replace everything between `<div class="sidebar-head">...</div>` and `<div class="sidebar-footer">`
        
        // Find the END of <div class="sidebar-head">
        // It's typically after <div class="sidebar-user">...</div>
        // Search for <div class="sidebar-user" ...>
        let headEnd = content.indexOf('</div>', userBoxStart);
        // sidebar-user has `.s-avatar`, `.s-user-info`, `.s-user-xp`. It has exactly 4 closing tags.
        // Let's just find the next `<a href="` or `<div class="nav-section-lbl"` or `<div class="sidebar-footer"` after sidebar-user
        // The safest anchor is `<a href="index.html"` which is the 1st link. Or just use regex to replace all <a class="nav-item">
        
        // Strategy: We can replace everything from the first `<a href="index.html"` (or any `<a ... class="nav-item"`) until `<div class="sidebar-footer">`
        const regexReplaceItems = /(<a\s+href="[^"]*?"\s*class="nav-item(?:[\s\S]*?)<\/a>\s*)+(?:<a[^>]*>[^<]*<\/a>\s*)*(?=<div class="sidebar-footer">)/;

        if (regexReplaceItems.test(content)) {
          content = content.replace(regexReplaceItems, _MENU_HTML);
        } else {
            // fallback for completely messed up pages (like community.html where it might not match well if there's random links before footer)
            // Just find first `/div>` after .sidebar-user that precedes sidebar-footer
            // and maybe it's easier: replace `</div>\n  <a href="index.html"`
            const m = content.match(/<\/div>\s*<a href="[^"]*?"\s+class="nav-item"/);
            if (m) {
                const startIdx = content.indexOf(m[0]) + '</div>'.length; // keep the closing div of sidebar-head
                const chunk = content.slice(startIdx, footerStart);
                // replace chunk!
                content = content.substring(0, startIdx) + '\n' + _MENU_HTML + '\n  ' + content.substring(footerStart);
            }
        }
      }
    }
    
    // Set the active class!
    // Since we added data-page="file", we can use string replace:
    // replace `class="nav-item" data-page="${file}"` with `class="nav-item active" data-page="${file}"`
    content = content.replace(`class="nav-item" data-page="${file}"`, `class="nav-item active" data-page="${file}"`);
    
    // remove data-page attributes afterwards
    content = content.replace(/ data-page="[^"]*"/g, '');
  }

  // Save if changed
  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`Patched: ${file}`);
  }
}
