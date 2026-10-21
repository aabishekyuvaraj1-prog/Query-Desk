// PRIORITY QUEUE: binary MAX-HEAP stored in an array. Parent of i = (i-1)>>1, children 2i+1, 2i+2.
// Higher priority first; ties broken by smaller seq (earlier arrival).
const higher=(a,b)=>a.pri>b.pri||(a.pri===b.pri&&a.seq<b.seq);
export class PriorityQueue{
  constructor(){this.h=[]}
  insert(x){this.h.push(x);this.up(this.h.length-1)}            // O(log n)
  up(i){while(i>0){const p=(i-1)>>1;if(!higher(this.h[i],this.h[p]))break;[this.h[i],this.h[p]]=[this.h[p],this.h[i]];i=p}}
  down(i){const n=this.h.length;for(;;){let m=i,l=2*i+1,r=l+1;if(l<n&&higher(this.h[l],this.h[m]))m=l;if(r<n&&higher(this.h[r],this.h[m]))m=r;if(m===i)break;[this.h[i],this.h[m]]=[this.h[m],this.h[i]];i=m}}
  extractMax(){if(!this.h.length)return null;const top=this.h[0],last=this.h.pop();if(this.h.length){this.h[0]=last;this.down(0)}return top} // O(log n)
  peek(){return this.h[0]||null}
  isEmpty(){return !this.h.length}
  remove(id){const i=this.h.findIndex(x=>x.id===id);if(i<0)return false;const last=this.h.pop();if(i<this.h.length){this.h[i]=last;this.up(i);this.down(i)}return true}
  ordered(){const c=new PriorityQueue();c.h=[...this.h];const o=[];while(!c.isEmpty())o.push(c.extractMax());return o}
}
