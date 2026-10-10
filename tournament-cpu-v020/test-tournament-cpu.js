'use strict';
const assert=require('node:assert/strict');
const {RIVALS,QUESTION_LIMIT_MS,points,simulateCpuAnswer}=require('./tournament-cpu');
const secret='server-only-example-secret-keep-out-of-client-abcdef123456';
const sample={id:'g0',category:'Historia',difficulty:1,answers:['a','b','c','d'],correct:2};
assert.equal(RIVALS.length,7);
assert.equal(points(true,0),150);
assert.equal(points(true,QUESTION_LIMIT_MS),100);
assert.equal(points(false,5000),0);
assert.throws(()=>points(true,-1));
assert.throws(()=>simulateCpuAnswer({secret:'weak',runId:'1',question:sample,rivalId:'lira'}));
assert.throws(()=>simulateCpuAnswer({secret,runId:'1',question:sample,rivalId:'unknown'}));
let count=0;
for(const rival of RIVALS){
 for(let difficulty=1;difficulty<=3;difficulty++){
  for(let i=0;i<200;i++){
   const q={...sample,id:'g'+i+'-'+difficulty,difficulty};
   const args={secret,runId:'run-1',question:q,rivalId:rival.id};
   const a=simulateCpuAnswer(args);
   assert.deepEqual(a,simulateCpuAnswer(args));
   assert.ok(a.selectedIndex>=0&&a.selectedIndex<4);
   assert.equal(a.correct,a.selectedIndex===q.correct);
   assert.ok(a.elapsedMs>=1200&&a.elapsedMs<=15000);
   assert.equal(a.score,points(a.correct,a.elapsedMs));
   count++;
  }
 }
}
console.log('PASS: '+count+' deterministic CPU answer simulations + validation tests');
