import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DB_PATH = ':memory:';
const { start } = await import('./server.js');
const srv = await start(0), base = 'http://localhost:' + srv.address().port;
const call = async (m, p, tok, body) => { const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok && { Authorization: 'Bearer ' + tok }) }, body: body && JSON.stringify(body) }); return { s: r.status, d: await r.json() }; };
const login = async (id, pw = 'pass123') => (await call('POST', '/api/login', null, { identifier: id, password: pw })).d.token;
test.after(() => srv.close());

test('full workflow: student -> queues -> HOD -> faculty -> history -> escalation -> student', async () => {
  const st = await login('1EC23EC001'), hod = await login('hod@college.edu'), fac = await login('kumar@college.edu');
  const a = await call('POST', '/api/requests', st, { type: 'Bonafide Certificate', description: 'Need bonafide', priority: 'HIGH' });
  const b = await call('POST', '/api/requests', st, { type: 'Lab Issue', description: 'Urgent lab' });
  assert.equal(a.d.structure, 'QUEUE'); assert.equal(b.d.structure, 'PRIORITY_QUEUE');
  const dsa = (await call('GET', '/api/dsa/state', hod)).d;
  assert.ok(dsa.queue.includes(a.d.request_id)); assert.equal(dsa.priorityQueue[0].id, 'Q1003'); // HIGH requests first, oldest first
  assert.equal((await call('GET', '/api/search?q=1ec23ec001', hod)).d.method, 'HASH_MAP');
  const sorted = (await call('GET', '/api/requests?sort=priority&dir=desc', hod)).d; assert.equal(sorted.algorithm, 'Merge Sort'); assert.equal(sorted.requests[0].priority, 'HIGH');
  const id = a.d.request_id;
  assert.equal((await call('POST', `/api/requests/${id}/assign`, hod, { facultyId: 1 })).s, 200);
  assert.equal((await call('POST', `/api/requests/${id}/accept`, fac)).s, 200);
  assert.equal((await call('POST', `/api/requests/${id}/resolve`, fac, { comment: 'Fixed' })).s, 200);
  const d = (await call('GET', `/api/requests/${id}`, st)).d;
  assert.equal(d.status, 'RESOLVED'); assert.deepEqual(d.history.map(h => h.new_status), ['RESOLVED', 'IN_PROGRESS', 'ASSIGNED', 'SUBMITTED']);
  const e = await call('POST', '/api/requests/Q1004/escalate', hod); // seeded SUBMITTED request cannot be escalated before assignment? status check
  assert.equal(e.s, 409);
  const esc = await call('POST', '/api/requests/Q1006/escalate', fac); assert.equal(esc.s, 403); // Q1006 belongs to Priya
});
test('security: roles, bad login, validation, duplicates', async () => {
  const st = await login('1EC23EC002'), hod = await login('hod@college.edu');
  assert.equal((await call('GET', '/api/requests', st)).s, 403); assert.equal((await call('GET', '/api/requests')).s, 401);
  assert.equal((await call('POST', '/api/login', null, { identifier: 'hod@college.edu', password: 'wrong' })).s, 401);
  assert.equal((await call('POST', '/api/requests', st, { type: 'Lab Issue', description: '', priority: 'HIGH' })).s, 400);
  assert.equal((await call('POST', '/api/requests', st, { type: 'Nope', description: 'x', priority: 'HIGH' })).s, 400);
  assert.equal((await call('GET', '/api/requests/Q9999', hod)).s, 404);
  assert.equal((await call('GET', '/api/requests/Q1001', st)).s, 403); // not their request
  const reg = { usn: '1EC23EC001', name: 'X', email: 'x@y.com', department: 'ECE', year: 1, password: 'secret1' };
  assert.equal((await call('POST', '/api/register', null, reg)).s, 409);
});
test('registration approval and faculty management', async () => {
  const hod = await login('hod@college.edu');
  assert.equal((await call('POST', '/api/login', null, { identifier: '1EC23EC004', password: 'pass123' })).s, 403); // awaiting approval
  assert.equal((await call('POST', '/api/registrations/1EC23EC004/approve', hod)).s, 200);
  assert.ok(await login('1EC23EC004'));
  const f = (await call('POST', '/api/faculty', hod, { name: 'Dr. New', email: 'new@college.edu', department: 'Electronics' })).d;
  assert.equal(f.code, 'FAC003'); assert.ok(await login('new@college.edu', f.temporaryPassword));
  const list = (await call('GET', '/api/faculty', hod)).d, nid = list.find(x => x.email === 'new@college.edu').id;
  assert.equal((await call('POST', `/api/faculty/${nid}/toggle`, hod)).d.active, false);
  assert.equal((await call('POST', '/api/login', null, { identifier: 'new@college.edu', password: f.temporaryPassword })).s, 403);
});

test('priority is automatic; attachments upload/download with access control', async () => {
  const st = await login('1EC23EC001'), st2 = await login('1EC23EC002'), hod = await login('hod@college.edu');
  const c = await call('POST', '/api/requests', st, { type: 'Bonafide Certificate', description: 'x', priority: 'HIGH' });
  assert.equal((await call('GET', '/api/requests/' + c.d.request_id, st)).d.priority, 'LOW'); // student input ignored
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  assert.equal((await call('POST', '/api/requests/Q1001/attachments', st, { filename: 'a.png', mime: 'image/png', data: png })).s, 403);
  assert.equal((await call('POST', '/api/requests/Q1001/attachments', hod, { filename: 'a.exe', mime: 'application/x-msdownload', data: png })).s, 400);
  assert.equal((await call('POST', '/api/requests/Q1001/attachments', hod, { filename: 'fake.pdf', mime: 'application/pdf', data: png })).s, 400);
  assert.equal((await call('POST', '/api/requests/Q1001/attachments', hod, { filename: 'cert.png', mime: 'image/png', data: png })).s, 200);
  const d = (await call('GET', '/api/requests/Q1001', st)).d; assert.equal(d.attachments.length, 1);
  const r = await fetch(base + '/api/attachments/' + d.attachments[0].id, { headers: { Authorization: 'Bearer ' + st } });
  assert.equal(r.status, 200); assert.equal(new Uint8Array(await r.arrayBuffer())[0], 0x89);
  assert.equal((await fetch(base + '/api/attachments/' + d.attachments[0].id, { headers: { Authorization: 'Bearer ' + st2 } })).status, 403);
});

test('HOD can resolve any open request; faculty must accept first', async () => {
  const hod = await login('hod@college.edu'), pri = await login('priya@college.edu');
  assert.ok((await call('GET', '/api/dsa/state', hod)).d.queue.includes('Q1002'));
  assert.equal((await call('POST', '/api/requests/Q1002/resolve', hod, { comment: 'Certificate issued' })).s, 200);
  assert.ok(!(await call('GET', '/api/dsa/state', hod)).d.queue.includes('Q1002')); // removed from the Queue
  assert.equal((await call('GET', '/api/requests/Q1002', hod)).d.status, 'RESOLVED');
  assert.equal((await call('POST', '/api/requests/Q1006/resolve', pri, { comment: 'skip' })).s, 409); // ASSIGNED, not accepted yet
});
