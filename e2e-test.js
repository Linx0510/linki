const http = require('http');

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 3000, path, method,
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const r = http.request(opts, res => {
      let out = '';
      res.on('data', c => out += c);
      res.on('end', () => {
        try { resolve({ s: res.statusCode, b: JSON.parse(out) }); }
        catch (e) { resolve({ s: res.statusCode, b: out }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function test() {
  let pass = 0, fail = 0;
  const check = (label, ok, info = '') => {
    const icon = ok ? '✓' : '✗';
    console.log(icon + ' ' + label + (info ? ' | ' + info : ''));
    ok ? pass++ : fail++;
  };

  // --- AUTH ---
  let r = await req('POST', '/api/auth/login', { email: 'admin@ludo.com', password: '123456' });
  check('Admin login', r.s === 200 && r.b.user && r.b.user.role === 'admin');
  const adminTok = r.b.token;

  r = await req('POST', '/api/auth/login', { email: 'artem@ludo.com', password: '123456' });
  check('Expert login', r.s === 200 && r.b.user && r.b.user.role === 'expert', r.b.user && r.b.user.username);
  const expTok = r.b.token;
  const expId = r.b.user && r.b.user.id;

  r = await req('POST', '/api/auth/login', { email: 'ivan@test.com', password: '123456' });
  check('User login', r.s === 200, 'xp=' + (r.b.user && r.b.user.xp));
  const usrTok = r.b.token;
  const usrId = r.b.user && r.b.user.id;

  r = await req('POST', '/api/auth/login', { email: 'admin@ludo.com', password: 'wrongpassword' });
  check('Wrong password blocked (401)', r.s === 401);

  // --- QUESTS ---
  r = await req('GET', '/api/quests');
  check('List quests (public)', r.s === 200 && Array.isArray(r.b), r.b.length + ' quests');

  const questPayload = {
    questData: { name: 'Final E2E Quest', description: 'automated test quest', category: 'Спорт', difficulty: 'Easy', duration: 3, rewardXp: 45, price: 0 },
    tasks: [
      { day: 1, title: 'Day 1', description: 'First task', instructions: '<p>Do it</p>' },
      { day: 2, title: 'Day 2', description: 'Second task', instructions: '<p>Do it</p>' },
      { day: 3, title: 'Day 3', description: 'Third task', instructions: '<p>Do it</p>' }
    ]
  };

  r = await req('POST', '/api/quests', questPayload, expTok);
  check('Create quest (expert)', r.s === 201 && r.b.questId, 'id=' + r.b.questId);
  const qId = r.b.questId;

  r = await req('POST', '/api/quests', questPayload, usrTok);
  check('Create quest (user) → 403 blocked', r.s === 403);

  r = await req('POST', '/api/quests/join', { questId: qId }, usrTok);
  check('Join quest', r.s === 200 && r.b.success);

  r = await req('POST', '/api/quests/complete-day', { questId: qId, dayNumber: 1, xpAwarded: 45 }, usrTok);
  check('Complete day 1', r.s === 200 && r.b.success, 'new xp=' + r.b.xp);

  // --- ADMIN ---
  r = await req('GET', '/api/admin/stats', null, adminTok);
  check('Admin stats', r.s === 200 && r.b.totalUsers, 'users=' + r.b.totalUsers);

  r = await req('GET', '/api/admin/leaderboard', null, adminTok);
  check('Admin leaderboard', r.s === 200 && Array.isArray(r.b), r.b.length + ' players');

  r = await req('GET', '/api/admin/submissions', null, adminTok);
  check('Admin submissions', r.s === 200 && Array.isArray(r.b));

  // --- EXPERTS ---
  r = await req('GET', '/api/experts');
  check('List experts (public)', r.s === 200 && Array.isArray(r.b), r.b.length + ' experts');

  r = await req('GET', '/api/experts/' + expId + '/quests', null, expTok);
  check('Expert quest list', r.s === 200, (Array.isArray(r.b) ? r.b.length : 0) + ' quests');

  // --- USER ---
  r = await req('GET', '/api/user/' + usrId + '/notifications', null, usrTok);
  check('User notifications', r.s === 200, 'unread=' + r.b.unreadCount);

  r = await req('GET', '/api/user/me/profile', null, usrTok);
  check('Own profile (/me)', r.s === 200 && r.b.username);

  // --- SUPPORT ---
  r = await req('POST', '/api/support/contact', { name: 'Test', email: 't@t.com', subject: 'Test', message: 'E2E test support message' });
  check('Support ticket', r.s === 201 && r.b.success, 'id=' + r.b.ticketId);

  // --- SUMMARY ---
  const total = pass + fail;
  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILURES: ' + fail) + ' | ' + pass + '/' + total + ' tests');
  process.exit(fail > 0 ? 1 : 0);
}

test().catch(e => { console.error('E2E crash:', e.message); process.exit(1); });
