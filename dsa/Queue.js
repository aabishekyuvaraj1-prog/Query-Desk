// QUEUE: singly linked list, FIFO. enqueue/dequeue are O(1) via head+tail pointers.
class QNode{constructor(v){this.v=v;this.next=null}}
export class Queue{
  constructor(){this.head=null;this.tail=null;this.size=0}
  enqueue(v){const n=new QNode(v);if(this.tail)this.tail.next=n;else this.head=n;this.tail=n;this.size++}
  dequeue(){if(!this.head)return null;const v=this.head.v;this.head=this.head.next;if(!this.head)this.tail=null;this.size--;return v}
  peek(){return this.head?this.head.v:null}
  isEmpty(){return this.size===0}
  remove(v){let p=null,c=this.head;while(c){if(c.v===v){if(p)p.next=c.next;else this.head=c.next;if(c===this.tail)this.tail=p;this.size--;return true}p=c;c=c.next}return false}
  toArray(){const a=[];for(let c=this.head;c;c=c.next)a.push(c.v);return a}
  display(){return 'FRONT → '+(this.toArray().join(' → ')||'(empty)')+' → REAR'}
}
