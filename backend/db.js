// SQLite database (Node's built-in node:sqlite) + password hashing (scrypt) + demo seed data.
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
export const db = new DatabaseSync(process.env.DB_PATH || path.join(dir, '../database/app.db'));
db.exec('PRAGMA foreign_keys=ON');
db.exec(fs.readFileSync(path.join(dir, '../database/schema.sql'), 'utf8'));
export const hashPassword = pw => { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex'); };
export const verifyPassword = (pw, stored) => { const [salt, h] = stored.split(':'); return crypto.timingSafeEqual(Buffer.from(h, 'hex'), crypto.scryptSync(pw, salt, 32)); };

if (!db.prepare('SELECT 1 FROM faculty').get()) {
  const pw = hashPassword('pass123'), ago = n => new Date(Date.now() - n * 864e5).toISOString();
  const S = ['1EC23EC001:Abishek', '1EC23EC002:Rahul', '1EC23EC003:Kiran'];
  S.forEach(x => { const [usn, name] = x.split(':'); db.prepare('INSERT INTO students(usn,name,department,year,email,password) VALUES(?,?,?,?,?,?)').run(usn, name, 'ECE', 1, usn.toLowerCase() + '@college.edu', pw); });
  [['FAC001', 'Mr. Kumar', 'kumar@college.edu', 'FACULTY'], ['FAC002', 'Ms. Priya', 'priya@college.edu', 'FACULTY'], ['HOD001', 'HOD', 'hod@college.edu', 'HOD']]
    .forEach(([c, n, e, r]) => db.prepare('INSERT INTO faculty(code,name,department,email,password,role) VALUES(?,?,?,?,?,?)').run(c, n, 'Electronics', e, pw, r));
  // student#, type, description, priority, status, faculty#, level, days ago
  const R = [[1, 'Lab Issue', 'Oscilloscope in Lab 2 is not working.', 'HIGH', 'IN_PROGRESS', 1, 'FACULTY', 6], [2, 'Bonafide Certificate', 'Need bonafide for bank loan.', 'LOW', 'SUBMITTED', null, 'FACULTY', 5],
    [3, 'Scholarship Issue', 'Scholarship amount not credited.', 'HIGH', 'SUBMITTED', null, 'FACULTY', 5], [1, 'Leave Request', 'Medical leave for 3 days.', 'MEDIUM', 'SUBMITTED', null, 'FACULTY', 4],
    [2, 'Academic Query', 'Clarify syllabus for Signals unit 3.', 'LOW', 'RESOLVED', 2, 'FACULTY', 8], [3, 'Lab Issue', 'Soldering station broken in Lab 1.', 'MEDIUM', 'ASSIGNED', 2, 'FACULTY', 3],
    [1, 'Scholarship Issue', 'Document verification pending.', 'HIGH', 'ESCALATED', 1, 'HOD', 3], [2, 'Other', 'Request for library card renewal.', 'LOW', 'SUBMITTED', null, 'FACULTY', 2],
    [3, 'Academic Query', 'Internal marks mismatch.', 'MEDIUM', 'PENDING', 2, 'FACULTY', 2], [1, 'Bonafide Certificate', 'Bonafide for passport.', 'HIGH', 'SUBMITTED', null, 'FACULTY', 1]];
  R.forEach(([sid, type, desc, pri, st, f, lvl, d], i) => {
    const id = 'Q' + (1001 + i), t = ago(d), flow = ['SUBMITTED'];
    if (st !== 'SUBMITTED') flow.push('ASSIGNED');
    if (['IN_PROGRESS', 'RESOLVED', 'ESCALATED'].includes(st)) flow.push('IN_PROGRESS');
    if (st === 'RESOLVED' || st === 'ESCALATED' || st === 'PENDING') flow.push(st);
    db.prepare('INSERT INTO requests VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id, sid, type, desc, pri, st, f, lvl, st === 'RESOLVED' ? 'Explained in class notes.' : null, t, t);
    flow.forEach((n, k) => db.prepare('INSERT INTO request_history(request_id,old_status,new_status,changed_by,timestamp,comment) VALUES(?,?,?,?,?,?)').run(id, k ? flow[k - 1] : null, n, k ? 'faculty' : 'student:' + sid, t, ''));
  });
  db.prepare('INSERT INTO registrations(usn,name,email,department,year,password,created_at) VALUES(?,?,?,?,?,?,?)').run('1EC23EC004', 'Sneha', '1ec23ec004@college.edu', 'ECE', 1, pw, ago(0));
}
