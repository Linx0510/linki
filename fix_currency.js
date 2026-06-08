const fs = require('fs');
let c = fs.readFileSync('expert-finances.html', 'utf-8');

// Replace ? after digits with space: '42 500 ?' → '42 500 ₽'
c = c.replace(/(\d)\s*\?/g, '$1 ₽');

// Replace ? in currency spans/buttons
c = c.replace(/<span class="w-currency">\?<\/span>/g, '<span class="w-currency">₽</span>');

// Replace close button ? with ✕
c = c.replace(/<button class="w-close" onclick="closeWithdraw\(\)">\?<\/button>/g, '<button class="w-close" onclick="closeWithdraw()">✕</button>');

// Replace '? Ожидаемое зачисление' with clock icon
c = c.replace(/\? Ожидаемое зачисление/g, '⏱ Ожидаемое зачисление');

// Replace 'Биохакинг сна ? 3' — this is HTML td, should be dot
c = c.replace(/Биохакинг сна \? 3/g, 'Биохакинг сна · 3');

fs.writeFileSync('expert-finances.html', c, 'utf-8');
console.log('Done');
