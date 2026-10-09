/* ===== v1.1.5 PROCEDURAL QUESTION MEMORY =====
   - Remembers generated question signatures between games.
   - Creates new variants from templates before recycling old ones.
   - Keeps per-subject / per-level / per-category memory.
*/
function rnd(min,max){return Math.floor(Math.random()*(max-min+1))+min}
function pick(arr){return arr[Math.floor(Math.random()*arr.length)]}
function qsig(q){return `${q.q}||${q.a[q.ok]}`.toLowerCase().replace(/\s+/g," ").trim()}
function procRemember(scope,sig){
 const cap=500,arr=[...(save.procHistory[scope]||[])];arr.push(sig);save.procHistory[scope]=arr.slice(-cap)
}
function procSeen(scope,sig){return (save.procHistory[scope]||[]).includes(sig)}
function conceptRemember(scope,key){
 if(!key)return;
 const cap=180,arr=[...(save.conceptHistory[scope]||[])];arr.push(key);save.conceptHistory[scope]=arr.slice(-cap)
}
function conceptSeen(scope,key){return !!key&&(save.conceptHistory[scope]||[]).includes(key)}
function formatRemember(scope,fmt){
 if(!fmt)return;
 const arr=[...(save.formatHistory[scope]||[])];arr.push(fmt);save.formatHistory[scope]=arr.slice(-6)
}
function recentFormats(scope){return save.formatHistory[scope]||[]}
function chooseFormat(scope,allowed){
 const recent=recentFormats(scope).slice(-2);
 const fresh=allowed.filter(x=>!recent.includes(x));
 return pick(fresh.length?fresh:allowed)
}
function quietPersist(){try{if(storageOK)window.localStorage.setItem("triviaArenaPocketSave",JSON.stringify(save))}catch(e){storageOK=false}}
function uniqueOptions(correct,candidates,format=x=>String(x)){
 const c=format(correct),out=[c];
 for(const x of shuffle(candidates)){const s=format(x);if(!out.includes(s))out.push(s);if(out.length===4)break}
 let guard=0;
 while(out.length<4&&guard++<60){
  const s=format(typeof correct==="number"?correct+rnd(-8,8):pick(candidates));
  if(!out.includes(s))out.push(s)
 }
 const mixed=shuffle(out);return{a:mixed,ok:mixed.indexOf(c)}
}
function makeProc(scope,data){
 const q={id:`p:${Date.now().toString(36)}:${Math.random().toString(36).slice(2,9)}`,...data,procedural:true};
 const sig=qsig(q);q.procSig=sig;q.procScope=scope;
 if(!q.conceptKey)q.conceptKey=sig;
 if(!q.format)q.format="direct";
 return q
}
function generateUnique(scope,count,factory){
 const result=[],localSig=new Set(),localConcept=new Set();let attempts=0;
 while(result.length<count&&attempts<count*260){
  attempts++;
  const q=factory();if(!q)continue;
  const sig=qsig(q),concept=q.conceptKey||sig;
  if(localSig.has(sig)||localConcept.has(concept)||procSeen(scope,sig)||conceptSeen(scope,concept))continue;
  localSig.add(sig);localConcept.add(concept);procRemember(scope,sig);conceptRemember(scope,concept);formatRemember(scope,q.format);
  result.push(scrambleQuestion(q))
 }
 if(result.length<count){
  const ch=save.conceptHistory[scope]||[],ph=save.procHistory[scope]||[];
  save.conceptHistory[scope]=ch.slice(Math.floor(ch.length*.55));
  save.procHistory[scope]=ph.slice(Math.floor(ph.length*.65));
  attempts=0;
  while(result.length<count&&attempts<count*220){
   attempts++;
   const q=factory();if(!q)continue;
   const sig=qsig(q),concept=q.conceptKey||sig;
   if(localSig.has(sig)||localConcept.has(concept)||procSeen(scope,sig)||conceptSeen(scope,concept))continue;
   localSig.add(sig);localConcept.add(concept);procRemember(scope,sig);conceptRemember(scope,concept);formatRemember(scope,q.format);
   result.push(scrambleQuestion(q))
  }
 }
 return result
}
function numericDistractors(ans,spread=8){
 const s=new Set(),min=ans<0?-Infinity:0;let guard=0;
 while(s.size<10&&guard++<100){const v=ans+rnd(-spread,spread);if(v!==ans&&v>=min)s.add(v)}
 return [...s]
}

function drawGeneralDeck(pool,count,key){
 const ids=pool.map(q=>q.id),valid=new Set(ids),byId=Object.fromEntries(pool.map(q=>[q.id,q]));
 let st=save.generalDecks[key]||{remaining:[],recent:[],cycle:0};
 st.remaining=(st.remaining||[]).filter(id=>valid.has(id));st.recent=(st.recent||[]).filter(id=>valid.has(id));
 const out=[],used=new Set();let guard=0;
 while(out.length<count&&guard++<count*120){
  if(!st.remaining.length){
   const coolSize=Math.min(Math.max(30,Math.floor(pool.length*.82)),Math.max(0,pool.length-8));
   let blocked=new Set(st.recent.slice(-coolSize)),candidates=ids.filter(id=>!blocked.has(id));
   if(candidates.length<8){blocked=new Set(st.recent.slice(-Math.floor(pool.length*.60)));candidates=ids.filter(id=>!blocked.has(id))}
   if(!candidates.length)candidates=[...ids];
   st.remaining=shuffle(candidates);st.cycle=(st.cycle||0)+1
  }
  const id=st.remaining.pop();if(!id||used.has(id)||!byId[id])continue;
  used.add(id);out.push(scrambleQuestion(byId[id]));st.recent.push(id);
  st.recent=st.recent.slice(-Math.min(180,Math.max(60,Math.floor(pool.length*.88))))
 }
 save.generalDecks[key]=st;return out
}
