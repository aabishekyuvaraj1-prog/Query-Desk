import { Queue } from './Queue.js';
// GRAPH: directed, adjacency list. BFS uses our Queue; DFS is recursive. path() = BFS with parent pointers.
export class Graph{
  constructor(){this.adj=new Map()}
  addVertex(v){if(!this.adj.has(v))this.adj.set(v,[])}
  addEdge(a,b){this.addVertex(a);this.addVertex(b);this.adj.get(a).push(b)}
  bfs(s){const seen=new Set([s]),q=new Queue(),o=[];q.enqueue(s);while(!q.isEmpty()){const v=q.dequeue();o.push(v);for(const n of this.adj.get(v))if(!seen.has(n)){seen.add(n);q.enqueue(n)}}return o}
  dfs(s,seen=new Set(),o=[]){seen.add(s);o.push(s);for(const n of this.adj.get(s))if(!seen.has(n))this.dfs(n,seen,o);return o}
  path(s,t){const par={[s]:null},q=new Queue();q.enqueue(s);while(!q.isEmpty()){const v=q.dequeue();if(v===t)break;for(const n of this.adj.get(v))if(!(n in par)){par[n]=v;q.enqueue(n)}}if(!(t in par))return null;const p=[];for(let c=t;c!==null;c=par[c])p.unshift(c);return p}
}
