'use strict';
// Pure state machine prototype: persistence/authorization/API are deliberately OUT OF SCOPE.
// Do not expose the internal run state to players. Only publicState() can be serialized.
const {RIVALS, QUESTION_LIMIT_MS, points, simulateCpuAnswer}=require('./cpu');
const MATCH_QUESTIONS=5;
const MAX_TIE_BREAKERS=3;
const FINISHED='TOURNAMENT_FINISHED';
const ACTIVE='QUESTION_ACTIVE';
const LOCKED='PLAYER_LOCKED';
const RESOLVED='QUESTION_RESOLVED';
const MATCH_RESULT='MATCH_RESULT';

function requireClock(ms){if(!Number.isSafeInteger(ms)||ms<0)throw new Error('Invalid server clock');}
function assertQuestion(q){
 if(!q||typeof q.id!=='string'||!q.id||typeof q.question!=='string'||!Array.isArray(q.answers)||q.answers.length<2||!q.answers.every(x=>typeof x==='string')||!Number.isInteger(q.correct)||q.correct<0||q.correct>=q.answers.length||!Number.isInteger(q.difficulty)||q.difficulty<1||q.difficulty>3)throw new Error('Invalid question object');
}
function clone(s){return structuredClone(s)}
function questionFor(state,index){return state.deck[state.matchIndex*(state.questionsPerMatch+state.maxTieBreakers)+index]}
function getCurrent(s){return questionFor(s,s.questionIndex)}
function startTournament({runId,playerId,questions,secret,nowMs,questionsPerMatch=MATCH_QUESTIONS,maxTieBreakers=MAX_TIE_BREAKERS}){
 requireClock(nowMs);
 if(typeof runId!=='string'||!runId||typeof playerId!=='string'||!playerId)throw new Error('Invalid identity');
 if(!Number.isInteger(questionsPerMatch)||questionsPerMatch<1||questionsPerMatch>10||!Number.isInteger(maxTieBreakers)||maxTieBreakers<1||maxTieBreakers>5)throw new Error('Invalid rules');
 if(!Array.isArray(questions)||questions.length<RIVALS.length*(questionsPerMatch+maxTieBreakers))throw new Error('Insufficient question deck');
 if(typeof secret!=='string'||secret.length<32)throw new Error('Invalid server secret');
 const deck=questions.slice(0,RIVALS.length*(questionsPerMatch+maxTieBreakers));
 const used=new Set();
 for(const q of deck){assertQuestion(q);if(used.has(q.id))throw new Error('Duplicate question ID');used.add(q.id)}
 const s={version:1,runId,playerId,phase:ACTIVE,matchIndex:0,questionIndex:0,questionsPerMatch,maxTieBreakers,questionDurationMs:QUESTION_LIMIT_MS,
  deck,startedAt:nowMs,questionStartedAt:nowMs,deadlineAt:nowMs+QUESTION_LIMIT_MS,
  playerAnswer:null,cpuOutcome:null,score:{player:0,cpu:0},correct:{player:0,cpu:0},correctResponseMs:{player:0,cpu:0},
  matches:[],finishedAt:null,finishReason:null,actions:{}};
 s.cpuOutcome=computeCpu(s,secret);
 return s;
}
function computeCpu(s,secret){return simulateCpuAnswer({secret,runId:s.runId,question:getCurrent(s),rivalId:RIVALS[s.matchIndex].id,limitMs:s.questionDurationMs})}
function ensureFuture(s,nowMs){requireClock(nowMs);if(nowMs<s.questionStartedAt)throw new Error('Clock before question start')}
function receipt(s){return {runId:s.runId,phase:s.phase,match:s.matchIndex+1,question:s.questionIndex+1,matchResult:s.matches.at(-1)??null,finishReason:s.finishReason};}
function applyOnce(s,actionId,kind,payload,fn){
 if(typeof actionId!=='string'||actionId.length<1||actionId.length>100)throw new Error('Invalid actionId');
 const fp=JSON.stringify({kind,payload});const old=s.actions[actionId];
 if(old){if(old.fingerprint!==fp)throw new Error('Conflicting idempotency key');return {state:s,receipt:old.receipt,duplicate:true};}
 const next=fn(clone(s));
 const rec=receipt(next);next.actions[actionId]={fingerprint:fp,receipt:rec};
 return {state:next,receipt:rec,duplicate:false};
}
function answer(s,{actionId,selectedIndex,questionId},nowMs){
 ensureFuture(s,nowMs);
 return applyOnce(s,actionId,'answer',{selectedIndex,questionId},next=>{
  if(next.phase!==ACTIVE)throw new Error('Question not accepting answers');
  const q=getCurrent(next);
  if(questionId!==q.id)throw new Error('Wrong question ID');
  if(!Number.isInteger(selectedIndex)||selectedIndex<0||selectedIndex>=q.answers.length)throw new Error('Invalid answer');
  if(nowMs>=next.deadlineAt){
   next.playerAnswer={selectedIndex:null,correct:false,elapsedMs:next.questionDurationMs,score:0,timedOut:true};
  }else{
   const elapsedMs=nowMs-next.questionStartedAt;const correct=selectedIndex===q.correct;
   next.playerAnswer={selectedIndex,correct,elapsedMs,score:points(correct,elapsedMs,next.questionDurationMs),timedOut:false};
  }
  next.phase=LOCKED;
  return tick(next,nowMs);
 });
}
function tick(s,nowMs){
 ensureFuture(s,nowMs);
 if(s.phase!==ACTIVE&&s.phase!==LOCKED)return s;
 const next=clone(s);
 if(next.phase===ACTIVE&&nowMs>=next.deadlineAt){
  next.playerAnswer={selectedIndex:null,correct:false,elapsedMs:next.questionDurationMs,score:0,timedOut:true};
  next.phase=LOCKED;
 }
 if(next.phase===LOCKED&&nowMs>=next.questionStartedAt+next.cpuOutcome.elapsedMs){
  resolveQuestion(next);
 }
 return next;
}
function resolveQuestion(s){
 const p=s.playerAnswer,c=s.cpuOutcome;
 if(!p)throw new Error('Missing player answer');
 s.score.player+=p.score;s.score.cpu+=c.score;
 if(p.correct){s.correct.player++;s.correctResponseMs.player+=p.elapsedMs}
 if(c.correct){s.correct.cpu++;s.correctResponseMs.cpu+=c.elapsedMs}
 s.phase=RESOLVED;
 return s;
}
function finishMatch(s,nowMs){
 const scores=s.score;
 let verdict=scores.player>scores.cpu?'WIN':scores.player<scores.cpu?'LOSS':null;
 if(!verdict&&s.questionIndex>=s.questionsPerMatch+s.maxTieBreakers-1){
  if(s.correct.player>s.correct.cpu)verdict='WIN';
  else if(s.correct.player<s.correct.cpu)verdict='LOSS';
  else if(s.correctResponseMs.player<s.correctResponseMs.cpu)verdict='WIN';
  else if(s.correctResponseMs.player>s.correctResponseMs.cpu)verdict='LOSS';
  else verdict='DRAW';
 }
 if(!verdict){
  s.questionIndex++;
  openQuestion(s,nowMs);
  return;
 }
 s.matches.push({match:s.matchIndex+1,rivalId:RIVALS[s.matchIndex].id,result:verdict,playerScore:scores.player,cpuScore:scores.cpu});
 if(verdict==='WIN'&&s.matchIndex<RIVALS.length-1){s.phase=MATCH_RESULT;return;}
 s.phase=FINISHED;s.finishReason=verdict==='WIN'?'CHAMPION':verdict==='LOSS'?'ELIMINATED':'TECHNICAL_DRAW';s.finishedAt=nowMs;
}
function openQuestion(s,nowMs){
 // Caller owns advancing and must inject the server-only CPU secret. This is intentionally not stored in state.
 s.phase='NEEDS_CPU_OUTCOME';s.questionStartedAt=nowMs;s.deadlineAt=nowMs+s.questionDurationMs;
 s.playerAnswer=null;s.cpuOutcome=null;
}
function advance(s,{actionId},nowMs,{secret}={}){
 ensureFuture(s,nowMs);
 return applyOnce(s,actionId,'advance',{},next=>{
  if(next.phase!==RESOLVED&&next.phase!==MATCH_RESULT)throw new Error('Cannot advance');
  if(next.phase===MATCH_RESULT){
   next.matchIndex++;next.questionIndex=0;next.score={player:0,cpu:0};next.correct={player:0,cpu:0};next.correctResponseMs={player:0,cpu:0};
   openQuestion(next,nowMs);
  }else if(next.questionIndex+1<next.questionsPerMatch){
   next.questionIndex++;openQuestion(next,nowMs);
  }else if(next.score.player===next.score.cpu&&next.questionIndex+1<next.questionsPerMatch+next.maxTieBreakers){
   next.questionIndex++;openQuestion(next,nowMs);
  }else{
   finishMatch(next,nowMs);
  }
  if(next.phase==='NEEDS_CPU_OUTCOME'){
   if(typeof secret!=='string'||secret.length<32)throw new Error('Missing server-only secret');
   next.cpuOutcome=computeCpu(next,secret);next.phase=ACTIVE;
  }
  return next;
 });
}
function publicState(s,nowMs){
 requireClock(nowMs);
 const active=[ACTIVE,LOCKED,RESOLVED].includes(s.phase);
 const q=active?getCurrent(s):null;
 const revealed=s.phase===RESOLVED;
 const cpuPublic=active?
  (revealed?{status:'REVEALED',selectedIndex:s.cpuOutcome.selectedIndex,correct:s.cpuOutcome.correct,elapsedMs:s.cpuOutcome.elapsedMs,score:s.cpuOutcome.score}:
   nowMs>=s.questionStartedAt+s.cpuOutcome.elapsedMs?{status:'ANSWERED'}:{status:'THINKING'}):null;
 return {
  runId:s.runId,phase:s.phase,match:s.matchIndex+1,totalMatches:RIVALS.length,
  rival:RIVALS[s.matchIndex]?{id:RIVALS[s.matchIndex].id,name:RIVALS[s.matchIndex].name}:null,
  questionNumber:s.questionIndex+1,questionsPerMatch:s.questionsPerMatch,
  question:q?{id:q.id,category:q.category,difficulty:q.difficulty,text:q.question,answers:[...q.answers]}:null,
  deadlineAt:active?s.deadlineAt:null,
  player:active?(s.playerAnswer?{status:'ANSWERED',selectedIndex:s.playerAnswer.selectedIndex,timedOut:s.playerAnswer.timedOut}: {status:'WAITING'}):null,
  cpu:cpuPublic,
  reveal:revealed?{correctIndex:q.correct,playerCorrect:s.playerAnswer.correct,playerScore:s.playerAnswer.score}:null,
  scoreboard:{...s.score},matches:s.matches.map(x=>({...x})),finishReason:s.finishReason
 };
}
module.exports={startTournament,answer,tick,advance,publicState,RIVALS,ACTIVE,LOCKED,RESOLVED,MATCH_RESULT,FINISHED};
