import test from 'node:test';
import assert from 'node:assert/strict';
import { Queue } from '../Queue.js';
import { PriorityQueue } from '../PriorityQueue.js';
import { HashMap } from '../HashMap.js';
import { Stack } from '../Stack.js';
import { mergeSort } from '../Sorting.js';
import { Graph } from '../Graph.js';

test('Queue is FIFO and supports remove/peek/isEmpty', () => {
  const q = new Queue(); assert.ok(q.isEmpty());
  ['Q1', 'Q2', 'Q3'].forEach(x => q.enqueue(x));
  assert.equal(q.peek(), 'Q1'); assert.equal(q.dequeue(), 'Q1');
  assert.ok(q.remove('Q3')); assert.deepEqual(q.toArray(), ['Q2']);
  q.dequeue(); assert.equal(q.dequeue(), null); q.enqueue('Q9'); assert.equal(q.peek(), 'Q9');
});
test('PriorityQueue returns highest priority first, ties by arrival', () => {
  const pq = new PriorityQueue();
  [['Q5', 3, 5], ['Q2', 3, 2], ['Q7', 2, 7], ['Q3', 1, 3]].forEach(([id, pri, seq]) => pq.insert({ id, pri, seq }));
  assert.deepEqual(pq.ordered().map(x => x.id), ['Q2', 'Q5', 'Q7', 'Q3']);
  assert.ok(pq.remove('Q7')); assert.equal(pq.extractMax().id, 'Q2'); assert.equal(pq.extractMax().id, 'Q5');
  assert.equal(pq.extractMax().id, 'Q3'); assert.equal(pq.extractMax(), null);
});
test('PriorityQueue keeps heap order for many random inserts', () => {
  const pq = new PriorityQueue(); for (let i = 0; i < 200; i++) pq.insert({ id: 'x' + i, pri: 1 + (i * 7) % 3, seq: i });
  let prev = 4; while (!pq.isEmpty()) { const x = pq.extractMax(); assert.ok(x.pri <= prev); prev = x.pri; }
});
test('HashMap insert/search/delete/update and resize', () => {
  const m = new HashMap(2);
  for (let i = 0; i < 50; i++) m.insert('1EC23EC' + i, { name: 'S' + i });
  assert.equal(m.n, 50); assert.equal(m.search('1EC23EC7').name, 'S7');
  m.insert('1EC23EC7', { name: 'New' }); assert.equal(m.n, 50); assert.equal(m.search('1EC23EC7').name, 'New');
  assert.ok(m.delete('1EC23EC7')); assert.equal(m.search('1EC23EC7'), null); assert.equal(m.delete('nope'), false);
  assert.ok(m.b.length > 2);
});
test('Stack is LIFO', () => {
  const s = new Stack(); assert.ok(s.isEmpty());
  s.push('SUBMITTED'); s.push('ASSIGNED'); assert.equal(s.peek(), 'ASSIGNED');
  assert.equal(s.pop(), 'ASSIGNED'); assert.equal(s.pop(), 'SUBMITTED'); assert.equal(s.pop(), undefined);
});
test('mergeSort sorts, is stable and does not mutate input', () => {
  const a = [{ k: 3, n: 'a' }, { k: 1, n: 'b' }, { k: 3, n: 'c' }, { k: 2, n: 'd' }];
  const out = mergeSort(a, (x, y) => x.k - y.k);
  assert.deepEqual(out.map(x => x.n), ['b', 'd', 'a', 'c']); assert.equal(a[0].n, 'a');
  assert.deepEqual(mergeSort([], (x, y) => x - y), []);
});
test('Graph BFS, DFS and shortest path', () => {
  const g = new Graph(); g.addEdge('STUDENT', 'FACULTY'); g.addEdge('FACULTY', 'HOD'); g.addEdge('HOD', 'PRINCIPAL');
  assert.deepEqual(g.bfs('STUDENT'), ['STUDENT', 'FACULTY', 'HOD', 'PRINCIPAL']);
  assert.deepEqual(g.dfs('STUDENT'), ['STUDENT', 'FACULTY', 'HOD', 'PRINCIPAL']);
  assert.deepEqual(g.path('FACULTY', 'PRINCIPAL'), ['FACULTY', 'HOD', 'PRINCIPAL']);
  assert.equal(g.path('PRINCIPAL', 'STUDENT'), null);
});
