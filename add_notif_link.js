const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

let count = 0;
for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  let original = content;

  if (content.includes('<div class="notif-btn"')) {
    content = content.replace(/<div class="notif-btn"(.*?)>/g, (match, attrs) => {
      // If it already has an onclick, return as is
      if (attrs.includes('onclick')) {
        return match;
      }
      return `<div class="notif-btn"${attrs} onclick="window.location.href='notifications.html'" style="cursor: pointer;">`;
    });

    if (content !== original) {
      fs.writeFileSync(filePath, content);
      console.log(`Updated: ${file}`);
      count++;
    }
  }
}
console.log(`Total files updated: ${count}`);
