const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.startsWith('expert-') && f.endsWith('.html'));
files.forEach(f => {
  const c = fs.readFileSync(f, 'utf-8');
  const has = c.includes('<div class="sidebar-user">');
  console.log(f, has ? 'HAS' : 'GONE');
});
