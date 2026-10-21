// MERGE SORT: divide in halves, sort each, merge. Stable, O(n log n) time, O(n) extra space.
export function mergeSort(a,cmp){
  if(a.length<=1)return a;
  const mid=a.length>>1,L=mergeSort(a.slice(0,mid),cmp),R=mergeSort(a.slice(mid),cmp),out=[];
  let i=0,j=0;
  while(i<L.length&&j<R.length)out.push(cmp(L[i],R[j])<=0?L[i++]:R[j++]);
  while(i<L.length)out.push(L[i++]);while(j<R.length)out.push(R[j++]);
  return out;
}
