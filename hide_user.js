const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
let count = 0;
for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  if (content.includes('class="sidebar-user"')) {
    // Remove if already added to avoid duplicates if run multiple times
    content = content.replace(/class="sidebar-user" style="display: none !important;"/g, 'class="sidebar-user"');
    
    // Add display:none
    content = content.replace(/class="sidebar-user"/g, 'class="sidebar-user" style="display: none !important;"');
    fs.writeFileSync(filePath, content);
    console.log(`Updated: ${file}`);
    count++;
  }
}
console.log(`Total files updated: ${count}`);
