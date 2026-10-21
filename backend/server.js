// REST API. SQLite is the source of truth; DSA structures are rebuilt from it at startup and kept in sync by every action.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { db, hashPassword, verifyPassword } from './db.js';
import { Queue } from '../dsa/Queue.js';
import { PriorityQueue } from '../dsa/PriorityQueue.js';
import { HashMap } from '../dsa/HashMap.js';
import { Stack } from '../dsa/Stack.js';
import { mergeSort } from '../dsa/Sorting.js';
import { Graph } from '../dsa/Graph.js';

const PRI = { HIGH: 3, MEDIUM: 2, LOW: 1 };
const SRANK = { SUBMITTED: 1, PENDING: 2, ASSIGNED: 3, IN_PROGRESS: 4, ESCALATED: 5, RESOLVED: 6, REJECTED: 7 };
const CATS = ['Bonafide Certificate', 'Leave Request', 'Lab Issue', 'Scholarship Issue', 'Academic Query', 'Other'];
// Priority is decided by the system from the category (students cannot choose it); the HOD can still change it.
const AUTO_PRIORITY = { 'Lab Issue': 'HIGH', 'Scholarship Issue': 'HIGH', 'Leave Request': 'MEDIUM', 'Academic Query': 'MEDIUM', 'Bonafide Certificate': 'LOW', 'Other': 'LOW' };
const NEXT = { SUBMITTED: ['ASSIGNED', 'REJECTED', 'RESOLVED'], PENDING: ['ASSIGNED', 'REJECTED', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED'], ASSIGNED: ['IN_PROGRESS', 'ESCALATED', 'ASSIGNED', 'REJECTED', 'RESOLVED'],
  IN_PROGRESS: ['RESOLVED', 'PENDING', 'ESCALATED', 'ASSIGNED'], ESCALATED: ['ASSIGNED', 'ESCALATED', 'RESOLVED', 'REJECTED'] };
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const now = () => new Date().toISOString(), num = id => +id.slice(1), q = (sql, ...a) => db.prepare(sql).all(...a), q1 = (sql, ...a) => db.prepare(sql).get(...a), run = (sql, ...a) => db.prepare(sql).run(...a);

let HM, NQ, PQ, RQ, STK, G; const sessions = new HashMap(); // sessions: token -> user (also a Hash Map)
const place = r => r.priority === 'HIGH' ? PQ.insert({ id: r.request_id, pri: 3, seq: num(r.request_id) }) : NQ.enqueue(r.request_id);
const unplace = id => { NQ.remove(id); PQ.remove(id); };
function rebuild() {
  HM = new HashMap(); q('SELECT id,usn,name,department,year,email FROM students').forEach(s => HM.insert(s.usn, s));
  NQ = new Queue(); PQ = new PriorityQueue(); STK = {};
  q("SELECT * FROM requests ORDER BY CAST(SUBSTR(request_id,2) AS INTEGER)").forEach(r => {
    STK[r.request_id] = new Stack(q('SELECT * FROM request_history WHERE request_id=? ORDER BY history_id', r.request_id));
    if (r.status === 'SUBMITTED') place(r);
  });
  RQ = new Queue(); q('SELECT usn FROM registrations ORDER BY id').forEach(r => RQ.enqueue(r.usn));
  G = new Graph(); G.addEdge('STUDENT', 'FACULTY'); G.addEdge('FACULTY', 'HOD'); G.addEdge('HOD', 'PRINCIPAL');
}
const notify = (role, id, message, rid = null) => run('INSERT INTO notifications(recipient_role,recipient_id,message,request_id,is_read,created_at) VALUES(?,?,?,?,0,?)', role, id, message, rid, now());
const SEL = 'SELECT r.*, s.usn, s.name AS student_name, s.department, f.name AS faculty_name FROM requests r JOIN students s ON s.id=r.student_id LEFT JOIN faculty f ON f.id=r.assigned_faculty';
const getReq = id => { const r = q1('SELECT * FROM requests WHERE request_id=?', id); if (!r) throw new HttpError(404, 'Invalid request ID.'); return r; };
function change(r, to, by, comment = '') {
  if (!(NEXT[r.status] || []).includes(to)) throw new HttpError(409, `Cannot change status from ${r.status} to ${to}.`);
  const t = now(); run('UPDATE requests SET status=?,updated_at=? WHERE request_id=?', to, t, r.request_id);
  run('INSERT INTO request_history(request_id,old_status,new_status,changed_by,timestamp,comment) VALUES(?,?,?,?,?,?)', r.request_id, r.status, to, by, t, comment);
  STK[r.request_id].push({ request_id: r.request_id, old_status: r.status, new_status: to, changed_by: by, timestamp: t, comment }); // Stack push on every status change
  notify('STUDENT', r.student_id, `Your request ${r.request_id} is now ${to}.`, r.request_id);
}
const detail = id => { const r = q1(SEL + ' WHERE r.request_id=?', id); if (!r) throw new HttpError(404, 'Invalid request ID.');
  return { ...r, history: [...STK[id].items].reverse(), escalation_path: G.path('STUDENT', r.escalation_level), attachments: q('SELECT id,filename,mime,size,created_at FROM attachments WHERE request_id=? ORDER BY id', id) }; };
const need = (b, ...k) => k.forEach(x => { if (b[x] === undefined || String(b[x]).trim() === '') throw new HttpError(400, `Missing field: ${x}`); });
const tempPw = () => 'Fac@' + crypto.randomInt(1000, 9999);
const facultyOnly = (u, r) => { if (u.role === 'FACULTY' && r.assigned_faculty !== u.id) throw new HttpError(403, 'This request is not assigned to you.'); };

const routes = [];
const on = (m, p, roles, fn) => routes.push([m, new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), roles, fn]);
on('POST', '/api/login', null, ({ body }) => {
  need(body, 'identifier', 'password'); const id = String(body.identifier).trim();
  const f = q1('SELECT * FROM faculty WHERE email=?', id.toLowerCase()); let user, hash;
  if (f) { if (!f.active) throw new HttpError(403, 'This account is deactivated. Contact the HOD.'); user = { role: f.role, id: f.id, name: f.name }; hash = f.password; }
  else { const s = HM.search(id.toUpperCase());  // Hash Map lookup
    if (!s) { if (q1('SELECT 1 FROM registrations WHERE usn=?', id.toUpperCase())) throw new HttpError(403, 'Your registration is awaiting HOD approval.'); throw new HttpError(401, 'Invalid credentials.'); }
    user = { role: 'STUDENT', id: s.id, usn: s.usn, name: s.name }; hash = q1('SELECT password FROM students WHERE id=?', s.id).password; }
  if (!verifyPassword(String(body.password), hash)) throw new HttpError(401, 'Invalid credentials.');
  const token = crypto.randomBytes(24).toString('hex'); sessions.insert(token, user); return { token, user };
});
on('POST', '/api/logout', [], ({ token }) => { sessions.delete(token); return { ok: true }; });
on('POST', '/api/register', null, ({ body }) => {
  need(body, 'usn', 'name', 'email', 'department', 'year', 'password');
  const usn = String(body.usn).trim().toUpperCase(), email = String(body.email).trim().toLowerCase();
  if (!/^[0-9][A-Z]{2}\d{2}[A-Z]{2}\d{3}$/.test(usn)) throw new HttpError(400, 'Invalid USN format (example: 1EC23EC004).');
  if (!email.includes('@')) throw new HttpError(400, 'Enter a valid email.');
  if (String(body.password).length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');
  if (HM.search(usn) || q1('SELECT 1 FROM registrations WHERE usn=?', usn)) throw new HttpError(409, 'Duplicate USN: already registered or awaiting approval.');
  if (q1('SELECT 1 FROM students WHERE email=?', email) || q1('SELECT 1 FROM registrations WHERE email=?', email) || q1('SELECT 1 FROM faculty WHERE email=?', email)) throw new HttpError(409, 'This email is already in use.');
  run('INSERT INTO registrations(usn,name,email,department,year,password,created_at) VALUES(?,?,?,?,?,?,?)', usn, String(body.name).trim(), email, String(body.department).trim().toUpperCase(), +body.year || 1, hashPassword(String(body.password)), now());
  RQ.enqueue(usn); return { message: 'Registration submitted for HOD approval.' };
});
on('GET', '/api/registrations', ['HOD'], () => RQ.toArray().map(u => q1('SELECT usn,name,email,department,year,created_at FROM registrations WHERE usn=?', u)));
on('POST', '/api/registrations/:usn/approve', ['HOD'], ({ params }) => {
  const g = q1('SELECT * FROM registrations WHERE usn=?', params.usn); if (!g) throw new HttpError(404, 'Registration not found.');
  const r = run('INSERT INTO students(usn,name,department,year,email,password) VALUES(?,?,?,?,?,?)', g.usn, g.name, g.department, g.year, g.email, g.password);
  run('DELETE FROM registrations WHERE usn=?', g.usn); RQ.remove(g.usn);
  HM.insert(g.usn, { id: Number(r.lastInsertRowid), usn: g.usn, name: g.name, department: g.department, year: g.year, email: g.email }); return { ok: true };
});
on('POST', '/api/registrations/:usn/reject', ['HOD'], ({ params }) => { run('DELETE FROM registrations WHERE usn=?', params.usn); RQ.remove(params.usn); return { ok: true }; });

on('POST', '/api/requests', ['STUDENT'], ({ user, body }) => {
  need(body, 'type', 'description');
  if (!CATS.includes(body.type)) throw new HttpError(400, 'Invalid request category.'); const priority = AUTO_PRIORITY[body.type];
  const id = 'Q' + (q1("SELECT COALESCE(MAX(CAST(SUBSTR(request_id,2) AS INTEGER)),1000)+1 AS n FROM requests").n), t = now();
  run('INSERT INTO requests VALUES(?,?,?,?,?,?,?,?,?,?,?)', id, user.id, body.type, String(body.description).trim(), priority, 'SUBMITTED', null, 'FACULTY', null, t, t);
  run('INSERT INTO request_history(request_id,old_status,new_status,changed_by,timestamp,comment) VALUES(?,?,?,?,?,?)', id, null, 'SUBMITTED', 'student:' + user.usn, t, 'Request created');
  STK[id] = new Stack(q('SELECT * FROM request_history WHERE request_id=?', id)); const r = getReq(id); place(r);
  q("SELECT id FROM faculty WHERE role='HOD'").forEach(h => notify('HOD', h.id, `${NQ.size + PQ.h.length} requests are waiting for assignment.`, id));
  return { request_id: id, structure: r.priority === 'HIGH' ? 'PRIORITY_QUEUE' : 'QUEUE' };
});
on('GET', '/api/requests/mine', ['STUDENT'], ({ user }) => q(SEL + ' WHERE r.student_id=? ORDER BY r.created_at DESC', user.id));
on('GET', '/api/requests/assigned', ['FACULTY'], ({ user }) => q(SEL + ' WHERE r.assigned_faculty=? ORDER BY r.created_at DESC', user.id));
on('GET', '/api/requests', ['HOD'], ({ query }) => { // filters + Merge Sort
  let rows = q(SEL); for (const k of ['status', 'type', 'priority']) if (query[k]) rows = rows.filter(r => r[k === 'priority' ? 'priority' : k] === query[k]);
  const key = { priority: r => PRI[r.priority], date: r => r.created_at, status: r => SRANK[r.status], type: r => r.type }[query.sort || 'date'];
  if (!key) throw new HttpError(400, 'Invalid sort field.'); const dir = query.dir === 'asc' ? 1 : -1;
  return { algorithm: 'Merge Sort', complexity: 'O(n log n)', requests: mergeSort(rows, (a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * dir) };
});
on('GET', '/api/requests/:id', [], ({ user, params }) => { const d = detail(params.id);
  if (user.role === 'STUDENT' && d.student_id !== user.id) throw new HttpError(403, 'Not your request.');
  if (user.role === 'FACULTY' && d.assigned_faculty !== user.id) throw new HttpError(403, 'Not assigned to you.'); return d; });
on('POST', '/api/requests/:id/assign', ['HOD'], ({ user, params, body }) => {
  need(body, 'facultyId'); const r = getReq(params.id), f = q1("SELECT * FROM faculty WHERE id=? AND role='FACULTY' AND active=1", +body.facultyId);
  if (!f) throw new HttpError(404, 'Faculty not found or inactive.');
  change(r, 'ASSIGNED', 'hod:' + user.id, 'Assigned to ' + f.name); unplace(r.request_id);
  run("UPDATE requests SET assigned_faculty=?,escalation_level='FACULTY' WHERE request_id=?", f.id, r.request_id);
  notify('STUDENT', r.student_id, `Your request ${r.request_id} has been assigned to ${f.name}.`, r.request_id);
  notify('FACULTY', f.id, `New ${r.priority} priority request ${r.request_id} assigned to you.`, r.request_id); return { ok: true };
});
on('POST', '/api/requests/:id/priority', ['HOD'], ({ params, body }) => {
  const r = getReq(params.id); if (!PRI[body.priority]) throw new HttpError(400, 'Invalid priority.');
  if (r.status === 'SUBMITTED') unplace(r.request_id); run('UPDATE requests SET priority=?,updated_at=? WHERE request_id=?', body.priority, now(), r.request_id);
  if (r.status === 'SUBMITTED') place({ ...r, priority: body.priority }); return { ok: true };
});
on('POST', '/api/requests/:id/accept', ['FACULTY'], ({ user, params }) => { const r = getReq(params.id); facultyOnly(user, r); change(r, 'IN_PROGRESS', 'faculty:' + user.id, 'Accepted'); return { ok: true }; });
on('POST', '/api/requests/:id/hold', ['FACULTY'], ({ user, params, body }) => { const r = getReq(params.id); facultyOnly(user, r); change(r, 'PENDING', 'faculty:' + user.id, body.comment || 'On hold'); return { ok: true }; });
on('POST', '/api/requests/:id/resolve', ['FACULTY', 'HOD'], ({ user, params, body }) => {
  const r = getReq(params.id); facultyOnly(user, r); need(body, 'comment');
  if (user.role === 'FACULTY' && r.status !== 'IN_PROGRESS') throw new HttpError(409, 'Accept the request before resolving it.'); // the HOD may resolve directly
  unplace(r.request_id);
  change(r, 'RESOLVED', user.role.toLowerCase() + ':' + user.id, body.comment); run('UPDATE requests SET faculty_response=? WHERE request_id=?', body.comment, r.request_id); return { ok: true }; });
on('POST', '/api/requests/:id/reject', ['HOD'], ({ user, params, body }) => { const r = getReq(params.id); change(r, 'REJECTED', 'hod:' + user.id, body.comment || ''); unplace(r.request_id); return { ok: true }; });
on('POST', '/api/requests/:id/escalate', ['FACULTY', 'HOD'], ({ user, params }) => {
  const r = getReq(params.id); facultyOnly(user, r); if (user.role === 'FACULTY' && r.escalation_level !== 'FACULTY') throw new HttpError(403, 'Only the HOD can escalate further.');
  const p = G.path(r.escalation_level, 'PRINCIPAL'); if (!p || p.length < 2) throw new HttpError(409, 'Already at the highest authority.'); // BFS shortest path
  const next = p[1]; change(r, 'ESCALATED', user.role.toLowerCase() + ':' + user.id, 'Escalated to ' + next); unplace(r.request_id);
  run('UPDATE requests SET escalation_level=? WHERE request_id=?', next, r.request_id);
  q("SELECT id FROM faculty WHERE role='HOD'").forEach(h => notify('HOD', h.id, `Request ${r.request_id} escalated to ${next}.`, r.request_id));
  return { level: next, path: G.path('STUDENT', next) };
});
const FILE_OK = (mime, b) => (mime === 'application/pdf' && b.subarray(0, 4).toString() === '%PDF') || (mime === 'image/png' && b[0] === 0x89 && b[1] === 0x50) || (mime === 'image/jpeg' && b[0] === 0xff && b[1] === 0xd8);
on('POST', '/api/requests/:id/attachments', ['FACULTY', 'HOD'], ({ user, params, body }) => {
  const r = getReq(params.id); facultyOnly(user, r); need(body, 'filename', 'mime', 'data');
  const buf = Buffer.from(String(body.data), 'base64');
  if (!buf.length) throw new HttpError(400, 'Empty file.'); if (buf.length > 3 * 1024 * 1024) throw new HttpError(413, 'File too large (max 3 MB).');
  if (!['application/pdf', 'image/png', 'image/jpeg'].includes(body.mime) || !FILE_OK(body.mime, buf)) throw new HttpError(400, 'Only valid PDF, PNG or JPG files are allowed.');
  const name = String(body.filename).replace(/[^\w.\- ]/g, '_').slice(0, 80);
  run('INSERT INTO attachments(request_id,filename,mime,size,data,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?)', r.request_id, name, body.mime, buf.length, buf, user.role.toLowerCase() + ':' + user.id, now());
  notify('STUDENT', r.student_id, `A file was attached to your request ${r.request_id}.`, r.request_id); return { ok: true };
});
on('GET', '/api/attachments/:id', [], ({ user, params }) => {
  const a = q1('SELECT * FROM attachments WHERE id=?', +params.id); if (!a) throw new HttpError(404, 'File not found.');
  const r = getReq(a.request_id);
  if (user.role === 'STUDENT' && r.student_id !== user.id) throw new HttpError(403, 'Not your request.'); facultyOnly(user, r);
  return { __file: { mime: a.mime, name: a.filename, data: Buffer.from(a.data) } };
});
on('GET', '/api/search', ['HOD'], ({ query }) => { const term = (query.q || '').trim(); if (!term) throw new HttpError(400, 'Enter a search term.');
  const s = HM.search(term.toUpperCase()); // USN lookup via Hash Map: O(1) average
  if (s) return { method: 'HASH_MAP', student: s, requests: q(SEL + ' WHERE r.student_id=?', s.id) };
  const l = '%' + term.toLowerCase() + '%';
  return { method: 'LINEAR_SCAN', requests: q(SEL + ' WHERE LOWER(r.request_id) LIKE ? OR LOWER(s.name) LIKE ? OR LOWER(r.type) LIKE ? OR LOWER(r.status) LIKE ?', l, l, l, l) }; });
on('GET', '/api/students/:usn', ['HOD'], ({ params }) => { const s = HM.search(params.usn.toUpperCase()); if (!s) throw new HttpError(404, 'Student not found.'); return s; });
on('DELETE', '/api/students/:usn', ['HOD'], ({ params }) => { const s = HM.search(params.usn.toUpperCase()); if (!s) throw new HttpError(404, 'Student not found.');
  if (q1('SELECT 1 FROM requests WHERE student_id=?', s.id)) throw new HttpError(409, 'Cannot delete: student has requests.'); run('DELETE FROM students WHERE id=?', s.id); HM.delete(s.usn); return { ok: true }; });
on('GET', '/api/students', ['HOD'], () => q('SELECT id,usn,name,department,year,email FROM students'));
on('GET', '/api/faculty', ['HOD'], () => q("SELECT f.id,f.code,f.name,f.email,f.department,f.role,f.active,(SELECT COUNT(*) FROM requests r WHERE r.assigned_faculty=f.id AND r.status NOT IN ('RESOLVED','REJECTED')) AS open_requests FROM faculty f"));
on('POST', '/api/faculty', ['HOD'], ({ body }) => { need(body, 'name', 'email', 'department'); const email = String(body.email).trim().toLowerCase();
  if (!email.includes('@')) throw new HttpError(400, 'Enter a valid email.'); if (q1('SELECT 1 FROM faculty WHERE email=?', email) || q1('SELECT 1 FROM students WHERE email=?', email)) throw new HttpError(409, 'This email is already in use.');
  const n = q1("SELECT COUNT(*) AS c FROM faculty WHERE role='FACULTY'").c + 1, code = 'FAC' + String(n).padStart(3, '0'), pw = tempPw();
  run('INSERT INTO faculty(code,name,department,email,password,role) VALUES(?,?,?,?,?,?)', code, String(body.name).trim(), String(body.department).trim(), email, hashPassword(pw), 'FACULTY'); return { code, email, temporaryPassword: pw }; });
on('POST', '/api/faculty/:id/toggle', ['HOD'], ({ params }) => { const f = q1("SELECT * FROM faculty WHERE id=? AND role='FACULTY'", +params.id); if (!f) throw new HttpError(404, 'Faculty not found.');
  if (f.active) { const open = q1("SELECT COUNT(*) AS c FROM requests WHERE assigned_faculty=? AND status NOT IN ('RESOLVED','REJECTED')", f.id).c; if (open) throw new HttpError(409, `${f.name} still has ${open} open request(s). Reassign them first.`); }
  run('UPDATE faculty SET active=? WHERE id=?', f.active ? 0 : 1, f.id); return { active: !f.active }; });
on('POST', '/api/faculty/:id/reset', ['HOD'], ({ params }) => { const f = q1("SELECT * FROM faculty WHERE id=? AND role='FACULTY'", +params.id); if (!f) throw new HttpError(404, 'Faculty not found.');
  const pw = tempPw(); run('UPDATE faculty SET password=? WHERE id=?', hashPassword(pw), f.id); return { temporaryPassword: pw }; });
on('GET', '/api/dashboard', [], ({ user }) => {
  const c = (where, ...a) => q1('SELECT COUNT(*) AS c FROM requests ' + where, ...a).c;
  if (user.role === 'STUDENT') return { myRequests: c('WHERE student_id=?', user.id), pending: c("WHERE student_id=? AND status IN ('SUBMITTED','PENDING','ASSIGNED')", user.id), inProgress: c("WHERE student_id=? AND status='IN_PROGRESS'", user.id), resolved: c("WHERE student_id=? AND status='RESOLVED'", user.id) };
  if (user.role === 'FACULTY') return { assigned: c('WHERE assigned_faculty=?', user.id), pending: c("WHERE assigned_faculty=? AND status IN ('ASSIGNED','PENDING')", user.id), inProgress: c("WHERE assigned_faculty=? AND status='IN_PROGRESS'", user.id), resolved: c("WHERE assigned_faculty=? AND status='RESOLVED'", user.id), escalated: c("WHERE assigned_faculty=? AND status='ESCALATED'", user.id) };
  return { total: c(''), pending: c("WHERE status IN ('SUBMITTED','PENDING')"), urgent: c("WHERE priority='HIGH' AND status NOT IN ('RESOLVED','REJECTED')"), inProgress: c("WHERE status='IN_PROGRESS'"), resolved: c("WHERE status='RESOLVED'"), escalated: c("WHERE status='ESCALATED'"),
    waitingForAssignment: NQ.size + PQ.h.length, pendingRegistrations: RQ.size, byCategory: q('SELECT type, COUNT(*) AS count FROM requests GROUP BY type') };
});
on('GET', '/api/notifications', [], ({ user }) => q('SELECT * FROM notifications WHERE recipient_role=? AND recipient_id=? ORDER BY id DESC LIMIT 20', user.role === 'HOD' ? 'HOD' : user.role, user.id));
on('GET', '/api/dsa/state', ['HOD'], () => ({ queue: NQ.toArray(), priorityQueue: PQ.ordered(), heapArray: PQ.h.map(x => x.id), hashMapBuckets: HM.b.map(b => b.map(e => e.k)), graph: { bfs: G.bfs('STUDENT'), dfs: G.dfs('STUDENT') } }));

const dsaDir = path.normalize(path.join(path.dirname(fileURLToPath(import.meta.url)), '../dsa')) + path.sep;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../frontend/index.html');
async function handle(req, res) {
  const url = new URL(req.url, 'http://x'), send = (s, d) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); };
  try {
    if (req.method === 'GET' && url.pathname.startsWith('/dsa/')) { const f = path.normalize(path.join(dsaDir, url.pathname.slice(5))); if (!f.startsWith(dsaDir) || !f.endsWith('.js') || !fs.existsSync(f)) throw new HttpError(404, 'Not found.'); res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(fs.readFileSync(f)); }
    if (req.method === 'GET' && !url.pathname.startsWith('/api')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(fs.readFileSync(root)); }
    let body = {}; const chunks = []; let total = 0; for await (const c of req) { total += c.length; if (total > 6 * 1024 * 1024) throw new HttpError(413, 'Request too large.'); chunks.push(c); }
    if (chunks.length) { try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new HttpError(400, 'Invalid JSON body.'); } }
    for (const [m, re, roles, fn] of routes) {
      const mt = m === req.method && re.exec(url.pathname); if (!mt) continue;
      const token = (req.headers.authorization || '').replace('Bearer ', ''), user = sessions.search(token);
      if (roles && !user) throw new HttpError(401, 'Please log in.');
      if (roles && roles.length && !roles.includes(user.role)) throw new HttpError(403, 'You are not allowed to access this.');
      const out = await fn({ user, token, params: mt.groups || {}, body, query: Object.fromEntries(url.searchParams) });
      if (out && out.__file) { res.writeHead(200, { 'Content-Type': out.__file.mime, 'Content-Disposition': `attachment; filename="${out.__file.name}"` }); return res.end(out.__file.data); }
      return send(200, out);
    }
    throw new HttpError(404, 'Route not found.');
  } catch (e) { if (!(e instanceof HttpError)) console.error(e); send(e.status || 500, { error: e instanceof HttpError ? e.message : 'Database or server error.' }); }
}
export function start(port = 3000) { rebuild(); return new Promise(ok => { const s = http.createServer(handle).listen(port, () => ok(s)); }); }
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) start(process.env.PORT || 3000).then(s => console.log('Server running at http://localhost:' + s.address().port));
