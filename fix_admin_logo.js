const fs = require('fs');
const glob = require('glob');

const files = fs.readdirSync('.').filter(f => f.startsWith('admin-') && f.endsWith('.html'));

for (const file of files) {
  let content = fs.readFileSync(file, 'utf-8');
  const before = content.split('АКТИВ').length - 1;
  content = content.replace(/<span style="font-family:'Unbounded',sans-serif;font-size:18px;font-weight:900;color:var\(--text\);">АКТИВ<\/span>/g, '');
  fs.writeFileSync(file, content, 'utf-8');
  const after = content.split('АКТИВ').length - 1;
  console.log(file, 'removed', before - after, 'spans');
}
