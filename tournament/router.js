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
 const store=getStore();
 const projection=(s)=>publicState(s,clock());
 function track(doc,run){
  if(!run||run.phase!==FINISHED||run.recorded)return;
  run.recorded=true;
  const record=doc.record||(doc.record={bestRound:0,championships:0,plays:0});
  record.plays++;record.bestRound=Math.max(record.bestRound,run.matchIndex+1);
  if(run.finishReason==='CHAMPION')record.championships++;
 }
 function touch(run){return tick(run,clock())}
 return async(req,res,p)=>{
  if(!p.startsWith(PREFIX+'/'))return false;
  try{
   if(req.method!=='POST')fail(405,'METHOD_NOT_ALLOWED');
   const b=await readBody(req);
   if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'INVALID_REQUEST');
   const session=authenticate(String(b.token||''));
   if(!session)fail(401,'UNAUTHORIZED');
   const owner=session.playerId;
   let result;
   if(p===PREFIX+'/start'){
    requireId(b.requestId);
    if(Object.keys(b).some(k=>!['token','requestId'].includes(k)))fail(400,'UNEXPECTED_FIELD');
    result=await store.transaction(owner,doc=>{
     if(doc.starts[b.requestId])return {ok:true,state:projection(doc.runs[doc.starts[b.requestId]]),duplicate:true};
     if(Object.values(doc.runs).some(run=>run.phase!==FINISHED))fail(409,'TOURNAMENT_IN_PROGRESS');
     if(Object.keys(doc.runs).length>=60)fail(429,'RETENTION_LIMIT');
     const size=7*8;
     const chosen=crypto.randomInt(0,valid.length);
     const deck=[];
     for(let i=0;i<valid.length&&deck.length<size;i++)deck.push(valid[(chosen+i)%valid.length]);
     const id=crypto.randomUUID();
     const run=startTournament({runId:id,playerId:owner,questions:deck,secret,nowMs:clock()});
     doc.runs[id]=run;doc.starts[b.requestId]=id;
     return {ok:true,state:projection(run),duplicate:false};
    });
   }else if(p===PREFIX+'/records/me'){
    result=await store.transaction(owner,doc=>({ok:true,record:doc.record||{bestRound:0,championships:0,plays:0}}));
   }else{
    const m=p.match(/^\/api\/unity\/tournament\/v1\/([0-9a-f-]{36})\/(state|answer|advance|result)$/);
    if(!m)fail(404,'NOT_FOUND');
    result=await store.transaction(owner,doc=>{
     let run=doc.runs[m[1]];
     if(!run)fail(404,'TOURNAMENT_NOT_FOUND');
     run=touch(run);
     doc.runs[m[1]]=run;
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
     return {ok:true,state:projection(run)};
    });
   }
   json(res,200,result);
  }catch(e){json(res,e.status||503,{ok:false,code:e.status?e.message:'TOURNAMENT_UNAVAILABLE',retryable:!e.status||e.status>=500});}
  return true;
 };
}
module.exports={createRouter,PREFIX,RIVALS};
