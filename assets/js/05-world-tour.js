/* ===== ALPHA 0.4.0 — WORLD TOUR CORE ===== */
function worldBlankState(){return{selected:"chile",planeAt:"chile",countries:{},continentsClaimed:[],passportClaimed:[],questionDecks:{},eventWeek:"",eventCountry:"",eventClaimed:false}}
function ensureWorldTourState(target=save){target.worldTour={...worldBlankState(),...(target.worldTour||{})};target.worldTour.countries={...(target.worldTour.countries||{})};target.worldTour.continentsClaimed=[...new Set(target.worldTour.continentsClaimed||[])];target.worldTour.passportClaimed=[...new Set(target.worldTour.passportClaimed||[])];target.worldTour.questionDecks={...(target.worldTour.questionDecks||{})};if(!WORLD_TOUR_COUNTRIES.some(c=>c.id===target.worldTour.selected))target.worldTour.selected="chile";if(!WORLD_TOUR_COUNTRIES.some(c=>c.id===target.worldTour.planeAt))target.worldTour.planeAt="chile";return target.worldTour}
function worldCountry(id){return WORLD_TOUR_COUNTRIES.find(c=>c.id===id)}
function worldCountryProgress(target,id){const wt=ensureWorldTourState(target),raw=wt.countries[id]||{};return{stages:{...(raw.stages||{})},boss:{...(raw.boss||{})},completed:!!raw.completed,stars:Math.max(0,Math.min(3,Number(raw.stars||0))),knowledge:Math.max(0,Math.min(100,Number(raw.knowledge||0))),runs:Math.max(0,Number(raw.runs||0))}}
function worldCountryUnlockedFromSave(target,id){const c=worldCountry(id);if(!c)return false;if(!c.requires?.length)return true;return c.requires.every(reqId=>worldCountryProgress(target,reqId).completed)}
function worldCountryUnlocked(id){return worldCountryUnlockedFromSave(save,id)}
function worldCompletedCountFromSave(target=save){return WORLD_TOUR_COUNTRIES.filter(c=>worldCountryProgress(target,c.id).completed).length}
function worldTotalStarsFromSave(target=save){return WORLD_TOUR_COUNTRIES.reduce((n,c)=>n+worldCountryProgress(target,c.id).stars,0)}
function worldAverageKnowledgeFromSave(target=save){const vals=WORLD_TOUR_COUNTRIES.map(c=>worldCountryProgress(target,c.id).knowledge).filter(x=>x>0);return vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):0}
function worldContinentCompletedFromSave(target,id){const d=WORLD_TOUR_CONTINENTS[id];return !!d&&d.countries.every(cid=>worldCountryProgress(target,cid).completed)}
function worldContinentProgressTextFromSave(target,id){const d=WORLD_TOUR_CONTINENTS[id];if(!d)return"0/0";const n=d.countries.filter(cid=>worldCountryProgress(target,cid).completed).length;return`${n}/${d.countries.length}`}
function worldStageCompleted(target,countryId,stageId){return !!worldCountryProgress(target,countryId).stages?.[stageId]?.completed}
function worldBossUnlocked(countryId){return WORLD_TOUR_STAGE_ORDER.every(s=>worldStageCompleted(save,countryId,s))}
function worldStageUnlocked(countryId,stageId){if(!worldCountryUnlocked(countryId))return false;const i=WORLD_TOUR_STAGE_ORDER.indexOf(stageId);if(i<=0)return true;return WORLD_TOUR_STAGE_ORDER.slice(0,i).every(s=>worldStageCompleted(save,countryId,s))}
function worldStageLabel(country,stage){if(stage==="geo")return`Geografía de ${country.name}`;if(stage==="culture")return"Cultura y tradiciones";if(stage==="history")return"Historia";if(stage==="people")return"Deportes y personajes";if(stage==="curious")return`${country.name} curioso`;return`Maestro de ${country.name}`}
function worldStageCategory(stage){return stage==="geo"?"Geografía":stage==="culture"?"Arte":stage==="history"?"Historia":stage==="people"?"Deportes":"Geografía"}
function worldCap(s){s=String(s||"").trim();return s?s.charAt(0).toUpperCase()+s.slice(1):s}
function worldCountryNameSet(){return new Set(WORLD_TOUR_COUNTRIES.map(c=>c.name.toLocaleLowerCase("es")))}
function worldSafeWrongAnswers(country,stage,factIndex,preferred=[]){
 const facts=country.facts?.[stage]||[],names=worldCountryNameSet(),answer=String(facts[factIndex]?.[1]||"").toLocaleLowerCase("es"),out=[];
 const add=x=>{const v=String(x||"").trim(),low=v.toLocaleLowerCase("es");if(!v||low===answer||names.has(low)||out.some(y=>y.toLocaleLowerCase("es")===low))return;out.push(v)};
 (preferred||[]).forEach(add);
 facts.forEach((f,i)=>{if(i!==factIndex)add(f[1])});
 WORLD_TOUR_STAGE_ORDER.forEach(s=>(country.facts?.[s]||[]).forEach(f=>add(f[1])));
 return out.slice(0,3)
}
function worldFactQuestions(country,stage){
 const facts=country.facts?.[stage]||[],out=[],difficulty=Math.min(3,1+Math.floor(WORLD_TOUR_COUNTRIES.indexOf(country)/6));
 facts.forEach((f,i)=>{
  const[q,a,wrong,clue,note]=f,concept=`wt:${country.id}:${stage}:${i}`;
  const safeWrong=worldSafeWrongAnswers(country,stage,i,wrong);
  const sibling=facts.filter((_,j)=>j!==i);
  const otherClues=shuffle(sibling.map(x=>worldCap(x[3]))).slice(0,3);
  const otherNotes=shuffle(sibling.map(x=>String(x[4]||"").trim())).slice(0,3);
  out.push({id:`${concept}:direct`,conceptKey:concept,c:worldStageCategory(stage),d:difficulty,q,a:[a,...safeWrong],ok:0,explanation:`💡 ${note}`,worldStage:stage,worldCountry:country.id});
  out.push({id:`${concept}:clue`,conceptKey:concept,c:worldStageCategory(stage),d:difficulty,q:`En ${country.name}, ¿qué opción corresponde a esta descripción? ${worldCap(clue)}.`,a:[a,...safeWrong],ok:0,explanation:`💡 ${note}`,worldStage:stage,worldCountry:country.id});
  if(otherClues.length>=3)out.push({id:`${concept}:reverse`,conceptKey:concept,c:worldStageCategory(stage),d:Math.max(2,difficulty),q:`En ${country.name}, ¿cuál de estas descripciones corresponde mejor a “${a}”?`,a:[worldCap(clue),...otherClues],ok:0,explanation:`💡 ${note}`,worldStage:stage,worldCountry:country.id});
  if(otherNotes.length>=3)out.push({id:`${concept}:detail`,conceptKey:concept,c:worldStageCategory(stage),d:Math.max(2,difficulty),q:`¿Cuál afirmación sobre “${a}” es correcta en el contexto de ${country.name}?`,a:[String(note).trim(),...otherNotes],ok:0,explanation:`💡 ${note}`,worldStage:stage,worldCountry:country.id})
 });
 return out.map(scrambleQuestion)
}
function worldStageQuestionPool(countryId,stage){const c=worldCountry(countryId);return c?worldFactQuestions(c,stage):[]}
function drawWorldDeck(countryId,stage,count){
 ensureWorldTourState();const pool=stage==="boss"?WORLD_TOUR_STAGE_ORDER.flatMap(s=>worldStageQuestionPool(countryId,s)):worldStageQuestionPool(countryId,stage);if(!pool.length)return[];
 const key=`${countryId}:${stage}`,valid=new Set(pool.map(q=>q.id)),byId=Object.fromEntries(pool.map(q=>[q.id,q]));
 let d=save.worldTour.questionDecks[key]||{remaining:[],recent:[]};d.remaining=(d.remaining||[]).filter(id=>valid.has(id));d.recent=(d.recent||[]).filter(id=>valid.has(id));
 const out=[],concepts=new Set();let guard=0;
 const refill=()=>{let ids=shuffle([...valid]);const recentTail=new Set(d.recent.slice(-Math.min(8,d.recent.length)));ids.sort((a,b)=>(recentTail.has(a)?1:0)-(recentTail.has(b)?1:0));d.remaining=ids};
 while(out.length<count&&guard++<1000){if(!d.remaining.length)refill();let idx=d.remaining.findIndex(id=>!concepts.has(byId[id]?.conceptKey||id));if(idx<0)idx=0;const[id]=d.remaining.splice(idx,1),q=byId[id];if(!q)continue;out.push(q);concepts.add(q.conceptKey||q.id);d.recent.push(id);d.recent=d.recent.slice(-Math.min(pool.length,40))}
 save.worldTour.questionDecks[key]=d;quietPersist();return out
}
function worldBossQuestionPool(countryId){return drawWorldDeck(countryId,"boss",10)}
function worldKnowledge(countryId){const p=worldCountryProgress(save,countryId),scores=[];WORLD_TOUR_STAGE_ORDER.forEach(s=>{const v=p.stages?.[s];scores.push(v?.completed?Number(v.bestPct||0):0)});scores.push(p.boss?.completed?Number(p.boss.bestPct||0):0);return Math.round(scores.reduce((a,b)=>a+b,0)/scores.length)}
function recalcWorldCountry(countryId){ensureWorldTourState();const p=worldCountryProgress(save,countryId);p.knowledge=worldKnowledge(countryId);save.worldTour.countries[countryId]=p;return p}
function worldUnlockedIds(){return WORLD_TOUR_COUNTRIES.filter(c=>worldCountryUnlocked(c.id)).map(c=>c.id)}
function ensureWorldEvent(){const wt=ensureWorldTourState(),wk=localWeekKey();if(wt.eventWeek!==wk){const unlocked=worldUnlockedIds(),seed=seededNumber(`world:${wk}:${unlocked.join("|")}`),pickId=unlocked.length?unlocked[seed%unlocked.length]:"chile";wt.eventWeek=wk;wt.eventCountry=pickId;wt.eventClaimed=false;save.worldTour=wt;quietPersist()}return worldCountry(wt.eventCountry)||worldCountry("chile")}
function worldEventBonus(countryId){const ev=ensureWorldEvent();return ev?.id===countryId?1.5:1}
function worldAllComplete(){return worldCompletedCountFromSave(save)>=WORLD_TOUR_COUNTRIES.length}
function grantWorldCosmetic(cos){if(!cos)return;if(cos.type==="frame"&&!save.framesOwned.includes(cos.id))save.framesOwned.push(cos.id);if(cos.type==="aura"&&!save.aurasOwned.includes(cos.id))save.aurasOwned.push(cos.id);if(cos.type==="outfit"&&!save.wardrobeOwned.includes(cos.id)){save.wardrobeOwned.push(cos.id);save.outfitXp[cos.id]=0}}
const WORLD_PASSPORT_MILESTONES=[
 {stamps:3,icon:"🎒",name:"Primer gran viaje",reward:{coins:200,keys:1}},
 {stamps:6,icon:"🧭",name:"Viajero frecuente",reward:{coins:350,gems:2}},
 {stamps:10,icon:"🛂",name:"Pasaporte experto",reward:{coins:600,gems:3,keys:2}},
 {stamps:16,icon:"🌍",name:"Pasaporte completo",reward:{coins:1000,gems:5,keys:3}}
];
function passportRewardText(r){const x=[];if(r.coins)x.push(`${r.coins} 🪙`);if(r.gems)x.push(`${r.gems} 💎`);if(r.keys)x.push(`${r.keys} 🔑`);return x.join(" · ")}
function checkWorldPassportMilestones(){ensureWorldTourState();const stamps=worldCompletedCountFromSave(save),claimed=save.worldTour.passportClaimed||[];let changed=false;WORLD_PASSPORT_MILESTONES.forEach(m=>{const key=String(m.stamps);if(stamps>=m.stamps&&!claimed.includes(key)){claimed.push(key);save.coins+=m.reward.coins||0;save.gems+=m.reward.gems||0;if(m.reward.keys)addKey("silver",m.reward.keys);toast(`${m.icon} ${m.name} · ${passportRewardText(m.reward)}`);changed=true}});save.worldTour.passportClaimed=[...new Set(claimed)];if(changed)quietPersist();return changed}
function renderWorldPassportMilestones(){const box=$("worldPassportMilestones");if(!box)return;ensureWorldTourState();const stamps=worldCompletedCountFromSave(save),claimed=new Set(save.worldTour.passportClaimed||[]);box.innerHTML=WORLD_PASSPORT_MILESTONES.map(m=>{const done=claimed.has(String(m.stamps)),ready=stamps>=m.stamps;return `<div class="passport-milestone ${done?"claimed":ready?"ready":""}"><div class="milestone-icon">${done?"✅":m.icon}</div><b>${m.stamps} sellos · ${m.name}</b><small>${done?"Recompensa recibida":ready?"Recompensa lista":`${stamps}/${m.stamps} sellos`} · ${passportRewardText(m.reward)}</small></div>`}).join("")}
function checkWorldContinentRewards(){ensureWorldTourState();checkWorldPassportMilestones();Object.entries(WORLD_TOUR_CONTINENTS).forEach(([id,d])=>{if(worldContinentCompletedFromSave(save,id)&&!save.worldTour.continentsClaimed.includes(id)){save.worldTour.continentsClaimed.push(id);save.coins+=d.reward.coins||0;save.gems+=d.reward.gems||0;grantWorldCosmetic(d.reward.cosmetic);toast(`${d.icon} ${d.name} completado · ${d.reward.coins} 🪙 · ${d.reward.gems} 💎 · ${d.reward.cosmetic?.name||"premio"}`)}});if(worldAllComplete()&&!save.framesOwned.includes("world_master_frame")){save.framesOwned.push("world_master_frame");save.coins+=1500;save.gems+=10;toast("🌍 ¡Maestro del Mundo! Marco legendario desbloqueado")}}
function worldNodeState(id){const p=worldCountryProgress(save,id);return p.completed?"complete":worldCountryUnlocked(id)?"open":"locked"}
function renderWorldRoutes(){const svg=$("worldRouteSvg");if(!svg)return;svg.innerHTML="";WORLD_TOUR_ROUTES.forEach(([a,b])=>{const ca=worldCountry(a),cb=worldCountry(b);if(!ca||!cb)return;const la=ca.x*10,ta=ca.y*5.6,lb=cb.x*10,tb=cb.y*5.6;const line=document.createElementNS("http://www.w3.org/2000/svg","path");const mx=(la+lb)/2,my=(ta+tb)/2-22;line.setAttribute("d",`M ${la} ${ta} Q ${mx} ${my} ${lb} ${tb}`);const completed=worldCountryProgress(save,a).completed&&worldCountryProgress(save,b).completed,open=worldCountryUnlocked(b);line.setAttribute("class",`world-route-line ${completed?"complete":open?"open":""}`);svg.appendChild(line)})}
function moveWorldPlane(id,animate=true){const c=worldCountry(id),plane=$("worldPlane");if(!c||!plane)return;if(animate)plane.classList.add("flying");plane.style.left=c.x+"%";plane.style.top=c.y+"%";setTimeout(()=>plane.classList.remove("flying"),1050);save.worldTour.planeAt=id;quietPersist()}
function openWorldCountry(id,fly=true){if(!worldCountryUnlocked(id))return toast("🔒 Completa la ruta anterior para viajar a este país");ensureWorldTourState();save.worldTour.selected=id;if(fly)moveWorldPlane(id,true);quietPersist();renderMap(false)}
function renderWorldNodes(){const box=$("worldCountryNodes");if(!box)return;box.innerHTML="";const ev=ensureWorldEvent();WORLD_TOUR_COUNTRIES.forEach(c=>{const p=worldCountryProgress(save,c.id),state=worldNodeState(c.id),d=document.createElement("button");d.className=`world-country-node ${state} ${save.worldTour.selected===c.id?"selected":""} ${ev.id===c.id?"event":""}`;d.style.left=c.x+"%";d.style.top=c.y+"%";d.type="button";d.innerHTML=`<span class="node-flag">${c.flag}</span>${state==="locked"?'<span class="node-lock">🔒</span>':""}<span class="node-stars">${"⭐".repeat(p.stars)}${"☆".repeat(3-p.stars)}</span><span class="node-name">${c.name}</span>`;d.onclick=()=>openWorldCountry(c.id,true);box.appendChild(d)})}
function worldCountryRewardText(c){return`🪙 ${c.reward.coins} · 💎 ${c.reward.gems} · ${c.collectible.icon} ${c.collectible.name}`}
function renderWorldCountryPanel(){const box=$("worldCountryPanel");if(!box)return;const id=save.worldTour.selected||"chile",c=worldCountry(id)||WORLD_TOUR_COUNTRIES[0],p=worldCountryProgress(save,c.id),open=worldCountryUnlocked(c.id),event=ensureWorldEvent(),stagesDone=WORLD_TOUR_STAGE_ORDER.filter(s=>p.stages?.[s]?.completed).length,progress=Math.round((stagesDone+(p.completed?1:0))/6*100);if(!open){const needs=(c.requires||[]).map(x=>worldCountry(x)?.name).join(" + ");box.innerHTML=`<div class="world-country-title"><div class="world-country-flag"><span>${c.flag}</span></div><div><h2>${c.flag} ${c.name}</h2><div class="muted">Destino bloqueado</div></div></div><div class="world-locked-reason">🔒 Completa primero: <b>${needs}</b></div><p class="muted">Cuando abras esta ruta, el avión podrá desplazarse hasta ${c.name}.</p>`;return}box.innerHTML=`<div class="world-country-title"><div class="world-country-flag"><span>${c.flag}</span></div><div><h2>${c.flag} ${c.name}</h2><div class="muted">${WORLD_TOUR_CONTINENTS[c.continent]?.name||"World Tour"}</div></div></div><div class="world-country-meta"><span class="pill">🧠 ${p.knowledge||0}%</span><span class="pill world-stars">${"⭐".repeat(p.stars)}${"☆".repeat(3-p.stars)}</span>${event.id===c.id?'<span class="pill">⚡ DESTINO DESTACADO</span>':""}</div><div class="world-country-progress"><div style="width:${progress}%"></div></div><div class="muted" style="margin-top:6px">${stagesDone}/5 etapas · ${p.completed?"✅ País completado":"Boss pendiente"}</div><div class="world-stage-list" id="worldStageList"></div><div class="world-boss-card"><div class="top" style="margin:0"><div><b>👑 Desafío final: Maestro de ${c.name}</b><div class="muted">10 preguntas mezcladas · 3 vidas · mínimo 7 aciertos</div></div><button class="btn ${worldBossUnlocked(c.id)?"primary":"secondary"}" ${worldBossUnlocked(c.id)?"":"disabled"} onclick="startWorldBoss('${c.id}')">${p.completed?"REPETIR BOSS":worldBossUnlocked(c.id)?"DESAFIAR":"🔒 BLOQUEADO"}</button></div><div class="world-reward-line"><span>${worldCountryRewardText(c)}</span></div></div>`;const list=$("worldStageList");WORLD_TOUR_STAGE_ORDER.forEach((s,i)=>{const done=!!p.stages?.[s]?.completed,unlocked=worldStageUnlocked(c.id,s),best=Number(p.stages?.[s]?.bestPct||0),m=WORLD_TOUR_STAGE_META[s],row=document.createElement("div");row.className=`world-stage ${done?"done":""} ${unlocked?"":"locked"}`;row.innerHTML=`<div class="world-stage-icon">${done?"✅":m.icon}</div><div><b>${i+1}. ${worldStageLabel(c,s)}</b><small>${done?`Mejor resultado: ${best}%`:unlocked?"5 preguntas · 3 vidas · banco ampliado":"Completa la etapa anterior"}</small></div><button class="btn secondary" ${unlocked?"":"disabled"} onclick="startWorldStage('${c.id}','${s}')">${done?"REPETIR":"JUGAR"}</button>`;list.appendChild(row)})}
function renderWorldPassport(){const box=$("worldPassport");if(!box)return;box.innerHTML="";WORLD_TOUR_COUNTRIES.forEach(c=>{const p=worldCountryProgress(save,c.id),d=document.createElement("div");d.className=`card passport-stamp ${p.completed?"complete":"locked"}`;d.innerHTML=`<div class="stamp-flag">${p.completed?c.flag:"🔒"}</div><b>${c.name}</b><div class="stamp-mark">${p.completed?"✓ SELLO OFICIAL":"SIN SELLAR"}</div>${p.completed?`<small class="muted">${p.knowledge}% · ${"⭐".repeat(p.stars)}</small>`:""}`;box.appendChild(d)})}
function renderWorldSouvenirs(target="worldSouvenirGrid"){const box=$(target);if(!box)return;box.innerHTML="";WORLD_TOUR_COUNTRIES.forEach(c=>{const p=worldCountryProgress(save,c.id),d=document.createElement("div");d.className=`card souvenir-card ${p.completed?"":"locked"}`;d.innerHTML=`<div class="souvenir-icon">${p.completed?c.collectible.icon:"❔"}</div><b>${p.completed?c.collectible.name:"Souvenir secreto"}</b><div class="muted">${p.completed?c.name:`Completa ${c.name}`}</div>`;box.appendChild(d)})}
function renderWorldCollection(){ensureWorldTourState();renderWorldSouvenirs("collectionWorldSouvenirs")}
function renderWorldContinents(){const box=$("worldContinentGrid");if(!box)return;box.innerHTML="";Object.entries(WORLD_TOUR_CONTINENTS).forEach(([id,d])=>{const done=d.countries.filter(x=>worldCountryProgress(save,x).completed).length,complete=done===d.countries.length,claimed=save.worldTour.continentsClaimed.includes(id),card=document.createElement("div");card.className=`card continent-card ${complete?"complete":""}`;card.innerHTML=`<div class="top" style="margin:0"><div><b>${d.icon} ${d.name}</b><div class="muted">${done}/${d.countries.length} países</div></div><strong>${complete?"✅":"🧭"}</strong></div><div class="continent-progress"><div style="width:${Math.round(done/d.countries.length*100)}%"></div></div><div class="muted">Premio: ${d.reward.coins} 🪙 · ${d.reward.gems} 💎 · ${d.reward.cosmetic?.name||"Cosmético"}</div><small>${claimed?"✓ Recompensa entregada":complete?"La recompensa se entrega automáticamente":"Sigue viajando para desbloquearla"}</small>`;box.appendChild(card)})}
function renderWorldEvent(){const box=$("worldEventBanner");if(!box)return;const ev=ensureWorldEvent();box.innerHTML=`<div><strong>⚡ Destino destacado de la semana: ${ev.flag} ${ev.name}</strong><div class="muted">Las etapas de este país entregan +50% monedas. Completa su boss durante el evento para desbloquear el marco Viajero de Evento.</div></div><div class="event-bonus">+50% 🪙</div>`}
function renderMap(movePlane=false){ensureWorldTourState();checkWorldContinentRewards();const done=worldCompletedCountFromSave(save),stars=worldTotalStarsFromSave(save),avg=worldAverageKnowledgeFromSave(save),open=worldUnlockedIds();$("worldStampCount").textContent=`${done}/${WORLD_TOUR_COUNTRIES.length}`;$("worldStarCount").textContent=`${stars}/${WORLD_TOUR_COUNTRIES.length*3}`;$("worldAvgKnowledge").textContent=avg+"%";$("worldRouteSummary").textContent=`${open.length} destino${open.length===1?"":"s"} abierto${open.length===1?"":"s"}`;renderWorldEvent();renderWorldRoutes();renderWorldNodes();renderWorldCountryPanel();renderWorldPassportMilestones();renderWorldPassport();renderWorldSouvenirs();renderWorldContinents();const planeAt=worldCountry(save.worldTour.planeAt)||worldCountry("chile"),plane=$("worldPlane");if(plane){plane.style.left=planeAt.x+"%";plane.style.top=planeAt.y+"%"}if(movePlane)moveWorldPlane(save.worldTour.selected,true)}
function startWorldStage(countryId,stageId){if(!worldStageUnlocked(countryId,stageId))return toast("🔒 Esta etapa aún no está disponible");ensureAudio();const c=worldCountry(countryId),queue=drawWorldDeck(countryId,stageId,5);if(!queue.length)return toast("No hay preguntas para esta etapa");state=base("worldtour");state.worldCountry=countryId;state.worldStage=stageId;state.worldBoss=false;state.queue=shuffle(queue).slice(0,4);state.idx=0;state.target=state.queue.length;state.lives=3;state.startLives=3;page("game");$("modeLabel").textContent=`${c.flag} ${worldStageLabel(c,stageId).toUpperCase()}`;$("duelBox").classList.add("hidden");$("bossBox").classList.add("hidden");$("wheelBox").classList.add("hidden");$("qBox").classList.remove("hidden");renderQ();updateHUD()}
function startWorldBoss(countryId){if(!worldBossUnlocked(countryId))return toast("🔒 Completa las 5 etapas antes del desafío final");ensureAudio();const c=worldCountry(countryId),queue=worldBossQuestionPool(countryId);state=base("worldtour");state.worldCountry=countryId;state.worldStage="boss";state.worldBoss=true;state.queue=queue;state.idx=0;state.target=queue.length;state.lives=3;state.startLives=3;page("game");$("modeLabel").textContent=`👑 MAESTRO DE ${c.name.toUpperCase()}`;$("duelBox").classList.add("hidden");$("bossBox").classList.add("hidden");$("wheelBox").classList.add("hidden");$("qBox").classList.remove("hidden");renderQ();updateHUD()}
let resultReturnPage="home";
function showWorldResult(icon,title,text,coins=0){resultReturnPage="campaign";$("resultIcon").textContent=icon;$("resultTitle").textContent=title;$("resultText").textContent=text;$("rScore").textContent=state?.score||0;$("rCorrect").textContent=state?.correct||0;$("rPrize").textContent=coins?coins+" 🪙":"—";renderResultIdentity(!/incompleta/i.test(title||""));$("resultModal").classList.remove("hidden");flushLevelUpCelebrations()}
function finishWorldTourStage(){stopQuestionTimer();ensureWorldTourState();const c=worldCountry(state.worldCountry),p=worldCountryProgress(save,c.id),pct=Math.round((state.correct/Math.max(1,state.target))*100),passed=state.worldBoss?(state.correct>=7&&state.lives>0):(state.correct>=Math.ceil(state.target*.6)&&state.lives>0),livesLost=Math.max(0,(state.startLives||3)-Math.max(0,state.lives||0));if(!passed){persist();showWorldResult("🧳",`Ruta incompleta: ${c.name}`,`Conseguiste ${state.correct}/${state.target}. Necesitas ${state.worldBoss?"7/10":"al menos 60%"} y conservar una vida para avanzar.`,0);return}let coins=0;if(state.worldBoss){const oldStars=p.stars||0,first=!p.completed,boss=p.boss||{};boss.completed=true;boss.bestPct=Math.max(Number(boss.bestPct||0),pct);boss.bestLives=Math.min(Number.isFinite(Number(boss.bestLives))?Number(boss.bestLives):99,livesLost);p.boss=boss;p.completed=true;p.runs=(p.runs||0)+1;p.stars=1+(boss.bestPct>=80?1:0)+(boss.bestLives===0?1:0);if(first){coins=Math.round(c.reward.coins*worldEventBonus(c.id));save.coins+=coins;save.gems+=c.reward.gems;earnChest("world",1,`${c.flag} Cofre Mundial obtenido`);addKey("gold",1);gainXp(260,.65);gainSeasonPoints(160);recordProgress("worldBosses",1);recordProgress("worldStars",p.stars);const unlocked=WORLD_TOUR_COUNTRIES.filter(x=>x.requires?.includes(c.id)&&worldCountryUnlockedFromSave({...save,worldTour:{...save.worldTour,countries:{...save.worldTour.countries,[c.id]:p}}},x.id)).map(x=>x.name);if(unlocked.length)toast(`🛫 Nueva ruta desbloqueada: ${unlocked.join(" · ")}`)}else{const delta=Math.max(0,p.stars-oldStars);if(delta)recordProgress("worldStars",delta)}save.worldTour.countries[c.id]=p;p.knowledge=worldKnowledge(c.id);save.worldTour.countries[c.id]=p;const ev=ensureWorldEvent();if(ev.id===c.id&&!save.worldTour.eventClaimed){save.worldTour.eventClaimed=true;if(!save.framesOwned.includes("world_event_frame"))save.framesOwned.push("world_event_frame");save.coins+=250;save.gems+=1;toast("⚡ Evento World Tour completado · Marco Viajero de Evento")}checkWorldContinentRewards();checkAch();persist();showWorldResult("🛂",`${c.flag} ${c.name} completado`,`Sello añadido al pasaporte · ${p.stars} estrella${p.stars===1?"":"s"} · conocimiento ${p.knowledge}% · souvenir: ${c.collectible.icon} ${c.collectible.name}.`,coins);return}const prev=p.stages?.[state.worldStage],first=!prev?.completed,best=Math.max(Number(prev?.bestPct||0),pct);p.stages[state.worldStage]={completed:true,bestPct:best};save.worldTour.countries[c.id]=p;p.knowledge=worldKnowledge(c.id);save.worldTour.countries[c.id]=p;if(first){coins=Math.round(60*worldEventBonus(c.id));save.coins+=coins;gainXp(55,.55);gainSeasonPoints(25);recordProgress("worldStages",1)}checkAch();persist();showWorldResult("✅",`${worldStageLabel(c,state.worldStage)} superada`,`${state.correct}/${state.target} correctas · mejor rendimiento ${best}% · conocimiento de ${c.name}: ${p.knowledge}%.`,coins)}

function medalCount(s){let n=0;Object.values(s.catStats).forEach(x=>{if(x.correct>=5)n++;if(x.correct>=12)n++;if(x.correct>=25)n++});return n}
function goldCount(s){let n=0;Object.values(s.catStats).forEach(x=>{if(x.correct>=25)n++});return n}
function renderMedals(){const g=$("medalGrid");g.innerHTML="";Object.keys(CATS).forEach(c=>{const n=save.catStats[c].correct;[["🥉","Bronce",5],["🥈","Plata",12],["🥇","Oro",25]].forEach(([ic,nm,need])=>{const d=document.createElement("div");d.className="card medal "+(n>=need?"":"hiddenMedal");d.style.opacity=n>=need?1:.35;d.style.filter=n>=need?"none":"grayscale(1)";d.innerHTML=`<div class="bigico">${ic}</div><b>${CATS[c]} ${c}</b><div class="muted">${nm} · ${Math.min(n,need)}/${need}</div>`;g.appendChild(d)})})}
function renderAvatars(targetId="avatarGridStudio"){
 const g=$(targetId);if(!g)return;g.innerHTML="";unlockLevelCosmetics();
 const custom=document.createElement("div");custom.className="card avataritem "+(save.avatar==="custom"?"sel":"");custom.innerHTML=`<div class="bigico">🧑</div><h3>Personalizado</h3><div class="muted">Tu diseño editable</div>`;custom.onclick=()=>{save.avatar="custom";persist();renderAvatars(targetId)};g.appendChild(custom);
 AVATARS.filter(a=>a.source!=="unlock").forEach(a=>{
  const owned=save.avatars.includes(a.id),d=document.createElement("div");
  d.className="card avataritem premium-card "+(save.avatar===a.id?"sel ":"")+(owned?"":"locked");
  const extra=a.source==="premium"||a.source==="level"?rarityBadge(a.rarity):"";
  const status=owned?(save.avatar===a.id?"Seleccionado":"Disponible"):(a.levelReq?`🔒 Nivel ${a.levelReq}`:(a.currency==="gems"?`🔒 ${a.cost} 💎`:`🔒 ${a.cost} 🪙`));
  const note=!owned?'<span class="locked-note">Debes desbloquearlo o comprarlo</span>':'';
  d.innerHTML=`${!owned?'<span class="lock-badge">🔒</span>':''}<div class="bigico">${avatarVisual(a)}</div>${extra}<h3>${a.name}</h3><div class="muted">${status}</div>${note}`;
  d.onclick=()=>{
    if(!owned){toast("🔒 Aún no has desbloqueado este avatar");return}
    save.avatar=a.id;save.profileGender=a.portrait?.gender||save.profileGender;persist();renderAvatars(targetId);toast(a.name+" seleccionado")
  };
  g.appendChild(d)
 })
}
function renderAchievementAvatars(){
 const g=$("achievementAvatarGrid");if(!g)return;g.innerHTML="";
 AVATARS.filter(a=>a.source==="unlock").forEach(a=>{const owned=save.avatars.includes(a.id),d=document.createElement("div");d.className="card avataritem";d.style.opacity=owned?1:.4;const ach=ACH.find(x=>x.id===a.unlock);d.innerHTML=`<div class="bigico">${owned?avatarVisual(a):"🔒"}</div><h3>${a.name}</h3><div class="muted">${owned?"Desbloqueado":ach?"Logro: "+ach.name:"Bloqueado"}</div>`;if(owned)d.onclick=()=>{toast("🎨 Equípalo desde Mi Avatar");openUnifiedAvatarEditor("avatarBaseSection")};g.appendChild(d)})
}
function unlockAchievementAvatars(){AVATARS.filter(a=>a.source==="unlock"&&a.unlock).forEach(a=>{if(save.ach[a.unlock]&&!save.avatars.includes(a.id)){save.avatars.push(a.id);toast("🎁 Avatar desbloqueado: "+a.name)}})}
async function loadGameConfig(force=false){
 if(gameConfigLoaded&&!force)return;
 if(location.protocol==="file:"){gameConfigLoaded=true;return}
 try{const r=await mpRequest("/api/game/config");if(Array.isArray(r.wheelPrizes)&&r.wheelPrizes.length)PRIZE_WHEEL=r.wheelPrizes;REWARD_COOLDOWN_MS=Math.max(60000,Number(r.wheelCooldownMs)||REWARD_COOLDOWN_MS);gameConfigLoaded=true}catch(e){}
}
function wheelPrizeLabel(type,amount){const n=Math.max(1,Number(amount)||1);if(type==="coins")return `${n} Monedas`;if(type==="gems")return `${n} Diamante${n===1?"":"s"}`;if(type==="keys")return `${n} Llave${n===1?"":"s"}`;if(type==="shield")return n===1?"Escudo":`${n} Escudos`;if(type==="double")return n===1?"Doble x2":`${n} Dobles x2`;if(type==="life")return n===1?"Vida extra":`${n} Vidas extra`;return "Sorpresa"}
function wheelPrizeIcon(type){return type==="coins"?"🪙":type==="gems"?"💎":type==="keys"?"🔑":type==="shield"?"🛡️":type==="double"?"⚡":type==="life"?"❤️":"🎁"}

function renderRewardWheelLabels(){
 const box=$("rewardWheelLabels");if(!box)return;box.innerHTML="";
 const wheel=$("rewardWheel"),radius=Math.max(76,Math.min(132,(wheel?.clientWidth||390)*.34));
 PRIZE_WHEEL.forEach((r,i)=>{const a=i*(360/PRIZE_WHEEL.length)+22.5,d=document.createElement("div");d.className="reward-wheel-label";d.innerHTML=`<span class="rw-icon">${r.icon}</span>${r.label}`;d.style.transform=`translate(-50%,-50%) rotate(${a}deg) translateY(-${radius}px) rotate(${-a}deg)`;box.appendChild(d)})
}
window.addEventListener("resize",()=>{if(!$("rewards").classList.contains("hidden"))renderRewardWheelLabels()});
async function renderRewards(){await loadGameConfig(true);const g=$("rewardLegend");if(g){g.innerHTML="";PRIZE_WHEEL.forEach(r=>{const d=document.createElement("div");d.className="card";d.style.textAlign="center";d.innerHTML=`<div class="bigico">${r.icon}</div><b>${r.label}</b>`;g.appendChild(d)})}renderRewardWheelLabels();updateRewardTimer()}
function rewardRemaining(){return Math.max(0,REWARD_COOLDOWN_MS-(Date.now()-(save.lastRewardSpin||0)))}
function formatRemaining(ms){const t=Math.ceil(ms/1000),hh=Math.floor(t/3600),mm=Math.floor((t%3600)/60),ss=t%60;return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`}
function updateRewardTimer(){const r=rewardRemaining(),b=$("rewardSpinBtn"),l=$("rewardCountdown"),hs=$("homeRewardStatus");if(l)l.textContent=r<=0?"🎁 ¡Giro disponible!":`⏳ Próximo giro en ${formatRemaining(r)}`;if(hs)hs.textContent=r<=0?"🎁 Tu giro está disponible ahora.":`⏳ Próximo giro en ${formatRemaining(r)}`;if(b){b.disabled=r>0;b.textContent=r>0?"VUELVE MÁS TARDE":"GIRAR RULETA"}}
function grantWheelPrize(p){let title="",text="";if(p.type==="coins"){save.coins+=p.amount;title=`+${p.amount} monedas`;text="Úsalas para skins, efectos y ayudas."}else if(p.type==="gems"){save.gems+=p.amount;title=`+${p.amount} diamante${p.amount>1?"s":""}`;text="Para recompensas especiales."}else if(p.type==="keys"){addKey("silver",p.amount||1);title=`+${p.amount||1} Llave Plata`;text="Úsala para abrir Cofres Comunes."}else if(p.type==="shield"){save.inv.shield=(save.inv.shield||0)+(p.amount||1);title=`+${p.amount||1} escudo${(p.amount||1)>1?"s":""}`;text="Bloquea errores."}else if(p.type==="double"){save.inv.double=(save.inv.double||0)+(p.amount||1);title=`+${p.amount||1} doble${(p.amount||1)>1?"s":""} puntaje`;text="Multiplica respuestas."}else if(p.type==="life"){save.inv.life=(save.inv.life||0)+(p.amount||1);title=`+${p.amount||1} vida${(p.amount||1)>1?"s":""} extra`;text="Se usará en próximas partidas."}else{const lock=VISUAL_FX.filter(f=>f.id!=="none"&&!save.effectsOwned.includes(f.id));if(lock.length&&Math.random()<.45){const fx=pick(lock);save.effectsOwned.push(fx.id);p.icon=fx.icon;title=`Efecto ${fx.name}`;text="¡Desbloqueaste un efecto sorpresa!"}else{const n=pick([150,200,300]);save.coins+=n;title=`+${n} monedas`;text="Premio sorpresa."}}persist();beep("win");$("rewardIcon").textContent=p.icon;$("rewardTitle").textContent=title;$("rewardText").textContent=text;renderRewardIdentity();$("rewardModal").classList.remove("hidden")}
async function spinRewardWheel(){await loadGameConfig(true);ensureAudio();if(rewardRemaining()>0)return updateRewardTimer();const w=$("rewardWheel"),i=Math.floor(Math.random()*PRIZE_WHEEL.length),seg=360/PRIZE_WHEEL.length,cur=Number(w.dataset.rotation||0),targetMod=(360-(i*seg+seg/2))%360,delta=((targetMod-(cur%360)+360)%360)+2160,target=cur+delta;w.dataset.rotation=target;w.style.transform=`rotate(${target}deg)`;beep("wheel");save.lastRewardSpin=Date.now();save.rewardSpins=(save.rewardSpins||0)+1;recordProgress("wheel",1);gainSeasonPoints(8);persist();$("rewardSpinBtn").disabled=true;setTimeout(()=>{grantWheelPrize({...PRIZE_WHEEL[i]});updateRewardTimer()},2900)}
function renderFxShop(){const g=$("fxShopGrid");if(!g)return;g.innerHTML="";VISUAL_FX.forEach(fx=>{const own=save.effectsOwned.includes(fx.id),sel=save.selectedEffect===fx.id,d=document.createElement("div");d.className="card shopitem";d.innerHTML=`<div class="bigico">${fx.icon}</div><h3>${fx.name}</h3><p class="muted">${sel?"Seleccionado":own?"Disponible":"Efecto visual"}</p><button class="btn secondary">${own?(sel?"ACTIVO":"USAR"):(fx.currency==="gems"?fx.cost+" 💎":fx.cost+" 🪙")}</button>`;d.onclick=()=>{if(own){save.selectedEffect=fx.id;persist();renderFxShop();toast(`${fx.icon} ${fx.name} seleccionado`)}else buyFx(fx)};g.appendChild(d)})}
function buyFx(fx){if(fx.currency==="gems"){if(save.gems<fx.cost)return toast("No tienes suficientes diamantes");save.gems-=fx.cost}else{if(save.coins<fx.cost)return toast("No tienes suficientes monedas");save.coins-=fx.cost}save.effectsOwned.push(fx.id);save.selectedEffect=fx.id;beep("coin");persist();renderFxShop()}
function applyGameFx(){const el=document.querySelector(".semantropic-game");if(!el)return;VISUAL_FX.forEach(f=>el.classList.remove(f.className));el.classList.add((VISUAL_FX.find(f=>f.id===save.selectedEffect)||VISUAL_FX[0]).className)}
function premiumAvatarCostLabel(a){return a.currency==="level"?`🔒 Nivel ${a.levelReq}`:a.currency==="gems"?`${a.cost} 💎`:`${a.cost} 🪙`}
function renderPremiumCollection(){
 const g=$("premiumCollectionGrid");if(!g)return;g.innerHTML="";unlockLevelCosmetics();
 PREMIUM_AVATARS.forEach(a=>{
  const owned=save.avatars.includes(a.id),d=document.createElement("div");d.className="card premium-card "+(save.avatar===a.id?"sel":"");d.style.opacity=owned?1:.45;
  d.innerHTML=`<div class="bigico">${owned?avatarVisual(a):"🔒"}</div>${rarityBadge(a.rarity)}<h3>${a.name}</h3><div class="muted">${owned?(save.avatar===a.id?"Seleccionado":"En tu colección"):(a.levelReq?`Nivel ${a.levelReq}`:"No adquirido")}</div>`;
  if(owned)d.onclick=()=>{toast("🎨 Equípalo desde Mi Avatar");openUnifiedAvatarEditor("avatarBaseSection")};
  g.appendChild(d)
 })
}
function renderPremiumAvatarShop(){
 const g=$("premiumAvatarShopGrid");if(!g)return;g.innerHTML="";unlockLevelCosmetics();
 PREMIUM_AVATARS.forEach(a=>{
  const owned=save.avatars.includes(a.id),d=document.createElement("div");d.className="card shopitem premium-card "+(save.avatar===a.id?"sel":"");
  d.innerHTML=`<div class="bigico">${avatarVisual(a)}</div>${rarityBadge(a.rarity)}<h3>${a.name}</h3><p class="muted premium-description">${a.desc}</p><button class="btn secondary">${owned?(save.avatar===a.id?"EQUIPADO":"USAR"):premiumAvatarCostLabel(a)}</button>`;
  d.onclick=()=>owned?equipPremiumAvatar(a):buyAvatar(a);g.appendChild(d)
 })
}
function renderPremiumFrameShop(){
 const g=$("premiumFrameShopGrid");if(!g)return;g.innerHTML="";unlockLevelCosmetics();
 PREMIUM_FRAMES.forEach(f=>{
  const owned=save.framesOwned.includes(f.id),d=document.createElement("div");d.className="card shopitem premium-card "+(save.selectedFrame===f.id?"sel":"");
  d.innerHTML=`${framePreviewHTML(f)}${rarityBadge(f.rarity)}<h3>${f.name}</h3><p class="muted premium-description">${f.desc}</p><button class="btn secondary">${owned?(save.selectedFrame===f.id?"EQUIPADO":"USAR"):frameCostLabel(f)}</button>`;
  d.onclick=()=>owned?equipPremiumFrame(f):buyFrame(f);g.appendChild(d)
 })
}
function equipPremiumAvatar(a){save.avatar=a.id;save.profileGender=a.portrait?.gender||save.profileGender;persist();renderShop();renderPremiumCollection();toast(`${a.name} equipado`)}
function equipPremiumFrame(f){save.selectedFrame=f.id;persist();renderShop();renderFrames();toast(`${f.name} equipado`)}
function renderShop(){
 ensureIdentityState();
 renderPremiumAvatarShop();renderPremiumFrameShop();
 const g=$("shopGrid");g.innerHTML="";
 SHOP.forEach(it=>{const d=document.createElement("div");d.className="card shopitem";d.innerHTML=`<div class="bigico">${it.icon}</div><h3>${it.name}</h3><p class="muted">${it.desc}</p><button class="btn secondary">${it.cost} 🪙</button>`;d.onclick=()=>buyItem(it);g.appendChild(d)});
 renderAvatarLabShop();
 renderFxShop()
}
function buyAvatar(a){
 if(a.levelReq&&save.level<a.levelReq)return toast(`Necesitas nivel ${a.levelReq}`);
 if(a.currency==="gems"){if(save.gems<a.cost)return toast("No tienes suficientes diamantes");save.gems-=a.cost}
 else if(a.currency==="coins"){if(save.coins<a.cost)return toast("No tienes suficientes monedas");save.coins-=a.cost}
 if(!save.avatars.includes(a.id))save.avatars.push(a.id);
 save.avatar=a.id;save.profileGender=a.portrait?.gender||save.profileGender;
 beep("coin");persist();renderShop();renderPremiumCollection();toast("Desbloqueaste "+a.name)
}
function buyItem(it){ensureEconomyState();if(save.coins<it.cost)return toast("No tienes suficientes monedas");save.coins-=it.cost;save.economyStats.coinsSpent+=it.cost;save.inv[it.id]=(save.inv[it.id]||0)+1;beep("coin");persist();renderShop();toast("Compraste "+it.icon+" "+it.name)}
function openChest(type){
 ensureProgressionState();
 const cost={common:1,rare:2,legendary:4}[type];
 if(save.keys<cost)return toast("Te faltan llaves");
 save.keys-=cost;
 save.chestStats.opened=Number(save.chestStats.opened||0)+1;
 save.chestStats[type]=Number(save.chestStats[type]||0)+1;
 recordProgress("chests",1);gainSeasonPoints(type==="legendary"?20:type==="rare"?12:7);
 let icon="🪙",title="",text="";
 let r=Math.random();
 const candidates=AVATARS.filter(a=>(a.source==="shop"||a.source==="premium")&&!save.avatars.includes(a.id)&&!a.levelReq);
 const forceCosmetic=type==="legendary"&&Number(save.chestStats.legendaryPity||0)>=4&&candidates.length;
 if(type==="legendary"&&(forceCosmetic||r<.34)&&candidates.length){
  const a=pick(candidates);save.avatars.push(a.id);save.chestStats.legendaryPity=0;icon=a.portrait?"🎨":a.icon;title="¡Cosmético nuevo!";text=`Desbloqueaste ${a.name}`
 }else if((type==="rare"&&r<.35)||(type==="legendary"&&r<.72)){
  const n=type==="legendary"?3:1;save.gems+=n;icon="💎";title=`+${n} diamante${n>1?"s":""}`;text="Úsalos en la tienda.";if(type==="legendary")save.chestStats.legendaryPity=Number(save.chestStats.legendaryPity||0)+1
 }else{
  const range=type==="common"?[90,170]:type==="rare"?[200,340]:[400,700],n=Math.floor(range[0]+Math.random()*(range[1]-range[0]));save.coins+=n;icon="🪙";title=`+${n} monedas`;text="Premio del cofre.";if(type==="legendary")save.chestStats.legendaryPity=Number(save.chestStats.legendaryPity||0)+1
 }
 if(save.chestStats.opened%10===0){save.gems+=1;text+=" · Bonus de coleccionista: +1 💎"}
 checkAch();beep("win");persist();renderShop();
 $("rewardIcon").textContent=icon;$("rewardTitle").textContent=title;$("rewardText").textContent=text;renderRewardIdentity();$("rewardModal").classList.remove("hidden")
}
function renderAch(){
 const g=$("achGrid");if(!g)return;
 g.innerHTML="";
 const unlocked=ACH.filter(a=>save.ach[a.id]).length;
 $("achUnlockedCount").textContent=unlocked;
 $("achTotalCount").textContent=ACH.length;
 $("featuredAchievementPreview").textContent=achievementLabel(save.featuredAchievement);
 const groups=[...new Set(ACH.map(a=>a.group))];
 groups.forEach(group=>{
  const list=ACH.filter(a=>a.group===group),done=list.filter(a=>save.ach[a.id]).length,h=document.createElement("div");
  h.className="achievement-group";
  h.innerHTML=`<h2 style="margin:0">${group}</h2><span class="muted">${done}/${list.length}</span>`;
  g.appendChild(h);
  list.forEach(a=>{
   const on=!!save.ach[a.id],d=document.createElement("div");
   d.className="card achievement "+(on?"on":"");
   const hasAvatar=AVATARS.some(v=>v.source==="unlock"&&v.unlock===a.id);
   const hasFrame=FRAMES.some(f=>f.unlock===a.id);
   const prog=a.progress?a.progress(save):(on?"Completado":"Pendiente");
   d.innerHTML=`<div class="bigico">${on?a.icon:"🔒"}</div><div><div class="ach-top"><b>${a.name}</b><span class="ach-scope ${a.scope}">${a.scope==="online"?"ONLINE":"LOCAL"}</span></div><div class="muted">${a.desc}</div><div class="ach-progress">${on?"✅ Desbloqueado":prog}</div>${hasAvatar?'<div class="unlock-note">Desbloquea avatar especial</div>':""}${hasFrame?'<div class="unlock-note">Desbloquea marco de perfil</div>':""}${on?`<button class="btn secondary showcase-btn" onclick="setFeaturedAchievement('${a.id}')">${save.featuredAchievement===a.id?"⭐ EXHIBIENDO":"📌 EXHIBIR"}</button>`:""}</div>`;
   g.appendChild(d)
  })
 })
}

function renderStats(){
 $("sCorrect").textContent=save.correct;
 $("sAcc").textContent=save.total?Math.round(save.correct/save.total*100)+"%":"0%";
 $("sStreak").textContent=save.bestStreak;
 $("sBest").textContent=save.bestScore;
 const t=$("statTable");t.innerHTML="";
 Object.keys(CATS).forEach(c=>{const s=save.catStats[c],acc=s.total?Math.round(s.correct/s.total*100):0;t.innerHTML+=`<tr><td>${CATS[c]} ${c}</td><td>${s.correct}</td><td>${s.total}</td><td>${acc}%</td></tr>`});
 const title=playerTitle(),sr=seasonRank(save.season?.points||0),st=(id,v)=>{const e=$(id);if(e)e.textContent=v};
 const wc=worldCompletedCountFromSave(save),ws=worldTotalStarsFromSave(save),wk=worldAverageKnowledgeFromSave(save);st("statsPlayerTitle",title.label);st("sLevel",save.level);st("sRankTitle",title.name);st("sSeasonPoints",`${save.season?.points||0} SP`);st("sSeasonRank",sr.label);st("sWorldCountries",`${wc}/${WORLD_TOUR_COUNTRIES.length}`);st("sWorldStars",ws);st("sWorldKnowledge",wk+"%");st("sMissions",save.lifetime?.missionsClaimed||0);st("sChests",save.chestStats?.opened||0)
}
function renderSettings(){$("musicToggle").className="toggle "+(save.settings.music?"on":"");$("soundToggle").className="toggle "+(save.settings.sound?"on":"");$("animToggle").className="toggle "+(save.settings.animations?"on":"");$("difficultySelect").value=save.settings.difficulty;$("nameInput").value=save.name}
function toggleSetting(k){save.settings[k]=!save.settings[k];persist();renderSettings();if(k==="music"){if(save.settings.music)startMusic();else stopMusic()}}
function setDifficulty(v){save.settings.difficulty=v;persist()}
function setName(v){save.name=(v.trim()||"Jugador").slice(0,18);persist()}
function exportSave(){const txt=btoa(unescape(encodeURIComponent(JSON.stringify(save))));navigator.clipboard?.writeText(txt).then(()=>toast("Progreso copiado")).catch(()=>prompt("Copia este código:",txt))}
function importSave(){const txt=prompt("Pega el código de progreso:");if(!txt)return;try{const obj=JSON.parse(decodeURIComponent(escape(atob(txt))));save=Object.assign(blank(),obj);persist();toast("Progreso importado");page("home")}catch(e){alert("Código no válido")}}
function resetSave(){if(confirm("¿Borrar todo el progreso?")){save=blank();persist();page("home")}}
function filterBank(){const d=save.settings.difficulty;if(d==="mixed")return BANK;const map={easy:1,medium:2,hard:3};return BANK.filter(q=>q.d===map[d])}
function base(mode){return{mode,score:0,lives:3+(save.inv.life>0?1:0),streak:0,correct:0,totalAnswered:0,cpu:0,p50:false,pSkip:false,pDouble:false,pShield:false,double:false,shield:false,locked:false}}
function consumeInv(){if(save.inv.life>0)save.inv.life--;if(save.inv.shield>0){save.inv.shield--;state.freeShield=true}if(save.inv.double>0){save.inv.double--;state.freeDouble=true}persist()}
function start(mode){ensureAudio();if(mode==="daily"){const today=new Date().toISOString().slice(0,10);if(save.daily===today)return toast("Ya jugaste el desafío diario de hoy")}if(mode==="bossrush"){startBossLadder(0);return}state=base(mode);const pool=filterBank();if(mode==="quick"){state.queue=buildGeneralQueue(10,"general:quick");state.idx=0;state.target=state.queue.length}else if(mode==="survival"){state.queue=buildGeneralQueue(Math.min(60,Math.max(30,pool.length)),"general:survival");state.idx=0;state.target=state.queue.length}else if(mode==="tournament"){Object.assign(state,{round:1,totalRounds:7,pr:0,cr:0,roundQ:[],ri:0,rps:0,rcs:0})}else if(mode==="daily"){state.queue=buildGeneralQueue(7,"general:daily");state.idx=0;state.target=state.queue.length}consumeInv();page("game");$("modeLabel").textContent=mode==="quick"?"⚡ RÁPIDA":mode==="survival"?"💀 SUPERVIVENCIA":mode==="tournament"?"🏆 TORNEO":"📅 DIARIO";$("duelBox").classList.toggle("hidden",mode!=="tournament");$("bossBox").classList.add("hidden");if(mode==="tournament")setupRound();else{$("wheelBox").classList.add("hidden");$("qBox").classList.remove("hidden");renderQ()}updateHUD()}
function localSetup(){$("localModal").classList.remove("hidden")}
function startLocal(){$("localModal").classList.add("hidden");state=base("local");state.p1=$("p1name").value||"Jugador 1";state.p2=$("p2name").value||"Jugador 2";state.turn=1;state.scores={1:0,2:0};state.corrects={1:0,2:0};state.queue=buildGeneralQueue(20,"general:local");state.idx=0;state.target=state.queue.length;page("game");$("modeLabel").textContent="👥 DUELO LOCAL";$("duelBox").classList.remove("hidden");$("bossBox").classList.add("hidden");$("wheelBox").classList.add("hidden");$("qBox").classList.remove("hidden");$("f1").textContent=state.p1;$("f2").textContent=state.p2;renderQ();updateHUD()}
function startBossLadder(index=0){
 ensureAudio();state=base("bossrush");state.bossRun=true;state.bossIndex=Math.max(0,Math.min(9,index));state.runScore=0;state.runCorrect=0;if(save.inv.shield>0){save.inv.shield--;state.freeShield=true}if(save.inv.double>0){save.inv.double--;state.freeDouble=true}persist();launchBossEncounter(state.bossIndex,true)
}
function launchBossEncounter(index,newEncounter=true){
 const b=BOSS_LADDER[index];if(!b)return;
 if(!state||!state.bossRun){state=base("bossrush");state.bossRun=true;state.runScore=0;state.runCorrect=0}
 state.bossIndex=index;state.bossCat=b.cat;state.maxHp=b.hp;
 if(newEncounter){state.hp=b.hp;state.php=3;state.idx=0;state.p50=false;state.pSkip=false;state.pDouble=false;state.pShield=false;state.fiftyQuestion=null;state.queue=buildGeneralQueue(b.questions,`boss:stage:${index+1}:${Date.now()}`,b.cat,b.minD);state.target=state.queue.length}
 page("game");$("modeLabel").textContent=`👹 TORRE DE JEFES · ${index+1}/10`;$("duelBox").classList.add("hidden");$("bossBox").classList.remove("hidden");$("wheelBox").classList.add("hidden");$("qBox").classList.remove("hidden");$("bossName").textContent=b.name;$("bossDesc").textContent=b.desc;$("bossStage").textContent=`Jefe ${index+1}/10 · ${b.cat} · ${index<2?"⭐ Fácil":index<4?"⭐⭐ Accesible":index===4?"⭐⭐ Intermedia":index<7?"⭐⭐⭐ Difícil":index<9?"⭐⭐⭐⭐ Muy difícil":"⭐⭐⭐⭐⭐ Final"}`;updateBoss();renderQ();beep("boss")
}
function updateBoss(){if(!state)return;$("bossHpTxt").textContent=state.hp+" / "+(state.maxHp||100)+" HP";$("bossHp").style.width=Math.max(0,Math.min(100,(state.hp/(state.maxHp||100))*100))+"%"}
function continueBossRun(){$("bossContinueModal").classList.add("hidden");const next=(state.bossIndex||0)+1;if(next>=BOSS_LADDER.length)return completeBossTower();launchBossEncounter(next,true)}
function leaveBossRun(){stopQuestionTimer();$("bossContinueModal").classList.add("hidden");const reached=(state.bossIndex||0)+1;endGame("🏰 Run finalizada",0,`Llegaste hasta el jefe ${reached}/10. Puedes volver a intentarlo cuando quieras.`)}
function showBossRevive(){stopQuestionTimer();
 const b=BOSS_LADDER[state.bossIndex];$("bossReviveText").textContent=`${b.name} aún tiene ${state.hp} HP. Recupera 3 vidas y continúa desde este mismo jefe.`;$("reviveGemBtn").disabled=save.gems<2;$("reviveCoinBtn").disabled=save.coins<300;$("bossReviveModal").classList.remove("hidden")
}
function reviveBoss(method){
 if(method==="gems"){if(save.gems<2)return toast("Necesitas 2 diamantes");save.gems-=2}else{if(save.coins<300)return toast("Necesitas 300 monedas");save.coins-=300}
 $("bossReviveModal").classList.add("hidden");state.php=3;state.idx++;
 const b=BOSS_LADDER[state.bossIndex];
 if(state.idx>=state.queue.length){state.queue=state.queue.concat(buildGeneralQueue(b.questions,`boss:revive:${state.bossIndex}:${Date.now()}`,b.cat,b.minD));state.target=state.queue.length}
 persist();toast("❤️ 3 vidas recuperadas");renderQ();updateHUD()
}
function abandonBossRun(){stopQuestionTimer();$("bossReviveModal").classList.add("hidden");endGame("💀 Torre finalizada",0,`Caíste en el jefe ${(state.bossIndex||0)+1}/10.`)}
function completeBossTower(){stopQuestionTimer();
 save.bossClears=(save.bossClears||0)+1;
 if(!save.avatars.includes("diamond_warrior"))save.avatars.push("diamond_warrior");
 if(!save.framesOwned.includes("diamond"))save.framesOwned.push("diamond");
 save.selectedFrame="diamond";save.coins+=1000;save.gems+=5;addKey("diamond",1);earnChest("legendary",1,"Torre completa: Cofre Legendario");
 if(!save.bosses.includes("Música"))save.bosses.push("Música");
 save.games++;save.bestScore=Math.max(save.bestScore,state.score||0);gainXp(250,.9);checkAch();persist();
 $("resultIcon").innerHTML='<span class="pixel-warrior-icon"></span>';$("resultTitle").textContent="💎 ¡Torre completada!";
 $("resultText").textContent="Derrotaste los 10 jefes. Desbloqueaste Guerrero Diamante, Marco Diamante, 1.000 monedas y 5 diamantes.";
 $("rScore").textContent=state.score||0;$("rCorrect").textContent=state.correct||0;$("rPrize").textContent="SKIN + 💎 MARCO";
 renderResultIdentity(true);$("resultModal").classList.remove("hidden");flushLevelUpCelebrations()
}
function setupRound(){if(state.round>state.totalRounds)return finishTournament();state.rps=0;state.rcs=0;state.ri=0;$("qBox").classList.add("hidden");$("wheelBox").classList.remove("hidden");$("wheelText").textContent=state.round===7?"RONDA FINAL":"Gira la ruleta";renderRoundDots();updateHUD()}
function renderRoundDots(){const d=$("roundDots");d.innerHTML="";for(let i=1;i<=7;i++){const x=document.createElement("span");x.textContent=i;x.style.cssText=`width:31px;height:31px;border-radius:50%;display:grid;place-items:center;font-weight:900;background:${i<state.round?"#35d39a":i===state.round?"#ffd166":"#223154"};color:${i<=state.round?"#101525":"#9eabd0"}`;d.appendChild(x)}$("f1s").textContent=state.pr+" rondas";$("f2s").textContent=state.cr+" rondas"}
function spin(){ensureAudio();beep("wheel");const keys=Object.keys(CATS),cat=keys[Math.floor(Math.random()*keys.length)];$("wheel").style.transform=`rotate(${1440+Math.floor(Math.random()*360)}deg)`;$("wheelText").textContent="Girando...";setTimeout(()=>{$("wheelText").textContent=CATS[cat]+" "+cat;state.roundQ=buildGeneralQueue(state.round===7?5:3,`general:tournament:${cat}`,cat);setTimeout(()=>{$("wheelBox").classList.add("hidden");$("qBox").classList.remove("hidden");renderQ()},550)},1650)}
function qcur(){if(state.mode==="tournament")return state.roundQ[state.ri];return state.queue[state.idx%state.queue.length]}
function renderQ(){
 const q=qcur();if(!q){if(state.mode==="tournament")endRound();else if(state.mode==="boss"||state.mode==="bossrush")finishBoss(false);else if(state.mode==="worldtour")finishWorldTourStage();else endGame();return}
 state.locked=false;state.double=false;state.shield=!!state.freeShield;state.freeShield=false;
 if(state.mode==="worldtour"){const c=worldCountry(state.worldCountry),m=WORLD_TOUR_STAGE_META[state.worldStage]||WORLD_TOUR_STAGE_META.boss;$("qCat").textContent=`${c.flag} ${m.icon} ${worldStageLabel(c,state.worldStage)}`;$("qDiff").textContent="✈️ World Tour"}
 else{$("qCat").textContent=(CATS[q.c]||"🎯")+" "+q.c;$("qDiff").textContent=q.d===1?"🟢 Fácil":q.d===2?"🟡 Media":"🔴 Difícil"}
 $("qText").textContent=q.q;$("feedback").textContent="";renderGameAvatarWidget("ready");$("p50").disabled=(state.fiftyQuestion===(state.mode==="tournament"?state.ri:state.idx));$("p50").textContent=state.p50?"🌓 ELIMINAR 2 · 60 🪙":"🌓 50/50";$("pSkip").disabled=state.pSkip;$("pSkip").textContent=(save.inv.reroll||0)>0?`🔄 Cambiar (${save.inv.reroll})`:"🔄 Cambiar · 90 🪙";const pt=$("pTime");if(pt)pt.textContent=(save.inv.time||0)>0?`⏱️ +8s (${save.inv.time})`:"⏱️ +8s · 80 🪙";$("pDouble").disabled=state.pDouble&&!state.freeDouble;$("pShield").disabled=state.pShield;const max=state.mode==="tournament"?state.roundQ.length:state.target,n=state.mode==="tournament"?state.ri:state.idx;$("qBar").style.width=Math.min(100,n/max*100)+"%";const box=$("answers");box.innerHTML="";q.a.forEach((txt,i)=>{const b=document.createElement("button");b.className="answer";b.dataset.i=i;b.innerHTML=`<span class="letter">${String.fromCharCode(65+i)}</span>${txt}`;b.onclick=()=>answer(i,b);box.appendChild(b)});updateHUD();startQuestionTimer()
}
function answer(choice,btn){
 if(state.locked)return;stopQuestionTimer();state.locked=true;const q=qcur(),bs=[...document.querySelectorAll(".answer")];bs.forEach(b=>b.disabled=true);const qd=q.d||2,base=qd<=1?10:qd===2?15:qd===3?20:25,gain=base*(state.double?2:1),ok=choice===q.ok;save.total++;state.totalAnswered++;recordProgress("answered",1);if(save.catStats[q.c])save.catStats[q.c].total++;
 if(ok){save.correct++;state.correct++;recordProgress("correct",1,q.c);gainVaultPoints(4+qd);if(save.catStats[q.c])save.catStats[q.c].correct++;state.streak++;recordProgress("streak",state.streak);save.bestStreak=Math.max(save.bestStreak,state.streak);gainXp(3+qd*2,.75);btn.classList.add("good");beep("good");flash("good");if(state.mode==="local"){state.scores[state.turn]+=gain;state.corrects[state.turn]++}else{state.score+=gain;if(state.mode==="tournament")state.rps+=gain}if(state.mode==="boss"||state.mode==="bossrush"){const stage=(state.bossIndex||0)+1,dmg=26+(q.d-1)*5+Math.floor(stage/4);state.hp=Math.max(0,state.hp-dmg);updateBoss();$("feedback").textContent=`✅ -${dmg} HP al jefe`}else $("feedback").textContent=`✅ Correcto · +${gain}`;if(state.streak>0&&state.streak%5===0){if(state.mode!=="local")state.score+=10;toast("🔥 Racha x"+state.streak+" · +10")}}
 else{state.streak=0;btn.classList.add("bad");bs[q.ok].classList.add("good");beep("bad");flash("bad");if(state.shield){state.shield=false;$("feedback").textContent="🛡️ Escudo activado. Era: "+q.a[q.ok]}else if(state.mode==="boss"||state.mode==="bossrush"){state.php--;$("feedback").textContent="❌ El jefe contraataca. Era: "+q.a[q.ok]}else if(state.mode==="local")$("feedback").textContent="❌ Era: "+q.a[q.ok];else{state.lives--;$("feedback").textContent="❌ Era: "+q.a[q.ok]}}
 if(ok)renderGameAvatarWidget("good");else renderGameAvatarWidget("bad");
 if(state.mode==="worldtour"&&q.explanation)$("feedback").textContent+=" · "+q.explanation;
 if(state.mode==="tournament")cpuTurn(q.d);checkAch();updateHUD();setTimeout(nextQ,state.mode==="worldtour"?1900:950)
}
function nextQ(){
 if(state.mode==="boss"||state.mode==="bossrush"){if(state.hp<=0)return finishBoss(true);if(state.php<=0)return showBossRevive();state.idx++;if(state.idx>=state.target){if(state.hp<=0)return finishBoss(true);const b=BOSS_LADDER[state.bossIndex||0];state.queue=state.queue.concat(buildGeneralQueue(Math.max(5,b.questions),`boss:extend:${state.bossIndex}:${Date.now()}`,b.cat,b.minD));state.target=state.queue.length}return renderQ()}
 if(state.mode==="worldtour"){state.idx++;if(state.lives<=0||state.idx>=state.target)return finishWorldTourStage();return renderQ()}
 if(state.mode==="local"){state.idx++;state.turn=state.turn===1?2:1;if(state.idx>=state.target)return endLocal();return renderQ()}
 if(state.mode==="tournament"){state.ri++;if(state.ri>=state.roundQ.length||state.lives<=0)return endRound();return renderQ()}
 state.idx++;if(state.lives<=0)return endGame();if(state.idx>=state.target)return endGame();renderQ()
}
function endRound(){stopQuestionTimer();$("qBox").classList.add("hidden");if(state.rps>state.rcs){state.pr++;toast("🟢 Ganaste la ronda")}else if(state.rps<state.rcs){state.cr++;toast("🔴 La CPU ganó la ronda")}else toast("🟡 Empate");state.round++;setTimeout(setupRound,700)}
function finishTournament(){const win=state.pr>state.cr;if(win){save.tournamentWins++;beep("win")}endGame(win?"🏆 Ganaste el torneo":"🤖 La CPU ganó",win?140:60,`Rondas: Tú ${state.pr} - ${state.cr} CPU`)}
function finishBoss(win){stopQuestionTimer();
 if(!win)return showBossRevive();
 beep("win");const b=BOSS_LADDER[state.bossIndex||0],c=b.cat;
 state.runScore=(state.runScore||0)+(state.score||0);state.runCorrect=(state.runCorrect||0)+(state.correct||0);
 if(!save.bosses.includes(c))save.bosses.push(c);
 save.bossBest=Math.max(save.bossBest||0,(state.bossIndex||0)+1);
 save.coins+=b.reward;if((state.bossIndex+1)%5===0)save.gems+=1;if((state.bossIndex+1)%3===0)addKey("gold",1);if((state.bossIndex+1)%5===0)earnChest("epic",1,"Boss milestone: Cofre Épico");recordProgress("bossWins",1);gainSeasonPoints(25);
 checkAch();persist();
 if(state.bossIndex>=BOSS_LADDER.length-1)return completeBossTower();
 const next=BOSS_LADDER[state.bossIndex+1];
 $("bossContinueTitle").textContent=`✅ ${b.name} derrotado`;
 $("bossContinueText").textContent=`Ganaste ${b.reward} monedas. Siguiente: ${next.name} (${next.cat}). Puedes continuar ahora o salir con tus recompensas.`;
 $("bossContinueModal").classList.remove("hidden")
}
function endLocal(){save.localGames++;const a=state.scores[1],b=state.scores[2],title=a===b?"🤝 Empate":a>b?`🏆 ${state.p1} gana`:`🏆 ${state.p2} gana`;state.score=Math.max(a,b);state.correct=state.corrects[1]+state.corrects[2];endGame(title,60,`${state.p1} ${a} - ${b} ${state.p2}`)}

function renderResultIdentity(won=false){ensureIdentityState();const el=$("resultAvatar");if(!el)return;el.innerHTML=identityAvatarMarkup(save.identity.baseAvatar||save.avatar,{identity:save.identity,customAvatar:save.customAvatar,equippedOutfit:save.equippedOutfit,selectedAura:save.selectedAura},won?"🏆":"💧");applyFrameToElement(el,save.selectedFrame||"none");applyIdentityBackground(el,{identity:save.identity});applyResultAnimation(el,{identity:save.identity},won);const t=$("resultIdentityTitle"),sub=$("resultIdentitySub");if(t)t.textContent=won?`🏆 ${findIdentityItem("victory",save.identity.victoryAnimation)?.name||"Victoria"}`:`🎭 ${findIdentityItem("defeat",save.identity.defeatAnimation)?.name||"Derrota"}`;if(sub)sub.textContent=`${selectedProfileTitleInfo().label} · ${profileBackgroundInfo(save.identity.profileBackground).name}`}
function renderRewardIdentity(){ensureIdentityState();const el=$("rewardAvatar");if(!el)return;el.innerHTML=identityAvatarMarkup(save.identity.baseAvatar||save.avatar,{identity:save.identity,customAvatar:save.customAvatar,equippedOutfit:save.equippedOutfit,selectedAura:save.selectedAura},"🎁");applyFrameToElement(el,save.selectedFrame||"none");applyIdentityBackground(el,{identity:save.identity});applyResultAnimation(el,{identity:save.identity},true)}
function endGame(title=null,prize=null,text=null){stopQuestionTimer();const identityWon=(title||"").includes("🏆")||(title||"").includes("Ganaste")||(state.correct||0)>=Math.ceil(Math.max(1,state.totalAnswered||state.target||1)*.7);renderGameAvatarWidget(identityWon?"win":"lose");save.games++;recordProgress("games",1);gainVaultPoints(18+Math.round((state.correct||0)*2));maybeGameChest();save.bestScore=Math.max(save.bestScore,state.score||0);if(state.mode==="survival")save.bestSurvival=Math.max(save.bestSurvival,state.totalAnswered);if(state.mode==="daily")save.daily=new Date().toISOString().slice(0,10);let earned=prize??Math.max(20,Math.floor((state.score||0)/4));if(!(title&&title.includes("Jefe derrotado")))save.coins+=earned;gainXp(Math.max(24,Math.floor((state.score||0)/2)+(state.correct||0)*2),.7);gainSeasonPoints(12+Math.round((state.correct||0)*2)+Math.round((state.score||0)/60));checkAch();persist();resultReturnPage="home";$("resultIcon").textContent=title&&title.includes("🏆")?"🏆":(state.score||0)>=180?"👑":"🎓";$("resultTitle").textContent=title||((state.score||0)>=180?"Partida legendaria":"Partida terminada");$("resultText").textContent=text||("Preguntas respondidas: "+state.totalAnswered);$("rScore").textContent=state.score||0;$("rCorrect").textContent=state.correct||0;$("rPrize").textContent=earned+" 🪙";renderResultIdentity(identityWon);$("resultModal").classList.remove("hidden");flushLevelUpCelebrations()}
function closeResult(){$("resultModal").classList.add("hidden");renderGameAvatarWidget("ready");page(resultReturnPage||"home");resultReturnPage="home"}
function checkAch(){ACH.forEach(a=>{if(a.check&&!save.ach[a.id]&&a.check(save)){save.ach[a.id]=true;toast("🏆 "+a.name)}});unlockAchievementAvatars();unlockFrames();renderAch()}
function use50(){if(state.locked)return;const qi=state.mode==="tournament"?state.ri:state.idx;if(state.fiftyQuestion===qi)return toast("Ya usaste 50/50 en esta pregunta");const free=!state.p50;if(!free&&save.coins<60)return toast("Necesitas 60 monedas");beep("power");if(free)state.p50=true;else{save.coins-=60;persist()}state.fiftyQuestion=qi;const q=qcur(),wrong=[0,1,2,3].filter(i=>i!==q.ok);shuffle(wrong).slice(0,2).forEach(i=>{const b=document.querySelector(`.answer[data-i="${i}"]`);if(b){b.disabled=true;b.style.opacity=.25}});$("p50").textContent="🌓 ELIMINAR 2 · 60 🪙";$("p50").disabled=true}
function useSkip(){if(state.pSkip||state.locked)return;ensureEconomyState();const useItem=(save.inv.reroll||0)>0;if(!useItem&&save.coins<90)return toast("Necesitas 90 monedas o un Cambio de pregunta");if(useItem)save.inv.reroll--;else{save.coins-=90;save.economyStats.coinsSpent+=90}stopQuestionTimer();beep("power");state.pSkip=true;persist();if(state.mode==="tournament"){state.ri++;if(state.ri>=state.roundQ.length)endRound();else renderQ()}else{state.idx++;if(state.idx>=state.target)endGame();else renderQ()}}
function useDouble(){if((state.pDouble&&!state.freeDouble)||state.locked)return;beep("power");if(state.freeDouble)state.freeDouble=false;else state.pDouble=true;state.double=true;$("pDouble").disabled=true;$("feedback").textContent="⚡ Doble puntaje activado"}
function useShield(){if(state.pShield||state.locked)return;ensureEconomyState();const useItem=(save.inv.shield||0)>0;if(!useItem&&save.coins<110)return toast("Necesitas 110 monedas o una Protección");if(useItem)save.inv.shield--;else{save.coins-=110;save.economyStats.coinsSpent+=110}beep("power");state.pShield=true;state.shield=true;persist();$("pShield").disabled=true;$("feedback").textContent="🛡️ Protección activada"}
function useExtraTime(){if(!state||state.locked)return;ensureEconomyState();const useItem=(save.inv.time||0)>0;if(!useItem&&save.coins<80)return toast("Necesitas 80 monedas o Tiempo extra");if(useItem)save.inv.time--;else{save.coins-=80;save.economyStats.coinsSpent+=80}questionDeadline=Math.max(questionDeadline,Date.now())+8000;beep("power");persist();$("feedback").textContent="⏱️ +8 segundos"}
function updateHUD(){const wl=$("walletLives");if(wl&&state)wl.textContent=(state.mode==="boss"||state.mode==="bossrush")?Math.max(0,state.php??3):Math.max(0,state.lives||0);if(!state)return;$("gScore").textContent=state.mode==="local"?state.scores[state.turn]:(state.score||0);$("gLives").textContent=(state.mode==="boss"||state.mode==="bossrush")?"❤️".repeat(Math.max(0,state.php??3)):"❤️".repeat(Math.max(0,state.lives||0));$("gStreak").textContent="x"+state.streak;$("gRival").textContent=state.mode==="tournament"?state.cpu:state.mode==="local"?state.scores[state.turn===1?2:1]:"—";$("gTurn").textContent=state.mode==="local"?(state.turn===1?state.p1:state.p2):save.name;if(state.mode==="tournament"){$("roundLabel").textContent=`Ronda ${Math.min(state.round,7)}/7`;renderRoundDots()}else $("roundLabel").textContent=`Pregunta ${Math.min((state.idx||0)+1,state.target||8)}/${state.target||8}`}
