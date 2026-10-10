'use strict';
const assert=require('node:assert/strict');
const {startTournament,answer,tick,advance,publicState,ACTIVE,LOCKED,RESOLVED,MATCH_RESULT,FINISHED}=require('./tournament-engine');
const secret='server-test-secret-for-cpu-simulation-not-for-prod';
function deck(){return Array.from({length:56},(_,i)=>({id:'g'+i,category:'Historia',difficulty:1,question:'Q '+i+'?',answers:['a','b','c','d'],correct:0}));}
function start(runId='run001',now=10000){return startTournament({runId,playerId:'player',questions:deck(),secret,nowMs:now});}
function go(s,selectedIndex,now,id='a'){return answer(s,{actionId:id,selectedIndex,questionId:publicState(s,now).question.id},now).state;}
function resolve(s,now){return tick(s,now+16000)}
function next(s,now,id){return advance(s,{actionId:id},now,{secret}).state;}
{
 let s=start();let pub=publicState(s,10000);assert.equal(pub.question.id,'g0');assert.equal('correct' in pub.question,false);assert.equal('selectedIndex' in pub.cpu,false);
 s=go(s,0,10001,'a');assert.equal(s.phase,LOCKED);
 assert.equal(publicState(s,10001).cpu.status,'THINKING');
 s=resolve(s,10002);assert.equal(s.phase,RESOLVED);assert.equal(publicState(s,30000).cpu.status,'REVEALED');assert.equal(publicState(s,30000).reveal.correctIndex,0);
 const dup=answer(s,{actionId:'a',selectedIndex:0,questionId:'g0'},10003);assert.equal(dup.duplicate,true);assert.equal(dup.state,s);
 assert.throws(()=>answer(s,{actionId:'a',selectedIndex:1,questionId:'g0'},10003),/Conflicting/);
 assert.throws(()=>answer(s,{actionId:'b',selectedIndex:1,questionId:'g0'},10003),/not accepting/);
 s=next(s,30000,'next1');assert.equal(s.phase,ACTIVE);assert.equal(s.questionIndex,1);
 assert.equal(advance(s,{actionId:'next1'},30000,{secret}).duplicate,true);
 assert.throws(()=>advance(s,{actionId:'next2'},30000,{secret}),/Cannot advance/);
}
{
 let s=start('timeout');
 assert.throws(()=>answer(s,{actionId:'a',selectedIndex:5,questionId:'g0'},10000),/Invalid answer/);
 assert.throws(()=>answer(s,{actionId:'a',selectedIndex:0,questionId:'wrong'},10000),/Wrong question/);
 assert.throws(()=>answer(s,{actionId:'a',selectedIndex:0,questionId:'g0'},9999),/Clock before/);
 s=tick(s,25000);assert.equal(s.phase,RESOLVED);assert.equal(s.playerAnswer.timedOut,true);
}
{
 let s=start('champion'),now=10000,answered=0;
 while(s.phase!==FINISHED&&answered<100){
  if(s.phase===ACTIVE){s=go(s,0,now+1,'answer'+answered);answered++;s=resolve(s,now+1);now+=16000;}
  else if(s.phase===RESOLVED||s.phase===MATCH_RESULT){s=next(s,now,'advance'+answered+'_'+s.phase);}
  else throw Error('Unexpected phase '+s.phase);
 }
 assert.equal(s.phase,FINISHED);assert.equal(s.finishReason,'CHAMPION');assert.equal(s.matches.length,7);assert.equal(s.matches.every(x=>x.result==='WIN'),true);assert.equal(answered,35);
 const p=publicState(s,now);assert.equal(p.question,null);assert.equal(p.finishReason,'CHAMPION');
}
{
 let s=start('loser'),now=10000,answered=0;
 while(s.phase!==FINISHED&&answered<30){
  if(s.phase===ACTIVE){s=go(s,1,now+1,'answer'+answered);answered++;s=resolve(s,now+1);now+=16000;}
  else if(s.phase===RESOLVED||s.phase===MATCH_RESULT)s=next(s,now,'advance'+answered+'_'+s.phase);
 }
 assert.equal(s.finishReason,'ELIMINATED');assert.equal(s.matches.length,1);
}
{
 let s=start('exact-tie'),now=10000,answered=0;
 while(s.phase!==FINISHED&&answered<20){
  if(s.phase===ACTIVE){
   const cpu=s.cpuOutcome;
   const option=cpu.correct?0:1;
   const at=s.questionStartedAt+cpu.elapsedMs;
   s=go(s,option,at,'tie-answer-'+answered);
   assert.equal(s.phase,RESOLVED);
   answered++;now=at+1;
  }else if(s.phase===RESOLVED){s=next(s,now,'tie-next-'+answered);}
  else throw Error('Unexpected phase in tie case: '+s.phase);
 }
 assert.equal(answered,8);assert.equal(s.finishReason,'TECHNICAL_DRAW');assert.equal(s.matches.length,1);assert.equal(s.matches[0].result,'DRAW');
}
{
 let s=start('recover'),now=10000;
 const before=JSON.stringify(publicState(s,now));
 s=JSON.parse(JSON.stringify(s));assert.equal(JSON.stringify(publicState(s,now)),before);
 s=go(s,0,10001,'recover-answer');assert.equal(s.phase,LOCKED);
 s=JSON.parse(JSON.stringify(s));s=tick(s,26000);assert.equal(s.phase,RESOLVED);
}
console.log('PASS tournament state machine: championship, elimination, retry/idempotency, timeout and validation');
