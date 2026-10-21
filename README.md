# Student Query & Request Management System (DSA Project)

## Problem statement
Students send departmental requests (bonafide, leave, lab issues...) on paper or by word of mouth, so requests are lost, urgent ones are not prioritised and nobody can see the status. This system lets students submit requests online and lets the HOD and faculty prioritise, assign, track, resolve and escalate them.

## Objectives
Digitise requests; process urgent requests first; give fast student lookup; keep a full status history; sort and search requests; model the escalation chain; and implement each core data structure for real.

## Features
Role-based login (Student / Faculty / HOD), student self-registration approved by the HOD, HOD-managed faculty accounts (create, deactivate, reset password), request submission with categories (priority is set automatically from the category and the HOD can change it), assignment and reassignment, accept/hold/resolve/reject/escalate, status history, search, sorting, filters, notifications, file attachments (PDF/PNG/JPG, uploaded by faculty or HOD, downloadable by the student) and dashboards.

## Technology stack
Node.js 22+ (built-in `http` and `node:sqlite`, **no npm install needed**), SQLite, plain HTML/CSS/JavaScript frontend, `node:test` for tests. Passwords are hashed with scrypt.

## System architecture
Browser -> REST API (`backend/server.js`) -> service logic -> SQLite (`database/app.db`, source of truth) + DSA structures in memory. On startup the structures are rebuilt from the database; every action updates both.

## How DSA is used in the project
| DSA | Application | File |
|---|---|---|
| Queue | Normal (MEDIUM/LOW) requests waiting for assignment; registration approvals | `dsa/Queue.js` |
| Priority Queue (max-heap) | Urgent (HIGH) requests | `dsa/PriorityQueue.js` |
| Hash Map | Student lookup by USN; login; session tokens | `dsa/HashMap.js` |
| Stack | Request status history (top = current status) | `dsa/Stack.js` |
| Merge Sort | Sorting requests by priority/date/status/type | `dsa/Sorting.js` |
| Graph + BFS/DFS | Escalation path Student -> Faculty -> HOD -> Principal | `dsa/Graph.js` |

## Explanation, algorithms and complexity
- **Queue** – linked list with head/tail pointers, FIFO. Enqueue O(1), Dequeue O(1), Peek O(1).
- **Priority Queue** – array-based binary max-heap; higher priority first, ties by earlier arrival. Insert O(log n), Extract-max O(log n), Peek O(1).
- **Hash Map** – bucket array, polynomial string hash, separate chaining, resizes when load factor > 0.75. Average search/insert/delete O(1), worst case O(n).
- **Stack** – push/pop/peek O(1).
- **Merge Sort** – divide into halves, sort, merge; stable. Time O(n log n), space O(n).
- **Graph** – adjacency list. BFS/DFS O(V + E). BFS with parent pointers gives the shortest escalation path.

## Database structure
`students`, `faculty` (role FACULTY/HOD, active flag), `requests` (FK to students and faculty), `request_history` (FK to requests), `notifications`, `registrations`, `attachments`. See `database/schema.sql`.

## Installation and running
1. Install Node.js **22.5 or newer**.
2. In this folder run: `npm start` (backend + database, created and seeded automatically on first run)
3. Open http://localhost:3000
4. Run tests: `npm test` (DSA unit tests + API workflow tests)

## Demo login credentials (password `pass123`)
HOD `hod@college.edu` · Faculty `kumar@college.edu`, `priya@college.edu` · Students `1EC23EC001`, `1EC23EC002`, `1EC23EC003` · Pending registration to approve: `1EC23EC004`.

## Example workflow
Student submits a Lab Issue (Queue) and a HIGH request (Priority Queue) -> HOD searches the USN (Hash Map), sorts (Merge Sort), assigns -> Faculty accepts (IN_PROGRESS) and resolves -> history shows on the Stack -> escalation shows the Graph path -> Student sees RESOLVED.

## API summary
Login `POST /api/login`; register `POST /api/register`; requests `POST/GET /api/requests`, `/mine`, `/assigned`, `/:id`, and `/:id/assign|accept|hold|resolve|reject|escalate|priority`; `GET /api/search?q=`; `GET /api/dsa/state`; faculty `GET/POST /api/faculty`; registrations `/api/registrations`; `GET /api/dashboard`, `/api/notifications`. Wrong role -> 403, no login -> 401.

## Current limitations
- The web page is served by the backend and uses the API for everything, so it must be opened through `npm start` (not by double-clicking the HTML file).
- No password change screen for users; sessions live in memory (restart = log in again).

## Future improvements
Connect the UI to the API, change-password screen, email notifications, charts, file attachments, React frontend.
