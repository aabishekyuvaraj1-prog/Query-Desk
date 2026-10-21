// STACK: LIFO. Top of stack = latest status change.
export class Stack{
  constructor(items=[]){this.items=items}
  push(x){this.items.push(x)}
  pop(){return this.items.pop()}
  peek(){return this.items[this.items.length-1]}
  isEmpty(){return !this.items.length}
}
