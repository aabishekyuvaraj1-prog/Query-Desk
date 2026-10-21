// HASH MAP: array of buckets, separate chaining, polynomial string hash, doubles when load factor > 0.75.
export class HashMap{
  constructor(cap=8){this.b=Array.from({length:cap},()=>[]);this.n=0}
  hash(k){let h=0;for(const ch of k)h=(h*31+ch.charCodeAt(0))%this.b.length;return h}
  insert(k,v){const bucket=this.b[this.hash(k)];for(const e of bucket)if(e.k===k){e.v=v;return}bucket.push({k,v});this.n++;if(this.n/this.b.length>0.75)this.grow()}
  grow(){const old=this.b.flat();this.b=Array.from({length:this.b.length*2},()=>[]);this.n=0;old.forEach(e=>this.insert(e.k,e.v))}
  search(k){const e=this.b[this.hash(k)].find(e=>e.k===k);return e?e.v:null}   // avg O(1), worst O(n)
  delete(k){const bucket=this.b[this.hash(k)],i=bucket.findIndex(e=>e.k===k);if(i<0)return false;bucket.splice(i,1);this.n--;return true}
}
