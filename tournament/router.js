'use strict';
// Server-only tournament transport. Must be enabled explicitly in a development backend.
const crypto=require('node:crypto');
const {startTournament,answer,tick,advance,publicState,FINISHED}=require('./engine');
const {RIVALS}=require('./cpu');
const PREFIX='/api/unity/tournament/v1';
const SECRET_ENV='TOURNAMENT020_SECRET';
function fail(status,code){const e=new Error(code);e.status=status;throw e;}
function requireId(x){if(typeof x!=='string'||!/^[a-zA-Z0-9_-]{12,100}$/.test(x))fail(400,'INVALID_ID');}
function createRouter({getStore,authenticate,readBody,json,questions,clock=Date.now}){
 if(!Array.isArray(questions))throw Error('Tournament requires a question bank');
 const secret=process.env[SECRET_ENV];
 if(typeof secret!=='string'||secret.length<32)throw Error('Missing server-only TOURNAMENT020_SECRET');
 const valid=questions.filter(q=>typeof q.id==='string'&&typeof q.question==='string'&&Array.isArray(q.answers)&&q.answers.length>=2&&Number.isInteger(q.correct)&&q.correct>=0&&q.correct<q.answers.length&&[1,2,3].includes(q.difficulty));
 if(valid.length<56)throw Error('Insufficient validated tournament questions');
 const projection=(s)=>publicState(s,clock());
 const MAX_RUN_AGE_MS=75*60*1000;
 const makeDeck=()=>{const list=[...valid];for(let i=list.length-1;i>0;i--){const j=crypto.randomInt(i+1);[list[i],list[j]]=[list[j],list[i]];}return list.slice(0,56);};
 function track(doc,run){
  if(!run||run.phase!==FINISHED||run.recorded)return;
  run.recorded=true;
  const record=doc.record||(doc.record={bestRound:0,championships:0,plays:0});
  record.plays++;record.bestRound=Math.max(record.bestRound,run.matchIndex+1);
  if(run.finishReason==='CHAMPION')record.championships++;
 }
 function touch(run){
  const now=clock();
  if(run.phase!==FINISHED && now>=run.startedAt+MAX_RUN_AGE_MS){
   const out=structuredClone(run);out.phase=FINISHED;out.finishReason='EXPIRED';out.finishedAt=now;return out;
  }
  return tick(run,now);
 }
 return async(req,res,p)=>{
  if(!p.startsWith(PREFIX+'/'))return false;
  try{
   if(req.method!=='POST')fail(405,'METHOD_NOT_ALLOWED');
   const b=await readBody(req);
   if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'INVALID_REQUEST');
   const session=authenticate(String(b.token||''));
   if(!session)fail(401,'UNAUTHORIZED');
   const owner=session.playerId;
   if(!owner)fail(401,'UNAUTHORIZED');
   const store=getStore(); // Lazily acquire storage only after backend initialization.
   let result;
   if(p===PREFIX+'/start'){
    requireId(b.requestId);
    if(Object.keys(b).some(k=>!['token','requestId'].includes(k)))fail(400,'UNEXPECTED_FIELD');
    result=await store.transaction(owner,doc=>{
     if(doc.starts[b.requestId]){
      const originalId=doc.starts[b.requestId];const prior=touch(doc.runs[originalId]);doc.runs[originalId]=prior;track(doc,prior);
      return {ok:true,state:projection(prior),duplicate:true};
     }
     for(const [id,existing] of Object.entries(doc.runs)){
      const active=touch(existing);doc.runs[id]=active;track(doc,active);
      if(active.phase!==FINISHED)return {ok:true,state:projection(active),resumed:true};
     }
     if(Object.keys(doc.runs).length>=60)fail(429,'RETENTION_LIMIT');
     const deck=makeDeck();
     const id=crypto.randomUUID();
     const run=startTournament({runId:id,playerId:owner,questions:deck,secret,nowMs:clock()});
     doc.runs[id]=run;doc.starts[b.requestId]=id;
     return {ok:true,state:projection(run),duplicate:false};
    });
   }else if(p===PREFIX+'/records/me'){
    result=await store.transaction(owner,doc=>({ok:true,record:doc.record||{bestRound:0,championships:0,plays:0}}));
   }else{
    const m=p.match(/^\/api\/unity\/tournament\/v1\/([0-9a-f-]{36})\/(state|answer|advance|result|abandon)$/);
    if(!m)fail(404,'NOT_FOUND');
    result=await store.transaction(owner,doc=>{
     let run=doc.runs[m[1]];
     if(!run)fail(404,'TOURNAMENT_NOT_FOUND');
     run=touch(run);
     doc.runs[m[1]]=run;
     if(m[2]==='abandon'){
      requireId(b.actionId);
      if(Object.keys(b).some(k=>!['token','actionId'].includes(k)))fail(400,'UNEXPECTED_FIELD');
      if(run.phase===FINISHED)return {ok:true,state:projection(run),duplicate:true};
      run=structuredClone(run);run.phase=FINISHED;run.finishReason='ABANDONED';run.finishedAt=clock();
      doc.runs[m[1]]=run;track(doc,run);
      return {ok:true,state:projection(run),duplicate:false};
     }
     if(m[2]==='answer'){
      requireId(b.actionId);
      if(Object.keys(b).some(k=>!['token','actionId','questionId','selectedIndex'].includes(k)))fail(400,'UNEXPECTED_FIELD');
      const out=answer(run,{actionId:b.actionId,questionId:b.questionId,selectedIndex:b.selectedIndex},clock());
      run=out.state;doc.runs[m[1]]=run;track(doc,run);
      return {ok:true,state:projection(run),duplicate:out.duplicate};
     }
     if(m[2]==='advance'){
      requireId(b.actionId);
      if(Object.keys(b).some(k=>!['token','actionId'].includes(k)))fail(400,'UNEXPECTED_FIELD');
      const out=advance(run,{actionId:b.actionId},clock(),{secret});
      run=out.state;doc.runs[m[1]]=run;track(doc,run);
      return {ok:true,state:projection(run),duplicate:out.duplicate};
     }
     track(doc,run);
     return {ok:true,state:projection(run),verified:run.phase===FINISHED};
    });
   }
   json(res,200,result);
  }catch(e){json(res,e.status||503,{ok:false,code:e.status?e.message:'TOURNAMENT_UNAVAILABLE',retryable:!e.status||e.status>=500});}
  return true;
 };
}
module.exports={createRouter,PREFIX,RIVALS};
