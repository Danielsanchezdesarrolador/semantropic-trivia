'use strict';
const assert=require('node:assert/strict');
process.env.TOURNAMENT020_SECRET='test-only-tournament-hmac-secret-1234567890';
const {createRouter,PREFIX}=require('./router');
const {RESOLVED,FINISHED}=require('./engine');
const bank=Array.from({length:120},(_,i)=>({id:'g'+i,question:'Pregunta '+i,answers:['A','B','C','D'],correct:0,difficulty:1+(i%3),category:'Historia'}));
let now=1000000;
class MemoryStore{
 constructor(){this.docs=new Map();this.queues=new Map();}
 transaction(id,operation){
  const prior=this.queues.get(id)||Promise.resolve();
  const task=prior.then(async()=>{
   const doc=this.docs.get(id)||{runs:{},starts:{},record:{bestRound:0,championships:0,plays:0}};
   const result=await operation(doc);this.docs.set(id,doc);return result;
  });
  this.queues.set(id,task.catch(()=>{}));return task;
 }
}
const store=new MemoryStore();
const route=createRouter({
 getStore:()=>store,questions:bank,clock:()=>now,
 authenticate:token=>token==='one'?{playerId:'player1'}:token==='two'?{playerId:'player2'}:null,
 readBody:async r=>r.body,
 json:(r,status,data)=>{r.status=status;r.data=data;}
});
async function post(path,data){const res={};assert.equal(await route({method:'POST',body:data},res,path),true);return res;}
async function test(){
 let checks=0;
 const a=await post(PREFIX+'/start',{token:'one',requestId:'test-request-001'});
 assert.equal(a.status,200);checks++;
 const id=a.data.state.runId;
 assert.equal('correct' in a.data.state.question,false);checks++;
 assert.equal(a.data.state.cpu.status,'THINKING');checks++;
 const dupe=await post(PREFIX+'/start',{token:'one',requestId:'test-request-001'});
 assert.equal(dupe.data.duplicate,true);assert.equal(dupe.data.state.runId,id);checks++;
 const resumed=await post(PREFIX+'/start',{token:'one',requestId:'test-request-002'});
 assert.equal(resumed.data.resumed,true);assert.equal(resumed.data.state.runId,id);checks++;
 const other=await post(PREFIX+'/'+id+'/state',{token:'two'});
 assert.equal(other.status,404);checks++;
 const invalid=await post(PREFIX+'/'+id+'/answer',{token:'one',actionId:'invalid-answer-001',questionId:a.data.state.question.id,selectedIndex:999});
 assert.equal(invalid.status,400);checks++;
 const query={token:'one',actionId:'answer-001',questionId:a.data.state.question.id,selectedIndex:0};
 const answer=await post(PREFIX+'/'+id+'/answer',query);
 assert.equal(answer.status,200);checks++;
 const repeated=await post(PREFIX+'/'+id+'/answer',query);
 assert.equal(repeated.data.duplicate,true);checks++;
 now+=16000;
 const resolved=await post(PREFIX+'/'+id+'/state',{token:'one'});
 assert.equal(resolved.data.state.phase,RESOLVED);checks++;
 const advanced=await post(PREFIX+'/'+id+'/advance',{token:'one',actionId:'advance-001'});
 assert.equal(advanced.status,200);assert.equal(advanced.data.state.questionNumber,2);checks++;
 const abandon=await post(PREFIX+'/'+id+'/abandon',{token:'one',actionId:'abandon-001'});
 assert.equal(abandon.data.state.phase,FINISHED);assert.equal(abandon.data.state.finishReason,'ABANDONED');checks++;
 const records=await post(PREFIX+'/records/me',{token:'one'});
 assert.equal(records.data.record.plays,1);checks++;
 const second=await post(PREFIX+'/start',{token:'two',requestId:'another-request-001'});
 assert.equal(second.status,200);checks++;
 const fresh=await post(PREFIX+'/start',{token:'one',requestId:'fresh-request-001'});
 assert.equal(fresh.status,200);assert.notEqual(fresh.data.state.runId,id);checks++;
 const restored=await post(PREFIX+'/'+fresh.data.state.runId+'/state',{token:'one'});
 assert.equal(restored.status,200);checks++;
 now+=75*60*1000+100;
 const afterExpiry=await post(PREFIX+'/start',{token:'one',requestId:'expiry-request-001'});
 assert.equal(afterExpiry.status,200);assert.notEqual(afterExpiry.data.state.runId,fresh.data.state.runId);checks++;
 const finalRecord=await post(PREFIX+'/records/me',{token:'one'});
 assert.equal(finalRecord.data.record.plays,2);checks++;
 console.log('PASS: tournament isolated HTTP router '+checks+' checks');
}
test().catch(err=>{console.error(err);process.exitCode=1;});
