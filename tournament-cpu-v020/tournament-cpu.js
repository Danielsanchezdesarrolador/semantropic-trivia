'use strict';
// Isolated CPU tournament prototype. Not connected to production or persistent rewards.
const crypto = require('node:crypto');
const QUESTION_LIMIT_MS = 15000;
const RIVALS = Object.freeze([
 Object.freeze({id:'lira',name:'Lira',baseAccuracy:.55,minMs:7000,maxMs:11000,specialty:'Historia'}),
 Object.freeze({id:'bronn',name:'Bronn',baseAccuracy:.59,minMs:3000,maxMs:7000,specialty:'Deportes'}),
 Object.freeze({id:'nix',name:'Nix',baseAccuracy:.65,minMs:5000,maxMs:9000,specialty:'Geografía'}),
 Object.freeze({id:'vexa',name:'Vexa',baseAccuracy:.71,minMs:6000,maxMs:10000,specialty:'Tecnología'}),
 Object.freeze({id:'arkan',name:'Arkan',baseAccuracy:.77,minMs:7000,maxMs:11000,specialty:'Historia'}),
 Object.freeze({id:'kora',name:'Kora',baseAccuracy:.83,minMs:3000,maxMs:6000,specialty:'Naturaleza'}),
 Object.freeze({id:'magnus',name:'Magnus',baseAccuracy:.88,minMs:4000,maxMs:8000,specialty:'Ciencia'})
]);
function clamp(n,lo,hi){return Math.max(lo,Math.min(hi,n))}
function draw(secret,key){
 if(typeof secret!=='string'||secret.length<32)throw new Error('secret must be >=32 characters');
 const bytes=crypto.createHmac('sha256',secret).update(key,'utf8').digest();
 return bytes.readUIntBE(0,6)/281474976710656;
}
function points(correct,elapsedMs,limitMs=QUESTION_LIMIT_MS){
 if(!correct)return 0;
 if(!Number.isFinite(elapsedMs)||elapsedMs<0||elapsedMs>limitMs)throw new Error('invalid elapsedMs');
 return 100+Math.round(50*(limitMs-elapsedMs)/limitMs);
}
function simulateCpuAnswer({secret,runId,question,rivalId,limitMs=QUESTION_LIMIT_MS}){
 const rival=RIVALS.find(r=>r.id===rivalId);
 if(!rival)throw new Error('unknown rival');
 if(!runId||!question||!question.id||!Array.isArray(question.answers)||question.answers.length<2||!Number.isInteger(question.correct)||question.correct<0||question.correct>=question.answers.length)throw new Error('invalid question');
 if(!Number.isInteger(question.difficulty)||question.difficulty<1||question.difficulty>3)throw new Error('invalid difficulty');
 if(!Number.isFinite(limitMs)||limitMs<1000)throw new Error('invalid question limit');
 const key=String(runId)+':'+String(question.id)+':'+rival.id;
 const accuracy=clamp(rival.baseAccuracy-.075*(question.difficulty-2)+(rival.specialty===question.category?.045:0),.25,.95);
 const isCorrect=draw(secret,key+':accuracy')<accuracy;
 const minMs=clamp(rival.minMs+(question.difficulty-2)*300,1200,limitMs);
 const maxMs=clamp(rival.maxMs+(question.difficulty-2)*300,minMs,limitMs-50);
 const elapsedMs=Math.round(minMs+draw(secret,key+':response-time')*(maxMs-minMs));
 const incorrectOptions=question.answers.map((_,i)=>i).filter(i=>i!==question.correct);
 const selectedIndex=isCorrect?question.correct:incorrectOptions[Math.floor(draw(secret,key+':wrong-option')*incorrectOptions.length)];
 return Object.freeze({rivalId,questionId:String(question.id),selectedIndex,elapsedMs,correct:isCorrect,score:points(isCorrect,elapsedMs,limitMs)});
}
module.exports={RIVALS,QUESTION_LIMIT_MS,points,simulateCpuAnswer};
