/* ===== ONLINE MULTIPLAYER ALPHA 0.4.0 =====
   Uses the bundled Semantropic Node server via HTTP + Server-Sent Events.
   Single-player remains fully functional without the server.
*/
let mp={code:null,playerId:null,source:null,hostId:null,mode:null,lastQuestion:null,selected:null,timer:null,connected:false};
function mpPlayerId(){
 if(mp.playerId)return mp.playerId;
 let id="";
 try{id=localStorage.getItem("semantropicOnlinePlayerId")||""}catch(e){}
 if(!id){id="p_"+Math.random().toString(36).slice(2)+Date.now().toString(36);try{localStorage.setItem("semantropicOnlinePlayerId",id)}catch(e){}}
 mp.playerId=id;return id
}
function mpModeName(mode){return mode==="battle"?"⚔️ Batalla":mode==="ranked"?"🏆 Clasificatorio":mode==="teams"?"🤝 Equipos 2 vs 2":mode==="blitz"?"⚡ Blitz":mode==="marathon"?"🏃 Maratón":"🎯 Competencia"}
function mpName(){
 const value=(save.name||onlineProfile?.name||onlineAccountUsername||"Jugador").trim().slice(0,18);
 const el=$("mpName");if(el)el.value=value;return value||"Jugador"
}
async function mpRequest(path,data=null){
 const opts=data?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)}:{};
 const r=await fetch(path,opts);let out={};try{out=await r.json()}catch(e){}
 if(!r.ok){const err=new Error(out.error||"Error de servidor");err.payload=out;throw err}return out
}
async function renderMultiplayerPage(){
 const name=$("mpName");if(name)name.value=save.name||onlineAccountUsername||"Jugador";
 renderAccountUI();
 if(!accountLoggedIn){showAuthGate("Inicia sesión para continuar.");return}
 if(!onlineProfileReady&&onlineAccountUsername&&onlineProfileToken)await refreshAccountSession();
 const status=$("mpServerStatus");
 if(location.protocol==="file:"){
  status.textContent="🔴 Online requiere iniciar server.js";status.className="pill bad";
  mp.connected=false;renderMpRanking([]);return
 }
 try{
  const s=await mpRequest("/api/status");
  mp.connected=true;status.textContent=`🟢 Servidor online · ${s.rooms||0} salas`;status.className="pill ok";
  const rank=await mpRequest("/api/ranking");renderMpRanking(rank.ranking||[])
 }catch(e){
  mp.connected=false;status.textContent="🔴 Servidor no disponible";status.className="pill bad";
  renderMpRanking([])
 }
}
async function mpCreate(mode){
 if(!mp.connected){await renderMultiplayerPage();if(!mp.connected)return toast("Inicia el servidor online incluido en el ZIP")}
 if(!accountLoggedIn)return toast("Inicia sesión con tu cuenta Semantropic para jugar online");
 if(!onlineProfileReady)await refreshAccountSession();if(!onlineProfileReady||!onlineProfileToken)return toast("No se pudo verificar tu perfil online. Inicia sesión nuevamente.")
 try{
  await syncOnlineProfile();
  const r=await mpRequest("/api/multi/create",{playerId:mpPlayerId(),name:mpName(),mode,profileToken:onlineProfileToken});
  mp.code=r.code;mp.mode=mode;mp.hostId=mpPlayerId();mpConnect();toast("Sala creada: "+r.code)
 }catch(e){toast(e.message)}
}
async function mpJoin(){
 if(!mp.connected){await renderMultiplayerPage();if(!mp.connected)return toast("Servidor online no disponible")}
 if(!accountLoggedIn)return toast("Inicia sesión con tu cuenta Semantropic para jugar online");
 if(!onlineProfileReady)await refreshAccountSession();if(!onlineProfileReady||!onlineProfileToken)return toast("No se pudo verificar tu perfil online. Inicia sesión nuevamente.")
 const code=($("mpRoomCodeInput")?.value||"").trim().toUpperCase();
 if(code.length<4)return toast("Escribe el código de la sala");
 try{
  await syncOnlineProfile();
  const r=await mpRequest("/api/multi/join",{code,playerId:mpPlayerId(),name:mpName(),profileToken:onlineProfileToken});
  mp.code=code;mp.mode=r.mode;mp.hostId=r.hostId;mpConnect()
 }catch(e){toast(e.message)}
}

let mpReactionCooldownUntil=0;
function renderMpMyIdentity(playEntry=false){ensureIdentityState();const a=$("mpMyAvatar");if(!a)return;a.innerHTML=identityAvatarMarkup(save.identity.baseAvatar||save.avatar,{identity:save.identity,customAvatar:save.customAvatar,equippedOutfit:save.equippedOutfit,selectedAura:save.selectedAura});applyFrameToElement(a,save.selectedFrame||"none");applyIdentityBackground(a,{identity:save.identity});if(playEntry)applyEntryAnimation(a,{identity:save.identity});const t=$("mpMyIdentityTitle"),s=$("mpMyIdentitySub");if(t)t.textContent=selectedProfileTitleInfo().label;if(s)s.textContent=`${save.identity.equippedEmotes.length}/6 emotes · ${save.identity.equippedSprays.length}/3 sprays`}
function renderMpReactionToolbar(){const box=$('mpReactionToolbar');if(!box)return;ensureIdentityState();box.innerHTML='';(save.identity.equippedEmotes||[]).forEach(id=>{const e=EMOTES_COLLECTION.find(x=>x.id===id);if(!e)return;const b=document.createElement('button');b.title=e.name;b.textContent=e.emoji;b.onclick=()=>mpSendReaction('emote',id);box.appendChild(b)});(save.identity.equippedSprays||[]).forEach(id=>{const s=SPRAYS_COLLECTION.find(x=>x.id===id);if(!s)return;const b=document.createElement('button');b.title='Spray: '+s.name;b.textContent=s.emoji;b.onclick=()=>mpSendReaction('spray',id);box.appendChild(b)});if(!box.children.length)box.innerHTML='<span class="muted">Equipa emotes o sprays en Estudio de Avatar.</span>'}
async function mpSendReaction(kind,id){if(!mp.code||Date.now()<mpReactionCooldownUntil)return;mpReactionCooldownUntil=Date.now()+1800;try{await syncOnlineProfile();await mpRequest('/api/multi/reaction',{code:mp.code,playerId:mpPlayerId(),profileToken:onlineProfileToken,kind,id})}catch(e){toast(e.message)}}
function showMpReaction(msg){if(msg.kind==='spray'){const item=SPRAYS_COLLECTION.find(x=>x.id===msg.id);if(!item)return;const d=document.createElement('div');d.className='mp-spray-pop';d.textContent=item.emoji;document.body.appendChild(d);setTimeout(()=>d.remove(),2700);return}const item=EMOTES_COLLECTION.find(x=>x.id===msg.id);if(!item)return;const d=document.createElement('div');d.className='mp-reaction-pop';d.innerHTML=`<div class="rx-emoji">${item.emoji}</div><b>${msg.name||'Jugador'}</b><small>${item.name}</small>`;document.body.appendChild(d);if(['crown','fire','impact'].includes(item.id))beep('power');setTimeout(()=>d.remove(),2400)}
function mpConnect(){
 if(mp.source)mp.source.close();
 mp.source=new EventSource(`/api/multi/stream?code=${encodeURIComponent(mp.code)}&playerId=${encodeURIComponent(mpPlayerId())}`);
 mp.source.onmessage=e=>{try{mpHandle(JSON.parse(e.data))}catch(err){}};
 mp.source.onerror=()=>{const s=$("mpServerStatus");if(s){s.textContent="🟠 Reconectando…";s.className="pill"}}
}
function mpHandle(msg){
 if(msg.type==="lobby"){mp.hostId=msg.hostId;mp.mode=msg.mode;showMpLobby(msg);return}
 if(msg.type==="question"){showMpQuestion(msg);return}
 if(msg.type==="players"){renderMpScoreboard(msg.players||[]);return}
 if(msg.type==="reveal"){showMpReveal(msg);return}
 if(msg.type==="matchEnd"){showMpResult(msg);return}
 if(msg.type==="reaction"){showMpReaction(msg);return}
 if(msg.type==="error"){toast(msg.message||"Error online");return}
 if(msg.type==="roomClosed"){toast(msg.message||"La sala se cerró");mpResetView();return}
 if(msg.type==="kicked"){toast(msg.message||"Fuiste expulsado de la sala");mpResetView();return}
}
function showMpLobby(msg){
 $("mpSetup").classList.add("hidden");$("mpLobby").classList.remove("hidden");$("mpMatch").classList.add("hidden");$("mpResult").classList.add("hidden");
 $("mpRoomCode").textContent=msg.code;$("mpRoomMode").textContent=mpModeName(msg.mode);mp.mode=msg.mode;
 const isHost=msg.hostId===mpPlayerId(),box=$("mpLobbyPlayers");box.innerHTML="";
 (msg.players||[]).forEach(p=>{
  const d=document.createElement("div");d.className="mp-player "+(p.id===mpPlayerId()?"me ":"")+(p.id===msg.hostId?"host":"");d.onclick=e=>{if(!e.target.closest("button"))openPublicProfile(p.id)};
  const main=document.createElement("div");main.className="mp-player-main";const av=document.createElement("div");av.className="mp-mini-avatar";av.innerHTML=profileAvatarHTML(p);applyFrameToElement(av,p.frameId);applyIdentityBackground(av,p.profileMeta||{});applyEntryAnimation(av,p.profileMeta||{});const copy=document.createElement("div");copy.className="mp-player-copy";copy.innerHTML=`<b>${p.name}${p.team?` <span class="team-pill team-${p.team.toLowerCase()}">Equipo ${p.team}</span>`:""}</b><small>${achievementLabel(p.featuredAchievement)}</small>`;main.appendChild(av);main.appendChild(copy);d.appendChild(main);
  const controls=document.createElement("div");controls.className="mp-player-controls";const status=document.createElement("span");status.textContent=p.online?"🟢":"⚪";controls.appendChild(status);
  if(msg.mode==="teams"&&p.id===mpPlayerId()){const sw=document.createElement("div");sw.className="team-switch";["A","B"].forEach(t=>{const b=document.createElement("button");b.className="btn secondary";b.textContent=`Equipo ${t}`;b.disabled=p.team===t;b.onclick=e=>{e.stopPropagation();mpSetTeam(t)};sw.appendChild(b)});controls.appendChild(sw)}
  if(isHost&&p.id!==msg.hostId){const kick=document.createElement("button");kick.className="btn danger mp-kick-btn";kick.textContent="EXPULSAR";kick.onclick=e=>{e.stopPropagation();mpKick(p.id,p.name)};controls.appendChild(kick)}d.appendChild(controls);box.appendChild(d)
 });
 const start=$("mpStartBtn");start.classList.toggle("hidden",!isHost);const counts=(msg.players||[]).reduce((a,p)=>{if(p.team)a[p.team]=(a[p.team]||0)+1;return a},{A:0,B:0});start.disabled=msg.mode==="teams"?((msg.players||[]).length!==4||counts.A!==2||counts.B!==2):(msg.players||[]).length<2;start.textContent=msg.mode==="teams"?"COMENZAR 2 VS 2":"COMENZAR PARTIDA";
 const info=document.querySelector("#mpLobby .card > p.muted");if(info)info.textContent=msg.mode==="teams"?"Se necesitan exactamente 4 jugadores: 2 en Equipo A y 2 en Equipo B. Cada jugador puede cambiar de equipo antes de comenzar.":"Comparte el código con 1 a 3 compañeros. El anfitrión puede comenzar desde 2 jugadores.";
 const close=$("mpCloseRoomBtn");if(close)close.classList.toggle("hidden",!isHost)
}

async function mpKick(targetId,name){
 if(!mp.code||mp.hostId!==mpPlayerId())return;
 if(!confirm(`¿Expulsar a ${name||"este jugador"} de la sala?`))return;
 try{await mpRequest("/api/multi/kick",{code:mp.code,playerId:mpPlayerId(),targetId});toast("Jugador expulsado")}catch(e){toast(e.message)}
}
async function mpCloseRoom(){
 if(!mp.code||mp.hostId!==mpPlayerId())return;
 if(!confirm("¿Cerrar esta sala para todos los jugadores?"))return;
 try{await mpRequest("/api/multi/close",{code:mp.code,playerId:mpPlayerId()});toast("Sala cerrada");mpResetView()}catch(e){toast(e.message)}
}

async function mpSetTeam(team){try{await mpRequest("/api/multi/team",{code:mp.code,playerId:mpPlayerId(),team})}catch(e){toast(e.message)}}
async function mpStart(){
 try{await mpRequest("/api/multi/start",{code:mp.code,playerId:mpPlayerId()})}catch(e){toast(e.message)}
}
function stopMpTimer(){if(mp.timer){clearInterval(mp.timer);mp.timer=null}}
function startMpTimer(endsAt,durationMs=15000){
 stopMpTimer();
 const update=()=>{
  const left=Math.max(0,endsAt-Date.now()),pct=Math.max(0,Math.min(100,left/Math.max(1000,durationMs)*100)),sec=Math.ceil(left/1000);
  const bar=$("mpTimerBar"),txt=$("mpTimerText");if(bar){bar.style.width=pct+"%";bar.classList.toggle("warning",sec<=5)}if(txt)txt.textContent=sec;
  if(sec<=3&&left>0){const a=$("mpMyAvatar");if(a)a.classList.add("mood-nervous")}
  if(left<=0)stopMpTimer()
 };
 update();mp.timer=setInterval(update,100)
}
function showMpQuestion(msg){
 mp.lastQuestion=msg;mp.selected=null;renderMpMyIdentity(Number(msg.round||1)===1);renderMpReactionToolbar();
 $("mpSetup").classList.add("hidden");$("mpLobby").classList.add("hidden");$("mpMatch").classList.remove("hidden");$("mpResult").classList.add("hidden");
 $("mpModeMini").textContent=mpModeName(msg.mode);$("mpRoundMini").textContent=`${msg.round}/${msg.totalRounds}`;$("mpCategory").textContent=(CATS[msg.category]||"🎯")+" "+msg.category;
 $("mpQuestion").textContent=msg.question;$("mpFeedback").textContent="";renderMpScoreboard(msg.players||[]);
 const box=$("mpAnswers");box.innerHTML="";
 msg.answers.forEach((a,i)=>{const b=document.createElement("button");b.className="answer";b.dataset.i=i;b.textContent=a;b.onclick=()=>mpAnswer(i);box.appendChild(b)});
 startMpTimer(msg.endsAt,msg.durationMs||15000)
}
async function mpAnswer(i){
 if(mp.selected!==null||!mp.lastQuestion)return;
 mp.selected=i;[...document.querySelectorAll("#mpAnswers .answer")].forEach(b=>b.disabled=true);
 const chosen=document.querySelector(`#mpAnswers .answer[data-i="${i}"]`);if(chosen)chosen.style.opacity=.75;
 $("mpFeedback").textContent="🔒 Respuesta enviada. Esperando a los demás…";
 try{await mpRequest("/api/multi/answer",{code:mp.code,playerId:mpPlayerId(),seq:mp.lastQuestion.seq,answer:i})}catch(e){toast(e.message)}
}
function renderMpScoreboard(players){
 const box=$("mpScoreboard");if(!box)return;box.innerHTML="";const ts=$("mpTeamSummary");
 if(mp.mode==="teams"){let a=0,b=0;players.forEach(p=>{if(p.team==="A")a+=p.score;if(p.team==="B")b+=p.score});ts.classList.remove("hidden");ts.innerHTML=`<div class="team-score-card team-a"><span>Equipo A</span><b>${a}</b></div><div class="team-vs">VS</div><div class="team-score-card team-b"><span>Equipo B</span><b>${b}</b></div>`}else ts.classList.add("hidden");
 [...players].sort((a,b)=>b.score-a.score).forEach(p=>{const d=document.createElement("div");d.className="mp-score-player "+(p.eliminated?"out ":"")+(p.team?`team-${p.team.toLowerCase()}-score`:"");d.onclick=()=>openPublicProfile(p.id);const bgid=p.profileMeta?.identity?.profileBackground||"nebula",mood=p.lastCorrect===true?"mood-good":p.lastCorrect===false&&p.answered?"mood-bad":"",avatar=`<div class="mp-mini-avatar ${profileFrameClass(p)} profile-bg-${bgid} ${mood}" style="margin:0 auto 5px">${profileAvatarHTML(p)}</div>`;d.innerHTML=`${avatar}<b>${p.name}${p.team?` · ${p.team}`:""}</b><span>${p.score} pts</span><small>${mp.mode==="battle"?"❤️".repeat(Math.max(0,p.lives)):(p.answered?"✅ Respondió":"⌛ Pensando")}</small>`;box.appendChild(d)})
}
function showMpReveal(msg){
 stopMpTimer();const answers=[...document.querySelectorAll("#mpAnswers .answer")];
 answers.forEach((b,i)=>{b.disabled=true;if(i===msg.correctIndex)b.classList.add("good");else if(i===mp.selected)b.classList.add("bad")});
 const mpOk=mp.selected===msg.correctIndex;$("mpFeedback").textContent=mpOk?"✅ ¡Correcto!":"❌ Respuesta revelada";const myAv=$("mpMyAvatar");if(myAv){myAv.classList.remove("mood-nervous");myAv.classList.add(mpOk?"mood-good":"mood-bad");setTimeout(()=>myAv.classList.remove("mood-good","mood-bad"),700)}
 renderMpScoreboard(msg.players||[])
}
function showMpResult(msg){
 stopMpTimer();$("mpMatch").classList.add("hidden");$("mpLobby").classList.add("hidden");$("mpResult").classList.remove("hidden");
 const me=(msg.results||[]).find(r=>r.id===mpPlayerId()),winner=(msg.results||[])[0];
 if(msg.mode==="teams")$("mpResultTitle").textContent=msg.winningTeam?`🏆 Equipo ${msg.winningTeam} gana · ${msg.teamScores?.A||0} - ${msg.teamScores?.B||0}`:"🤝 Empate por equipos";else $("mpResultTitle").textContent=me&&me.place===1?"🏆 ¡Ganaste!":`🏆 ${winner?.name||"Partida"} gana`;
 const box=$("mpResultTable");box.innerHTML="";(msg.results||[]).forEach(r=>{const d=document.createElement("div");d.className="mp-result-row";d.style.cursor="pointer";d.onclick=()=>openPublicProfile(r.id);const a=document.createElement('div');a.className='mp-mini-avatar';a.innerHTML=profileAvatarHTML(r);applyFrameToElement(a,r.frameId);applyIdentityBackground(a,r.profileMeta||{});applyResultAnimation(a,r.profileMeta||{},r.place===1||(msg.mode==='teams'&&msg.winningTeam&&r.team===msg.winningTeam));d.appendChild(a);const pos=document.createElement('b');pos.textContent='#'+r.place;const nm=document.createElement('span');nm.textContent=r.name+(r.team?` · Equipo ${r.team}`:'');const sc=document.createElement('span');sc.textContent=r.score+' pts';const rt=document.createElement('span');rt.className='mp-rating-col';rt.textContent=`${r.rating??1000}${r.delta?` (${r.delta>0?'+':''}${r.delta})`:''}`;d.append(pos,nm,sc,rt);box.appendChild(d)});
 if(me?.newAchievements?.length){me.newAchievements.forEach(id=>{save.ach[id]=true;const a=achievementInfo(id);if(a)toast(`🏆 Logro online: ${a.name}`)});persist()}renderMpRanking(msg.ranking||[]);refreshOnlineProfile().then(()=>{if(me){recordProgress("games",1);persist();renderEngagementHome()}})
}
function renderMpRanking(rows){
 const body=$("mpRankingBody");if(!body)return;body.innerHTML="";if(!rows.length){body.innerHTML='<tr><td colspan="7" class="muted">Aún no hay jugadores en el ranking.</td></tr>';return}
 rows.slice(0,30).forEach((r,i)=>{const tr=document.createElement("tr");tr.style.cursor="pointer";tr.onclick=()=>openPublicProfile(r.id);tr.innerHTML=`<td>${i+1}</td><td><div class="rank-player"><div class="mp-mini-avatar ${profileFrameClass(r)}">${profileAvatarHTML(r)}</div><div><b>${r.name}</b><small class="profile-title">${achievementLabel(r.featuredAchievement)}</small></div></div></td><td><b>${r.rating}</b></td><td>${r.wins}</td><td>${r.losses||0}</td><td>${r.games}</td><td>${r.totalScore}</td>`;body.appendChild(tr)})
}
async function mpLeave(){
 if(mp.code){try{await mpRequest("/api/multi/leave",{code:mp.code,playerId:mpPlayerId()})}catch(e){}}
 mpResetView()
}
function mpResetView(){
 stopMpTimer();if(mp.source){mp.source.close();mp.source=null}
 mp.code=null;mp.lastQuestion=null;mp.selected=null;
 $("mpSetup").classList.remove("hidden");$("mpLobby").classList.add("hidden");$("mpMatch").classList.add("hidden");$("mpResult").classList.add("hidden");
 renderMultiplayerPage()
}


async function adminWorldTourComplete(){const targetId=adminSelectedId;if(!targetId)return toast("Selecciona un jugador");if(!confirm("¿Completar World Tour para este perfil de prueba?"))return;try{const r=await adminRequest("/api/admin/player/world-tour",{playerId:targetId,action:"complete"});applyAdminProfileIfCurrent(targetId,r.profile);toast("🌍 World Tour completado para pruebas");adminRefresh()}catch(e){toast(e.message)}}
async function adminWorldTourReset(){const targetId=adminSelectedId;if(!targetId)return toast("Selecciona un jugador");if(!confirm("¿Reiniciar solo el progreso World Tour de este perfil?"))return;try{const r=await adminRequest("/api/admin/player/world-tour",{playerId:targetId,action:"reset"});applyAdminProfileIfCurrent(targetId,r.profile);toast("🧭 World Tour reiniciado");adminRefresh()}catch(e){toast(e.message)}}
function renderAdminRooms(){
 const body=$('adminRoomsBody');if(!body)return;body.innerHTML='';
 if(!adminRooms.length){body.innerHTML='<tr><td colspan="6" class="muted">No hay salas activas.</td></tr>';return}
 adminRooms.forEach(r=>{
  const tr=document.createElement('tr');
  const chips=(r.players||[]).map(p=>`<span class="admin-room-chip">${p.name}${p.id===r.hostId?' 👑':''}${p.id!==r.hostId?` <button title="Expulsar" onclick="event.stopPropagation();adminKickFromRoom('${r.code}','${p.id}',${JSON.stringify(p.name)})">✕</button>`:''}</span>`).join('');
  tr.innerHTML=`<td><b>${r.code}</b><div class="muted">${Math.max(0,Math.floor((Date.now()-r.createdAt)/60000))} min</div></td><td>${mpModeName(r.mode)}</td><td>${r.status==='playing'?'🟢 Jugando':r.status==='finished'?'🏁 Terminada':'🟡 Lobby'}</td><td>${r.hostName||'—'}</td><td><div class="admin-room-players">${chips}</div></td><td><div class="admin-room-actions"><button class="btn danger mp-kick-btn" onclick="adminCloseRoom('${r.code}')">CERRAR</button></div></td>`;
  body.appendChild(tr)
 })
}
async function adminCloseRoom(code){
 if(!confirm(`¿Cerrar la sala ${code} para todos?`))return;
 try{await adminRequest('/api/admin/room/close',{code});toast(`🗑️ Sala ${code} cerrada`);adminRefresh()}catch(e){toast(e.message)}
}
async function adminKickFromRoom(code,targetId,name){
 if(!confirm(`¿Expulsar a ${name||'este jugador'} de la sala ${code}?`))return;
 try{await adminRequest('/api/admin/room/kick',{code,targetId});toast('Jugador expulsado');adminRefresh()}catch(e){toast(e.message)}
}

/* ---------- GENERAL TRIVIA PROCEDURAL FACTORIES ---------- */
const GEN_PAIRS={
 Historia:[
  ["caída del Muro de Berlín","1989"],["inicio de la Primera Guerra Mundial","1914"],["fin de la Segunda Guerra Mundial","1945"],["Revolución Francesa","1789"],["llegada de Colón a América","1492"],["Primera Junta de Gobierno de Chile","1810"],["independencia de Estados Unidos","1776"],["caída de Constantinopla","1453"],["llegada del ser humano a la Luna","1969"],["disolución de la Unión Soviética","1991"]],
 Arte:[["La noche estrellada","Vincent van Gogh"],["Mona Lisa","Leonardo da Vinci"],["Guernica","Pablo Picasso"],["La persistencia de la memoria","Salvador Dalí"],["El grito","Edvard Munch"],["Las meninas","Diego Velázquez"],["El nacimiento de Venus","Sandro Botticelli"],["Nenúfares","Claude Monet"]],
 Cine:[["Jurassic Park","Steven Spielberg"],["Titanic","James Cameron"],["Pulp Fiction","Quentin Tarantino"],["Inception","Christopher Nolan"],["Gladiator","Ridley Scott"],["The Lord of the Rings: The Fellowship of the Ring","Peter Jackson"],["Alien","Ridley Scott"],["E.T.","Steven Spielberg"]],
 Geografía:[["Chile","Santiago"],["Argentina","Buenos Aires"],["Perú","Lima"],["Japón","Tokio"],["Canadá","Ottawa"],["Australia","Canberra"],["Italia","Roma"],["Francia","París"],["Egipto","El Cairo"],["Brasil","Brasilia"],["México","Ciudad de México"],["Corea del Sur","Seúl"]],
 Gaming:[["Mario","Super Mario"],["Link","The Legend of Zelda"],["Leon S. Kennedy","Resident Evil"],["Master Chief","Halo"],["Kratos","God of War"],["Sonic","Sonic the Hedgehog"],["Geralt de Rivia","The Witcher"],["Lara Croft","Tomb Raider"],["Arthur Morgan","Red Dead Redemption 2"],["Artyom","Metro"]]
};
const SCI_GENERAL=[["símbolo químico Fe","Hierro",["Flúor","Francio","Fermio"]],["planeta más grande del Sistema Solar","Júpiter",["Saturno","Urano","Neptuno"]],["partícula con carga negativa","Electrón",["Protón","Neutrón","Fotón"]],["unidad SI de fuerza","Newton",["Joule","Watt","Volt"]],["gas más abundante de la atmósfera terrestre","Nitrógeno",["Oxígeno","Argón","CO₂"]],["planeta rojo","Marte",["Venus","Mercurio","Júpiter"]],["órgano más grande del cuerpo humano","Piel",["Hígado","Pulmón","Intestino"]]];
const SPORT_GENERAL=[["ace","Tenis",["Boxeo","Rugby","Ciclismo"]],["triple de 3 puntos","Baloncesto",["Tenis","Golf","Voleibol"]],["ippon","Judo",["Natación","Fútbol","Béisbol"]],["home run","Béisbol",["Rugby","Tenis","Boxeo"]],["scrum","Rugby",["Golf","Judo","Atletismo"]],["birdie","Golf",["Baloncesto","Voleibol","Boxeo"]]];

const TECH_GENERAL=[["CPU","unidad central de procesamiento",["RAM","SSD","GPU"]],["RAM","memoria temporal",["HDD","CPU","USB"]],["DNS","traduce dominios a direcciones IP",["HTML","GPU","BIOS"]],["VPN","red privada virtual",["CPU","URL","SSD"]],["HTML","estructura de una página web",["CSS","SQL","DNS"]],["CSS","estilos visuales de una web",["HTTP","RAM","BIOS"]],["Git","control de versiones",["Wi‑Fi","HDMI","NFC"]],["phishing","engaño para robar credenciales",["backup","cache","compilación"]],["SSD","almacenamiento de estado sólido",["RAM","CPU","router"]],["Bluetooth","conexión inalámbrica de corto alcance",["HDMI","Ethernet","BIOS"]]];
const NATURE_GENERAL=[["mamífero más grande","Ballena azul",["Elefante africano","Jirafa","Oso polar"]],["animal terrestre más rápido","Guepardo",["León","Lobo","Caballo"]],["relación donde ambas especies se benefician","Mutualismo",["Parasitismo","Depredación","Competencia"]],["cambio de vapor a líquido","Condensación",["Evaporación","Fusión","Sublimación"]],["capa donde ocurre la mayor parte del tiempo meteorológico","Troposfera",["Estratosfera","Manto","Núcleo"]],["gas más abundante de la atmósfera","Nitrógeno",["Oxígeno","Argón","CO₂"]],["roca fundida bajo la superficie","Magma",["Lava","Basalto","Granito"]],["organismo que produce su propio alimento","Productor",["Consumidor","Descomponedor","Parásito"]],["hábitat del oso polar","Ártico",["Sahara","Amazonía","Andes"]],["animal con ocho brazos","Pulpo",["Calamar","Cangrejo","Medusa"]]];
const MUSIC_GENERAL=[["tempo","velocidad de una pieza",["melodía","armonía","timbre"]],["crescendo","aumento gradual de intensidad",["diminuendo","staccato","legato"]],["violín","cuerda frotada",["viento metal","percusión","teclado"]],["trompeta","viento metal",["cuerda","percusión","teclado"]],["La flauta mágica","Mozart",["Beethoven","Vivaldi","Chopin"]],["Las cuatro estaciones","Vivaldi",["Mozart","Bach","Ravel"]],["Boléro","Ravel",["Bizet","Verdi","Grieg"]],["jazz","Estados Unidos",["Jamaica","Brasil","España"]],["reggae","Jamaica",["Argentina","Italia","Alemania"]],["pentagrama","cinco líneas para escribir música",["instrumento de viento","tipo de acorde","escala de volumen"]]];
function genGeneral(cat){const scope=`proc:general:${cat}`;
 if(cat==="Historia"){const pairs=GEN_PAIRS.Historia,f=pick(pairs),form=rnd(1,2);if(form===1)return makeProc(scope,{c:cat,d:2,q:`¿En qué año ocurrió la ${f[0]}?`,...uniqueOptions(f[1],pairs.map(x=>x[1]))});const same=shuffle(pairs.filter(x=>x!==f)).slice(0,3).map(x=>x[0]);return makeProc(scope,{c:cat,d:2,q:`¿Qué hecho histórico se asocia con el año ${f[1]}?`,...uniqueOptions(f[0],same)})}
 if(cat==="Arte"){const pairs=GEN_PAIRS.Arte,f=pick(pairs),form=rnd(1,2);if(form===1)return makeProc(scope,{c:cat,d:2,q:`¿Quién creó la obra “${f[0]}”?`,...uniqueOptions(f[1],pairs.map(x=>x[1]))});const same=shuffle(pairs.filter(x=>x[1]!==f[1])).slice(0,3).map(x=>x[0]);return makeProc(scope,{c:cat,d:2,q:`¿Cuál de estas obras está asociada con ${f[1]}?`,...uniqueOptions(f[0],same)})}
 if(cat==="Cine"){const pairs=GEN_PAIRS.Cine,f=pick(pairs),form=rnd(1,2);if(form===1)return makeProc(scope,{c:cat,d:2,q:`¿Quién dirigió “${f[0]}”?`,...uniqueOptions(f[1],pairs.map(x=>x[1]))});const same=shuffle(pairs.filter(x=>x[1]!==f[1])).slice(0,3).map(x=>x[0]);return makeProc(scope,{c:cat,d:2,q:`¿Cuál de estas películas fue dirigida por ${f[1]}?`,...uniqueOptions(f[0],same)})}
 if(cat==="Geografía"){const pairs=GEN_PAIRS.Geografía,f=pick(pairs),form=rnd(1,2);if(form===1)return makeProc(scope,{c:cat,d:1,q:`¿Cuál es la capital de ${f[0]}?`,...uniqueOptions(f[1],pairs.map(x=>x[1]))});const countries=shuffle(pairs.filter(x=>x!==f)).slice(0,3).map(x=>x[0]);return makeProc(scope,{c:cat,d:2,q:`${f[1]} es la capital de…`,...uniqueOptions(f[0],countries)})}
 if(cat==="Gaming"){const pairs=GEN_PAIRS.Gaming,f=pick(pairs),form=rnd(1,2);if(form===1)return makeProc(scope,{c:cat,d:1,q:`¿En qué saga o juego aparece ${f[0]}?`,...uniqueOptions(f[1],pairs.map(x=>x[1]))});const chars=shuffle(pairs.filter(x=>x!==f)).slice(0,3).map(x=>x[0]);return makeProc(scope,{c:cat,d:2,q:`¿Qué personaje está asociado con “${f[1]}”?`,...uniqueOptions(f[0],chars)})}
 if(cat==="Ciencia"){const f=pick(SCI_GENERAL);return makeProc(scope,{c:cat,d:2,q:`En ciencias, ¿qué respuesta corresponde a “${f[0]}”?`,...uniqueOptions(f[1],f[2])})}
 if(cat==="Deportes"){const f=pick(SPORT_GENERAL);return makeProc(scope,{c:cat,d:2,q:`¿Con qué deporte se relaciona normalmente el término “${f[0]}”?`,...uniqueOptions(f[1],f[2])})}
 if(cat==="Tecnología"){const f=pick(TECH_GENERAL);return makeProc(scope,{c:cat,d:2,conceptKey:`tech:${f[0]}`,q:`En tecnología, ¿qué corresponde a “${f[0]}”?`,...uniqueOptions(f[1],f[2])})}
 if(cat==="Naturaleza"){const f=pick(NATURE_GENERAL);return makeProc(scope,{c:cat,d:2,conceptKey:`nature:${f[0]}`,q:`En naturaleza, ¿qué corresponde a “${f[0]}”?`,...uniqueOptions(f[1],f[2])})}
 if(cat==="Música"){const f=pick(MUSIC_GENERAL);return makeProc(scope,{c:cat,d:2,conceptKey:`music:${f[0]}`,q:`En música, ¿qué corresponde a “${f[0]}”?`,...uniqueOptions(f[1],f[2])})}
 return null
}
function desiredDifficulty(){return save.settings.difficulty==="easy"?1:save.settings.difficulty==="medium"?2:save.settings.difficulty==="hard"?3:null}
function buildGeneralQueue(count,scope,forcedCat=null,minDifficulty=null){
 const cats=forcedCat?[forcedCat]:Object.keys(CATS),result=[],wantD=desiredDifficulty(),targetD=minDifficulty||wantD;
 for(let i=0;i<count;i++){
  const cat=forcedCat||cats[i%cats.length],useProc=(i%5===4);
  let pool=filterBank().filter(q=>q.c===cat);
  if(targetD)pool=pool.filter(q=>q.d>=targetD);
  if(!pool.length)pool=BANK.filter(q=>q.c===cat);
  if(useProc){
   const got=generateUnique(`${scope}:proc:${cat}`,1,()=>{const q=genGeneral(cat);if(!q)return null;if(targetD)q.d=Math.max(q.d,targetD);q.conceptKey=q.conceptKey||`general:${cat}:${q.q.toLowerCase()}`;return q});
   if(got.length){result.push(got[0]);continue}
  }
  const got=drawGeneralDeck(pool,1,`deck:${cat}:${targetD||"mix"}`);
  if(got.length)result.push(got[0])
 }
 quietPersist();return shuffle(result).slice(0,count)
}

const QUESTION_TIME_SECONDS=15;
function stopQuestionTimer(){
 if(questionTimer){clearInterval(questionTimer);questionTimer=null}
 questionDeadline=0
}
function updateQuestionTimerUI(msLeft){
 const total=QUESTION_TIME_SECONDS*1000,pct=Math.max(0,Math.min(100,(msLeft/total)*100));
 const seconds=Math.max(0,Math.ceil(msLeft/1000)),bar=$("qTimerBar"),txt=$("qTimerText");
 if(bar){bar.style.width=pct+"%";bar.classList.toggle("warning",seconds<=5)}
 if(txt){txt.textContent=seconds;txt.classList.toggle("warning",seconds<=5)}
 if(seconds<=3&&state&&!state.locked)renderGameAvatarWidget("nervous")
}
function startQuestionTimer(){
 stopQuestionTimer();
 questionDeadline=Date.now()+QUESTION_TIME_SECONDS*1000;
 updateQuestionTimerUI(QUESTION_TIME_SECONDS*1000);
 questionTimer=setInterval(()=>{
  if(!state||state.locked){return}
  const left=questionDeadline-Date.now();
  updateQuestionTimerUI(left);
  if(left<=0){stopQuestionTimer();timeoutQuestion()}
 },100)
}
function timeoutQuestion(){
 if(!state||state.locked)return;
 state.locked=true;const q=qcur();if(!q)return;
 const bs=[...document.querySelectorAll(".answer")];bs.forEach(b=>b.disabled=true);if(bs[q.ok])bs[q.ok].classList.add("good");
 save.total++;state.totalAnswered++;recordProgress("answered",1);if(save.catStats[q.c])save.catStats[q.c].total++;state.streak=0;beep("bad");flash("bad");
 if(state.shield){state.shield=false;$("feedback").textContent="⏱️ Tiempo agotado. 🛡️ El escudo evitó la penalización. Era: "+q.a[q.ok]}
 else if(state.mode==="boss"||state.mode==="bossrush"){state.php--;$("feedback").textContent="⏱️ Tiempo agotado. El jefe contraataca. Era: "+q.a[q.ok]}
 else if(state.mode==="local"){$("feedback").textContent="⏱️ Tiempo agotado. Era: "+q.a[q.ok]}
 else{state.lives--;$("feedback").textContent="⏱️ Tiempo agotado. Pierdes una vida. Era: "+q.a[q.ok]}
 renderGameAvatarWidget("bad");
 if(state.mode==="worldtour"&&q.explanation)$("feedback").textContent+=" · "+q.explanation;
 if(state.mode==="tournament")cpuTurn(q.d);checkAch();updateHUD();setTimeout(nextQ,state.mode==="worldtour"?1900:1200)
}
function ensureAudio(){try{if(!audio)audio=new(window.AudioContext||window.webkitAudioContext)();if(audio.state==="suspended")audio.resume();if(save.settings.music&&!musicStarted)startMusic()}catch(e){}}
document.addEventListener("pointerdown",ensureAudio);
function tone(freq,dur=.1,type="sine",gain=.04,when=0){if(!audio)return;const o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);const t=audio.currentTime+when;o.frequency.setValueAtTime(freq,t);o.type=type;g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);o.start(t);o.stop(t+dur)}
function beep(t){if(!save.settings.sound)return;ensureAudio();if(t==="good"){tone(660,.08);tone(880,.12,"sine",.04,.08)}else if(t==="bad"){tone(190,.16,"sawtooth",.035)}else if(t==="coin"){tone(880,.07);tone(1175,.09,"sine",.035,.05)}else if(t==="win"){tone(660,.08);tone(880,.09,"sine",.04,.07);tone(1100,.13,"sine",.04,.14)}else if(t==="boss"){tone(110,.16,"square",.025)}else if(t==="power"){tone(520,.06);tone(780,.1,"triangle",.035,.05)}else if(t==="wheel"){for(let i=0;i<7;i++)tone(300+i*45,.035,"square",.018,i*.055)}else tone(430,.04,"sine",.025)}
function startMusic(){if(!save.settings.music||musicStarted)return;try{if(!audio)audio=new(window.AudioContext||window.webkitAudioContext)()}catch(e){return}musicStarted=true;const notes=[261.63,329.63,392,523.25,392,329.63,293.66,349.23];musicTimer=setInterval(()=>{if(!save.settings.music||!audio)return;const n=notes[musicStep%notes.length];tone(n,.22,"triangle",.012);tone(n/2,.28,"sine",.006,.02);musicStep++},330);updateMusicIndicator()}
function stopMusic(){if(musicTimer)clearInterval(musicTimer);musicTimer=null;musicStarted=false;updateMusicIndicator()}
function updateMusicIndicator(){const e=$("musicIndicator");if(e)e.textContent=save.settings.music?"🎵 Música: ON":"🔇 Música: OFF"}
function toast(x){const t=$("toast");t.textContent=x;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),1700)}
function flash(k){if(!save.settings.animations)return;const f=$("flash");f.className="flash "+k;setTimeout(()=>f.className="flash",450);if(window.SemantropicFX){const from=$("gameAvatarFigure")||$("qBox");SemantropicFX.burst(k,{from,count:k==="good"?14:10});if(k==="good")SemantropicFX.ring("power",from)}}
function av(){return AVATARS.find(a=>a.id===save.avatar)||AVATARS[0]}
function page(id,btn){if(id!=="game")stopQuestionTimer();beep("click");document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));const target=$(id);if(!target)return;target.classList.remove("hidden");window.scrollTo({top:0,left:0,behavior:"auto"});document.querySelectorAll("nav button").forEach(b=>b.classList.remove("active"));if(btn)btn.classList.add("active");if(id==="campaign")renderMap();if(id==="rewards"){refreshAuthenticatedProfile().then(()=>renderRewards())}if(id==="multiplayer")renderMultiplayerPage();if(id==="missions")renderMissionsPage();if(id==="season")renderSeasonPage();if(id==="admin"){refreshAuthenticatedProfile().then(()=>renderAdminPage())}if(id==="avatarStudio"){renderAvatarBuilder()}if(id==="collection"){renderPremiumCollection();renderFrames();renderAchievementAvatars();renderWorldCollection();renderPrestige("collectionPrestigeGrid");renderIdentity();renderMedals();renderCollectionCatalogSummary()}if(id==="economy")renderEconomyHub();if(id==="shop")renderShop();if(id==="achievements")renderAch();if(id==="stats")renderStats();if(id==="settings"){renderSettings();renderAccountUI()}refresh()}
function bgStyle(id){const x=BGS.find(b=>b[0]===id)||BGS[0];return x[1]}
function optionValue(list,id,fallback){const x=list.find(v=>v[0]===id);return x?x[1]:fallback}
function avatarMarkup(c,meta={}){
 ensureIdentityState();
 const identity=meta.identity?{...defaultIdentityState(),...(meta.identity||{})}:ensureIdentityState();
 const skin=optionValue(SKINS,c.skin,"#d9a06f"),hair=optionValue(HAIR_COLORS,c.hairColor,"#4a2d20");
 const hs=HAIR_STYLES.some(x=>x[0]===c.hairStyle)?c.hairStyle:"short",ex=EXPRESSIONS.some(x=>x[0]===c.expression)?c.expression:"smile",ac="none";
 const presentation=c.presentation==="female"?"female":"male";
 const outfit=meta.equippedOutfit||save.equippedOutfit||"hoodie",aura=meta.selectedAura||save.selectedAura||"none",stage=meta.outfitStage||outfitStage(outfit),conf=OUTFITS.find(x=>x.id===outfit)||OUTFITS[0];
 const headwear=findIdentityItem("headwear",identity.headwear)||HEADWEAR_ITEMS[0],face=findIdentityItem("face",identity.faceItem)||FACE_ITEMS[0],top=findIdentityItem("top",identity.topItem)||TOP_ITEMS[0],bottom=findIdentityItem("bottom",identity.bottomItem)||BOTTOM_ITEMS[0],hand=findIdentityItem("accessory",identity.accessoryItem)||ACCESSORY_ITEMS[0];
 return `<div class="avatar-render presentation-${presentation} hair-${hs} expr-${ex} acc-${ac} aura-${aura} outfit-${outfit} outfit-stage-${stage}" style="--skin:${skin};--hair:${hair};--top-color:${top.color||'#506ef0'};--bottom-color:${bottom.color||'#3b4f72'}">
 <div class="av-aura-layer"></div><div class="av-particles-layer"></div>
 <div class="av-ponytail"></div>
 <div class="av-shoulders"></div><div class="av-outfit-details"><i></i><b></b></div>
 <div class="av-neck"></div><div class="av-ear left"></div><div class="av-ear right"></div>
 <div class="av-head"><div class="av-hair-side left"></div><div class="av-hair-side right"></div><div class="av-hair-top"></div><div class="av-brow left"></div><div class="av-brow right"></div><div class="av-eye left"></div><div class="av-eye right"></div><div class="av-lashes"></div><div class="av-cheeks"></div><div class="av-nose"></div><div class="av-mouth"></div><div class="av-glasses"><i></i></div><div class="av-sunglasses"><i></i></div></div>
 <div class="av-headphones"></div><div class="av-cap"></div><div class="av-crown">👑</div><div class="av-earring"></div><div class="av-outfit-emblem">${conf.emblem||"✨"}</div><div class="avatar-mood-layer">${meta.moodIcon||""}</div>
 <div class="av-headwear headwear-${headwear.id} ${headwear.id===`none`?`none`:``}">${headwear.emoji||""}</div><div class="av-face-item face-${face.id} ${face.id===`none`?`none`:``}">${face.emoji||""}</div><div class="av-top-piece top-${top.id}"><span>${top.emoji||top.icon||""}</span></div><div class="av-bottom-piece bottom-${bottom.id}"><span>${bottom.emoji||bottom.icon||""}</span></div><div class="av-hand-item accessory-${hand.id} ${hand.id===`none`?`none`:``}">${hand.emoji||""}</div>${identity.primaryEmote?`<div class="av-emote-bubble">${(EMOTES_COLLECTION.find(x=>x.id===identity.primaryEmote)||{}).emoji||"✨"}</div>`:""}</div>`
}

function premiumAvatarMarkup(a){
 const p=a?.portrait;if(!p)return a?.icon||"🧠";
 const acc=p.acc||"none",style=p.style||"short",gender=p.gender||"male";
 return `<div class="premium-portrait gender-${gender} style-${style} acc-${acc}" style="--skin:${p.skin};--hair:${p.hair};--shirt:${p.shirt};--portrait-bg:${p.bg}">
  <div class="pp-body"></div><div class="pp-neck"></div><div class="pp-ear l"></div><div class="pp-ear r"></div>
  <div class="pp-head"></div><div class="pp-hair"></div><div class="pp-brow l"></div><div class="pp-brow r"></div><div class="pp-eye l"></div><div class="pp-eye r"></div><div class="pp-mouth"></div><div class="pp-acc"></div>
 </div>`
}
function rarityLabel(r){return r==="mythic"?"Mítico":r==="prestige"?"Prestigio":r==="legendary"?"Legendario":r==="epic"?"Épico":r==="rare"?"Raro":r==="common"?"Común":"Clásico"}
function rarityBadge(r){return `<span class="rarity-badge rarity-${r||"common"}">${rarityLabel(r)}</span>`}
function avatarVisual(a){
 if(a&&a.portrait)return premiumAvatarMarkup(a);
 if(a&&a.id==="diamond_warrior")return `<span class="pixel-warrior-icon" title="Guerrero Diamante"></span>`;
 return a?a.icon:"🧠"
}
function identityPresetMarkup(avatarId,identity,moodIcon=""){const a=AVATARS.find(x=>x.id===avatarId)||AVATARS[0],i={...defaultIdentityState(),...(identity||{})},primary=EMOTES_COLLECTION.find(x=>x.id===i.primaryEmote);return `<div class="identity-preset-render clean-preset rarity-shell r-${equippedIdentityRarity({identity:i})}"><div class="ipr-core">${avatarVisual(a)}</div>${primary?`<div class="ipr-emote">${primary.emoji||"✨"}</div>`:""}${moodIcon?`<div class="ipr-mood">${moodIcon}</div>`:""}</div>`}
function identityAvatarMarkup(avatarId,meta={},moodIcon=""){const i={...defaultIdentityState(),...(meta.identity||{})},base=i.baseAvatar||avatarId||"custom";if(base==="custom")return avatarMarkup(meta.customAvatar||save.customAvatar||{}, {equippedOutfit:meta.equippedOutfit||save.equippedOutfit,selectedAura:meta.selectedAura||save.selectedAura,outfitStage:meta.outfitStage||outfitStage(meta.equippedOutfit||save.equippedOutfit||"hoodie"),identity:i,moodIcon});return identityPresetMarkup(base,i,moodIcon)}
function unlockLevelCosmetics(){
 PREMIUM_AVATARS.filter(a=>a.levelReq&&save.level>=a.levelReq).forEach(a=>{if(!save.avatars.includes(a.id))save.avatars.push(a.id)});
 PREMIUM_FRAMES.filter(f=>f.levelReq&&save.level>=f.levelReq).forEach(f=>{if(!save.framesOwned.includes(f.id))save.framesOwned.push(f.id)})
}
function applyProfileFrame(){
 const el=$("sideAvatar");if(!el)return;FRAMES.forEach(f=>el.classList.remove(f.className));const f=FRAMES.find(x=>x.id===save.selectedFrame)||FRAMES[0];el.classList.add(f.className)
}
function unlockFrames(){
 FRAMES.filter(f=>f.unlock).forEach(f=>{if(save.ach[f.unlock]&&!save.framesOwned.includes(f.id)){save.framesOwned.push(f.id);toast(`🖼️ Marco desbloqueado: ${f.name}`)}})
 unlockLevelCosmetics()
}
function frameCostLabel(f){
 if(f.currency==="level")return `🔒 Nivel ${f.levelReq}`;
 if(f.currency==="season")return "🏅 Recompensa de temporada";
 if(f.currency==="world")return "🗺️ Recompensa World Tour";
 return f.currency==="gems"?`${f.cost} 💎`:`${f.cost} 🪙`
}
function framePreviewHTML(f){
 const square=f.shape==="square"?" squareish":"";
 return `<div class="frame-preview-wrap"><div class="frame-preview-avatar${square} ${f.className}">🙂</div></div>`
}
function buyFrame(f){
 if(f.currency==="season")return toast("🏅 Este marco se obtiene en el camino de temporada");
 if(f.currency==="world")return toast("🗺️ Este marco se obtiene exclusivamente en World Tour");
 if(f.levelReq&&save.level<f.levelReq)return toast(`Necesitas nivel ${f.levelReq}`);
 if(f.currency==="gems"){if(save.gems<f.cost)return toast("No tienes suficientes diamantes");save.gems-=f.cost}
 else if(f.currency==="coins"){if(save.coins<f.cost)return toast("No tienes suficientes monedas");save.coins-=f.cost}
 if(!save.framesOwned.includes(f.id))save.framesOwned.push(f.id);
 save.selectedFrame=f.id;beep("coin");persist();renderFrames();renderShop();toast(`🖼️ ${f.name} desbloqueado`)
}
function renderFrames(){
 const g=$("frameGrid");if(!g)return;g.innerHTML="";unlockLevelCosmetics();
 FRAMES.forEach(f=>{
  const owned=save.framesOwned.includes(f.id),d=document.createElement("div");
  d.className="card frameitem premium-card "+(save.selectedFrame===f.id?"sel":"");
  const ach=f.unlock?ACH.find(a=>a.id===f.unlock):null;
  const lockedText=f.levelReq?`Nivel ${f.levelReq}`:ach?`Logro: ${ach.name}`:f.source==="shop"?frameCostLabel(f):"Bloqueado";
  d.innerHTML=`${framePreviewHTML(f)}<div>${rarityBadge(f.rarity)}</div><h3>${f.name}</h3><div class="muted">${owned?(save.selectedFrame===f.id?"Seleccionado":"Disponible"):lockedText}</div>`;
  if(owned)d.onclick=()=>{toast("🎨 Equípalo desde Mi Avatar");openUnifiedAvatarEditor("avatarEffectsSection")};
  else if(f.source==="shop"||f.source==="level")d.onclick=()=>buyFrame(f);
  g.appendChild(d)
 })
}
function renderSideAvatar(){const el=$("sideAvatar");if(!el)return;ensureIdentityState();["none","spark","butterflies","firefeet","cosmic","storm","prism","mythic","season_crown","desert_sun","sakura_trail"].forEach(a=>el.classList.remove("side-aura-"+a));el.innerHTML=identityAvatarMarkup(save.identity.baseAvatar||save.avatar,{identity:save.identity,customAvatar:save.customAvatar,equippedOutfit:save.equippedOutfit,selectedAura:save.selectedAura});el.style.background=profileBackgroundInfo(save.identity.profileBackground).style;el.classList.add("side-aura-"+(save.selectedAura||"none"));applyProfileFrame();applyProfileAnimation(el);applyEntryAnimation(el,{identity:save.identity})}
function localDayKey(d=new Date()){return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function localWeekKey(d=new Date()){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());const day=(x.getDay()+6)%7;x.setDate(x.getDate()-day+3);const firstThu=new Date(x.getFullYear(),0,4),firstDay=(firstThu.getDay()+6)%7;firstThu.setDate(firstThu.getDate()-firstDay+3);const week=1+Math.round((x-firstThu)/604800000);return`${x.getFullYear()}-W${String(week).padStart(2,"0")}`}
function seasonKey(d=new Date()){return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`}
function seasonName(){return new Intl.DateTimeFormat("es-CL",{month:"long",year:"numeric"}).format(new Date()).replace(/^./,x=>x.toUpperCase())}
function seededNumber(str){let h=2166136261;for(const c of String(str)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function deterministicPick(pool,count,key){let arr=[...pool],seed=seededNumber(key);for(let i=arr.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[arr[i],arr[j]]=[arr[j],arr[i]]}return arr.slice(0,count)}
function emptyProgressStats(){return{games:0,correct:0,answered:0,worldStages:0,worldBosses:0,worldStars:0,bossWins:0,chests:0,wheel:0,streak:0,categories:{}}}
function ensureProgressionState(){
 save.season={key:"",points:0,claimed:[],...(save.season||{})};
 save.missionState={dailyKey:"",dailyStats:{},dailyClaims:[],dailyBonusKey:"",weeklyKey:"",weeklyStats:{},weeklyClaims:[],weeklyBonusKey:"",eventKey:"",eventProgress:0,eventClaimed:false,...(save.missionState||{})};
 save.loginStreak={lastDate:"",count:0,best:0,totalDays:0,...(save.loginStreak||{})};
 save.chestStats={opened:0,common:0,rare:0,legendary:0,legendaryPity:0,...(save.chestStats||{})};
 save.lifetime={missionsClaimed:0,seasonClaims:0,...(save.lifetime||{})};
 const dk=localDayKey(),wk=localWeekKey(),sk=seasonKey();
 if(save.season.key!==sk)save.season={key:sk,points:0,claimed:[]};
 if(save.missionState.dailyKey!==dk){save.missionState.dailyKey=dk;save.missionState.dailyStats=emptyProgressStats();save.missionState.dailyClaims=[]}
 if(save.missionState.weeklyKey!==wk){save.missionState.weeklyKey=wk;save.missionState.weeklyStats=emptyProgressStats();save.missionState.weeklyClaims=[];save.missionState.eventKey=wk;save.missionState.eventProgress=0;save.missionState.eventClaimed=false}
 if(!save.missionState.dailyStats.categories)save.missionState.dailyStats.categories={};
 if(!save.missionState.weeklyStats.categories)save.missionState.weeklyStats.categories={};
}
const DAILY_MISSIONS=[
 {id:"games",icon:"🎮",name:"Entra en ritmo",desc:"Completa 3 partidas.",metric:"games",target:3,reward:{coins:90,xp:35,sp:20}},
 {id:"correct",icon:"✅",name:"Mente rápida",desc:"Consigue 20 respuestas correctas.",metric:"correct",target:20,reward:{coins:110,xp:45,sp:25}},
 {id:"categories",icon:"🧭",name:"Explorador",desc:"Acierta en 4 categorías diferentes.",metric:"categories",target:4,reward:{keys:1,xp:35,sp:20}},
 {id:"worldstage",icon:"✈️",name:"Escala internacional",desc:"Completa 1 etapa de World Tour.",metric:"worldStages",target:1,reward:{coins:100,xp:40,sp:25}},
 {id:"streak",icon:"🔥",name:"En llamas",desc:"Alcanza una racha de 6 aciertos.",metric:"streak",target:6,reward:{coins:90,xp:40,sp:25}},
 {id:"chest",icon:"🎁",name:"Cazatesoros",desc:"Abre 1 cofre.",metric:"chests",target:1,reward:{coins:70,xp:30,sp:20}},
 {id:"wheel",icon:"🎡",name:"Prueba tu suerte",desc:"Gira la ruleta 1 vez.",metric:"wheel",target:1,reward:{coins:60,xp:25,sp:15}},
 {id:"boss",icon:"👹",name:"Cazajefes",desc:"Derrota 1 jefe de la Torre.",metric:"bossWins",target:1,reward:{coins:120,xp:50,sp:30}}
];
const WEEKLY_MISSIONS=[
 {id:"games",icon:"🎮",name:"Semana activa",desc:"Completa 15 partidas.",metric:"games",target:15,reward:{coins:400,xp:160,sp:120}},
 {id:"correct",icon:"🧠",name:"Banco de conocimiento",desc:"Consigue 120 respuestas correctas.",metric:"correct",target:120,reward:{coins:500,xp:190,sp:150}},
 {id:"worldstars",icon:"⭐",name:"Pasaporte brillante",desc:"Consigue 3 estrellas nuevas en World Tour.",metric:"worldStars",target:3,reward:{coins:350,xp:160,sp:120}},
 {id:"boss",icon:"🐲",name:"Asalto a la Torre",desc:"Derrota 4 jefes.",metric:"bossWins",target:4,reward:{coins:450,gems:1,xp:180,sp:150}},
 {id:"chests",icon:"🧰",name:"Coleccionista",desc:"Abre 5 cofres.",metric:"chests",target:5,reward:{keys:2,xp:150,sp:120}},
 {id:"wheel",icon:"🎡",name:"Fortuna semanal",desc:"Gira la ruleta 4 veces.",metric:"wheel",target:4,reward:{gems:1,coins:250,xp:120,sp:100}},
 {id:"categories",icon:"🌐",name:"Todoterreno",desc:"Acierta en las 10 categorías.",metric:"categories",target:10,reward:{coins:500,keys:1,xp:180,sp:160}},
 {id:"streak",icon:"🔥",name:"Concentración total",desc:"Alcanza una racha de 12 aciertos.",metric:"streak",target:12,reward:{gems:1,coins:300,xp:170,sp:140}}
];
const SEASON_REWARDS=[
 {icon:"🪙",label:"100 monedas",reward:{coins:100}},{icon:"🔑",label:"1 llave",reward:{keys:1}},{icon:"🪙",label:"150 monedas",reward:{coins:150}},{icon:"✨",label:"100 XP",reward:{xp:100}},{icon:"💎",label:"1 diamante",reward:{gems:1}},
 {icon:"🪙",label:"200 monedas",reward:{coins:200}},{icon:"🔑",label:"1 llave",reward:{keys:1}},{icon:"✨",label:"150 XP",reward:{xp:150}},{icon:"🪙",label:"250 monedas",reward:{coins:250}},{icon:"🏅",label:"Marco Vanguardia",reward:{frame:"season_vanguard"}},
 {icon:"💎",label:"1 diamante",reward:{gems:1}},{icon:"🪙",label:"300 monedas",reward:{coins:300}},{icon:"🔑",label:"2 llaves",reward:{keys:2}},{icon:"✨",label:"200 XP",reward:{xp:200}},{icon:"☀️",label:"Aura de Temporada",reward:{aura:"season_crown"}},
 {icon:"🪙",label:"350 monedas",reward:{coins:350}},{icon:"💎",label:"2 diamantes",reward:{gems:2}},{icon:"🔑",label:"2 llaves",reward:{keys:2}},{icon:"✨",label:"250 XP",reward:{xp:250}},{icon:"🌟",label:"Outfit Ascendente",reward:{outfit:"ascendant"}}
];
const LEVEL_TITLES=[[1,"🌱","Aprendiz"],[5,"🧭","Explorador"],[10,"📘","Especialista"],[15,"♟️","Estratega"],[20,"🧠","Sabio"],[25,"⚔️","Élite"],[30,"👑","Maestro"],[35,"💠","Gran Maestro"],[40,"🌟","Leyenda"],[45,"🔮","Mítico"],[50,"☀️","Ascendente"]];
function playerTitle(level=save.level){let found=LEVEL_TITLES[0];for(const x of LEVEL_TITLES)if(level>=x[0])found=x;return{level:found[0],icon:found[1],name:found[2],label:`${found[1]} ${found[2]}`}}
function seasonRank(points=save.season?.points||0){const tiers=[[0,"🥉","Bronce"],[300,"🥈","Plata"],[700,"🥇","Oro"],[1100,"💠","Platino"],[1500,"💎","Diamante"],[2000,"👑","Maestro"]];let r=tiers[0];for(const t of tiers)if(points>=t[0])r=t;return{need:r[0],icon:r[1],name:r[2],label:`${r[1]} ${r[2]}`}}
function currentDailyMissions(){ensureProgressionState();return deterministicPick(DAILY_MISSIONS,3,save.missionState.dailyKey)}
function currentWeeklyMissions(){ensureProgressionState();return deterministicPick(WEEKLY_MISSIONS,4,save.missionState.weeklyKey)}
function missionValue(m,stats){if(m.metric==="categories")return Object.keys(stats.categories||{}).length;return Number(stats[m.metric]||0)}
function recordProgress(metric,value=1,category=null){ensureProgressionState();for(const stats of [save.missionState.dailyStats,save.missionState.weeklyStats]){if(category)stats.categories[category]=true;if(metric==="streak")stats.streak=Math.max(Number(stats.streak||0),Number(value||0));else if(metric!=="categories")stats[metric]=Number(stats[metric]||0)+Number(value||0)}if(metric==="correct"&&category&&category===weeklyEventInfo().category)save.missionState.eventProgress=Math.min(999,Number(save.missionState.eventProgress||0)+Number(value||0))}
function gainSeasonPoints(n){ensureProgressionState();save.season.points=Math.max(0,Number(save.season.points||0)+Math.max(0,Math.round(Number(n)||0)))}
function rewardText(r={}){const bits=[];if(r.coins)bits.push(`🪙 ${r.coins}`);if(r.gems)bits.push(`💎 ${r.gems}`);if(r.keys)bits.push(`🔑 ${r.keys}`);if(r.xp)bits.push(`✨ ${r.xp} XP`);if(r.sp)bits.push(`🏅 ${r.sp} SP`);if(r.frame)bits.push("🖼️ Marco");if(r.aura)bits.push("☀️ Aura");if(r.outfit)bits.push("👕 Outfit");return bits.join(" · ")}
function grantProgressReward(r={}){if(r.coins)save.coins+=r.coins;if(r.gems)save.gems+=r.gems;if(r.keys)addKey("silver",r.keys);if(r.xp)gainXp(r.xp,.55);if(r.sp)gainSeasonPoints(r.sp);if(r.frame&&!save.framesOwned.includes(r.frame))save.framesOwned.push(r.frame);if(r.aura&&!save.aurasOwned.includes(r.aura))save.aurasOwned.push(r.aura);if(r.outfit&&!save.wardrobeOwned.includes(r.outfit)){save.wardrobeOwned.push(r.outfit);save.outfitXp[r.outfit]=save.outfitXp[r.outfit]||0}}
function claimMission(kind,id){ensureProgressionState();const isDaily=kind==="daily",missions=isDaily?currentDailyMissions():currentWeeklyMissions(),m=missions.find(x=>x.id===id);if(!m)return;const stats=isDaily?save.missionState.dailyStats:save.missionState.weeklyStats,claims=isDaily?save.missionState.dailyClaims:save.missionState.weeklyClaims;if(claims.includes(id))return toast("Esta misión ya fue reclamada");if(missionValue(m,stats)<m.target)return toast("Aún no completas esta misión");claims.push(id);save.lifetime.missionsClaimed++;grantProgressReward(m.reward);checkMissionCompletionBonus(kind);checkAch();persist();renderMissionsPage();toast(`🎯 Misión completada · ${rewardText(m.reward)}`)}
function checkMissionCompletionBonus(kind){const daily=kind==="daily",list=daily?currentDailyMissions():currentWeeklyMissions(),claims=daily?save.missionState.dailyClaims:save.missionState.weeklyClaims,key=daily?save.missionState.dailyKey:save.missionState.weeklyKey,bonusKey=daily?save.missionState.dailyBonusKey:save.missionState.weeklyBonusKey;if(list.every(m=>claims.includes(m.id))&&bonusKey!==key){const reward=daily?{coins:200,keys:1,sp:60}:{coins:500,gems:2,keys:2,sp:250};grantProgressReward(reward);if(daily)save.missionState.dailyBonusKey=key;else save.missionState.weeklyBonusKey=key;toast(`${daily?"☀️ Bonus diario":"📅 Bonus semanal"} · ${rewardText(reward)}`)}}
function weeklyEventInfo(){ensureProgressionState();const cats=Object.keys(CATS),idx=seededNumber(save.missionState.weeklyKey)%cats.length,category=cats[idx];return{category,target:30,title:`${CATS[category]} Semana de ${category}`,desc:`Consigue 30 respuestas correctas de ${category} durante esta semana.`,reward:{coins:600,gems:2,keys:2,xp:250,sp:250}}}
function claimWeeklyEvent(){ensureProgressionState();const ev=weeklyEventInfo();if(save.missionState.eventClaimed)return toast("Evento ya reclamado");if(save.missionState.eventProgress<ev.target)return toast("Aún no completas el evento semanal");save.missionState.eventClaimed=true;grantProgressReward(ev.reward);identityUnlock("headwear","pumpkin_crown");identityUnlock("profilebg","event");save.lifetime.missionsClaimed++;checkAch();persist();renderMissionsPage();toast(`⚡ Evento completado · ${rewardText(ev.reward)}`)}
function missionCardHTML(m,kind,stats,claims){const value=Math.min(m.target,missionValue(m,stats)),done=value>=m.target,claimed=claims.includes(m.id),pct=Math.round(value/m.target*100);return`<div class="card mission-card ${done?"done":""} ${claimed?"claimed":""}"><div class="mission-icon">${m.icon}</div><h3>${m.name}</h3><p class="muted">${m.desc}</p><div class="mission-progress"><div style="width:${pct}%"></div></div><div class="mission-progress-meta"><span>${value}/${m.target}</span><span>${done?"✅ Completada":"En progreso"}</span></div><div class="mission-reward">${rewardText(m.reward).split(" · ").map(x=>`<span>${x}</span>`).join("")}</div><button class="btn ${done&&!claimed?"primary":"secondary"}" ${!done||claimed?"disabled":""} onclick="claimMission('${kind}','${m.id}')">${claimed?"RECLAMADA":done?"RECLAMAR":"EN PROGRESO"}</button></div>`}
function renderMissionsPage(){ensureProgressionState();const d=currentDailyMissions(),w=currentWeeklyMissions(),ds=save.missionState.dailyStats,ws=save.missionState.weeklyStats;$('dailyMissionGrid').innerHTML=d.map(m=>missionCardHTML(m,"daily",ds,save.missionState.dailyClaims)).join("");$('weeklyMissionGrid').innerHTML=w.map(m=>missionCardHTML(m,"weekly",ws,save.missionState.weeklyClaims)).join("");const dbDone=d.filter(m=>save.missionState.dailyClaims.includes(m.id)).length,wbDone=w.filter(m=>save.missionState.weeklyClaims.includes(m.id)).length;$('dailyBonusCard').className='card mission-completion-bonus '+(dbDone===d.length?'complete':'');$('dailyBonusCard').innerHTML=`<div><b>🎁 Bonus diario</b><div class="muted">Reclama las 3 misiones · ${dbDone}/3</div></div><strong>🪙 200 · 🔑 1 · 🏅 60 SP</strong>`;$('weeklyBonusCard').className='card mission-completion-bonus '+(wbDone===w.length?'complete':'');$('weeklyBonusCard').innerHTML=`<div><b>🏆 Bonus semanal</b><div class="muted">Reclama las 4 misiones · ${wbDone}/4</div></div><strong>🪙 500 · 💎 2 · 🔑 2 · 🏅 250 SP</strong>`;const ev=weeklyEventInfo(),ep=Math.min(ev.target,Number(save.missionState.eventProgress||0));$('missionEventTitle').textContent=ev.title;$('missionEventDesc').textContent=ev.desc;$('missionEventBar').style.width=Math.round(ep/ev.target*100)+'%';$('missionEventValue').textContent=`${ep}/${ev.target}`;$('missionEventReward').textContent=rewardText(ev.reward);const eb=$('missionEventClaim');eb.disabled=ep<ev.target||save.missionState.eventClaimed;eb.textContent=save.missionState.eventClaimed?'EVENTO RECLAMADO':ep>=ev.target?'RECLAMAR EVENTO':'EN PROGRESO';$('missionLoginStreak').textContent=save.loginStreak.count||0;$('missionBestLoginStreak').textContent=save.loginStreak.best||0;$('missionTotalLogins').textContent=save.loginStreak.totalDays||0;$('missionCheckinText').textContent=save.loginStreak.lastDate===localDayKey()?`✅ Recompensa de hoy recibida · día ${save.loginStreak.count}`:'🎁 Recompensa diaria pendiente de sincronización';$('dailyResetLabel').textContent=`Día ${save.missionState.dailyKey}`;$('weeklyResetLabel').textContent=`Semana ${save.missionState.weeklyKey}`}
function seasonTier(){return Math.min(20,Math.floor(Number(save.season?.points||0)/100))}
function claimSeasonTier(tier){ensureProgressionState();tier=Number(tier);if(tier<1||tier>20)return;if(Number(save.season.points||0)<tier*100)return toast(`Necesitas ${tier*100} SP`);if((save.season.claimed||[]).includes(tier))return toast("Recompensa ya reclamada");const item=SEASON_REWARDS[tier-1];save.season.claimed.push(tier);save.lifetime.seasonClaims++;grantProgressReward(item.reward);checkAch();persist();renderSeasonPage();toast(`🏅 Nivel ${tier} de temporada · ${item.label}`)}
function renderSeasonTrack(){const box=$('seasonTrack');if(!box)return;box.innerHTML='';const pts=Number(save.season.points||0);SEASON_REWARDS.forEach((x,i)=>{const tier=i+1,ready=pts>=tier*100,claimed=(save.season.claimed||[]).includes(tier),d=document.createElement('div');d.className=`card season-tier ${ready?'ready':'locked'} ${claimed?'claimed':''}`;d.innerHTML=`<div class="tier-num">${tier}</div><div class="tier-icon">${x.icon}</div><b>${x.label}</b><div class="tier-need">${tier*100} SP</div><button class="btn ${ready&&!claimed?'primary':'secondary'}" ${!ready||claimed?'disabled':''} onclick="claimSeasonTier(${tier})">${claimed?'✓ RECLAMADO':ready?'RECLAMAR':'🔒 BLOQUEADO'}</button>`;box.appendChild(d)})}
async function renderSeasonRanking(){const body=$('seasonRankingBody');if(!body)return;body.innerHTML='<tr><td colspan="6" class="muted">Cargando ranking…</td></tr>';try{const r=await mpRequest('/api/season-ranking'),rows=r.ranking||[];if(!rows.length){body.innerHTML='<tr><td colspan="6" class="muted">Aún no hay puntos esta temporada.</td></tr>';return}body.innerHTML='';rows.slice(0,30).forEach((p,i)=>{const sr=seasonRank(Number(p.profileMeta?.season?.points||0)),tr=document.createElement('tr');tr.onclick=()=>openPublicProfile(p.id);tr.style.cursor='pointer';tr.innerHTML=`<td>${i+1}</td><td><b>${p.name}</b></td><td>${sr.icon} ${sr.name}</td><td><b>${p.profileMeta?.season?.points||0}</b></td><td>${p.level||1}</td><td>${p.wins||0}</td>`;body.appendChild(tr)})}catch(e){body.innerHTML='<tr><td colspan="6" class="muted">Ranking disponible cuando el servidor esté online.</td></tr>'}}
function renderSeasonPage(){ensureProgressionState();const pts=Number(save.season.points||0),tier=seasonTier(),rank=seasonRank(pts),next=tier>=20?2000:(tier+1)*100,pct=tier>=20?100:Math.max(0,Math.min(100,((pts-tier*100)/100)*100));$('seasonPageTitle').textContent=`🏅 Temporada ${seasonName()}`;$('seasonRankIcon').textContent=rank.icon;$('seasonRankName').textContent=rank.name;$('seasonPoints').textContent=pts;$('seasonTierLabel').textContent=`Nivel de temporada ${tier}/20`;$('seasonProgressText').textContent=tier>=20?'Camino completado':`${pts-tier*100}/${next-tier*100} SP para nivel ${tier+1}`;$('seasonProgressBar').style.width=pct+'%';const now=new Date(),last=new Date(now.getFullYear(),now.getMonth()+1,0),days=Math.max(0,last.getDate()-now.getDate());$('seasonTimeLeft').textContent=`⏳ ${days} día${days===1?'':'s'} restantes`;renderSeasonTrack();renderSeasonRanking()}
function renderEngagementHome(){ensureProgressionState();const pts=Number(save.season.points||0),rank=seasonRank(pts),d=currentDailyMissions(),done=d.filter(m=>save.missionState.dailyClaims.includes(m.id)).length,ev=weeklyEventInfo();const set=(id,v)=>{const e=$(id);if(e)e.textContent=v};set('homeSeasonTitle',`🏅 Temporada ${seasonName()}`);set('homeSeasonRank',rank.name.toUpperCase());set('homeSeasonPoints',pts);set('homeSeasonNext',seasonTier()>=20?'Camino de temporada completado':`${(seasonTier()+1)*100-pts} SP para el próximo nivel`);set('homeDailyDone',done);set('homeLoginStreak',save.loginStreak.count||0);set('homeBestLoginStreak',save.loginStreak.best||0);set('homeEventName',ev.title);set('homeEventProgress',`${Math.min(ev.target,save.missionState.eventProgress||0)}/${ev.target}`)}
async function ensureDailyCheckin(){if(!accountLoggedIn||!onlineProfileToken||location.protocol==='file:')return;try{const r=await mpRequest('/api/progression/checkin',{token:onlineProfileToken});if(r.profile)applyOnlineProfile(r.profile,true);if(r.reward){toast(`🔥 Día ${r.streak} · ${rewardText(r.reward)}`);renderEngagementHome()}}catch(e){}}

function refresh(){ensureProgressionState();ensureEconomyState();ensureIdentityState();unlockLevelCosmetics();renderSideAvatar();$("sideName").textContent=save.name;$("sideLevel").textContent=save.level;const sc=$("sideShowcase");if(sc)sc.textContent=achievementLabel(save.featuredAchievement);$("sideXp").style.width=levelProgressPercent()+"%";document.querySelectorAll(".coins").forEach(e=>e.textContent=save.coins);updateRewardTimer();applyGameFx();document.querySelectorAll(".gems").forEach(e=>e.textContent=save.gems);document.querySelectorAll(".keys").forEach(e=>e.textContent=save.keyring?.silver||0);$("hLevel").textContent=save.level;$("hGames").textContent=save.games;$("hBosses").textContent=worldCompletedCountFromSave(save)+"/"+WORLD_TOUR_COUNTRIES.length;$("hAch").textContent=Object.keys(save.ach).length;const rt=selectedProfileTitleInfo();const srTitle=$("sideRankTitle");if(srTitle)srTitle.textContent=rt.label;const op=$("opRankTitle");if(op)op.textContent=rt.label;const co=$("chestOpenedCount");if(co)co.textContent=save.chestStats.opened||0;const cp=$("chestPityText");if(cp)cp.textContent=`${Math.min(5,save.chestStats.legendaryPity||0)}/5`;updateMusicIndicator();renderAvatarProgressUI();renderEngagementHome()}
function scrollAvatarEditorTo(id){const el=$(id);if(!el)return;el.open=true;el.scrollIntoView({behavior:"smooth",block:"start"})}
function openUnifiedAvatarEditor(section=""){page("avatarStudio");renderAvatarBuilder();if(section)setTimeout(()=>scrollAvatarEditorTo(section==="profile"?"avatarProfileSection":section),80)}
function setAvatarStudioTab(){renderAvatarBuilder()}
function activateCustomAvatarForEdit(){const i=ensureIdentityState();i.baseAvatar="custom";save.avatar="custom"}
function updateCustomAvatarField(key,value){activateCustomAvatarForEdit();save.customAvatar[key]=value;if(key==="presentation")save.profileGender=value;persist();renderAvatarBuilder()}
function renderUnifiedAvatarPreview(){ensureIdentityState();const p=$("customPreview");if(!p)return;p.className="public-avatar unified-avatar-preview";p.innerHTML=identityAvatarMarkup(save.identity.baseAvatar||save.avatar,{identity:save.identity,customAvatar:save.customAvatar,equippedOutfit:save.equippedOutfit,selectedAura:save.selectedAura});p.style.background=profileBackgroundInfo(save.identity.profileBackground).style;applyFrameToElement(p,save.selectedFrame||"none");applyProfileAnimation(p);applyEntryAnimation(p,{identity:save.identity});const n=$("unifiedPreviewName"),t=$("unifiedPreviewTitle"),s=$("unifiedPreviewSummary");if(n)n.textContent=save.name||"Jugador";if(t)t.textContent=selectedProfileTitleInfo().label;if(s)s.innerHTML=[`🧬 ${identityBaseLabel(save.identity.baseAvatar)}`,currentIdentityLabel("headwear"),currentIdentityLabel("face"),currentIdentityLabel("top"),currentIdentityLabel("bottom"),currentIdentityLabel("accessory"),save.identity.primaryEmote?`😄 ${(EMOTES_COLLECTION.find(e=>e.id===save.identity.primaryEmote)||{}).name||"Emote"}`:"😄 Sin emote visible",`${currentAura().icon} ${currentAura().name}`,`🖼️ ${(FRAMES.find(f=>f.id===save.selectedFrame)||FRAMES[0]).name}`,`🌌 ${profileBackgroundInfo(save.identity.profileBackground).name}`].map(x=>`<span>${x}</span>`).join("")}
function identityBaseLabel(id){if(id==="custom")return"Personalizado";return AVATARS.find(a=>a.id===id)?.name||"Avatar"}
function renderUnifiedBasePicker(){ensureIdentityState();const picker=$("identityBasePicker");if(!picker)return;const q=($("avatarBaseSearch")?.value||"").trim().toLowerCase();const owned=new Set(ownedAvatarIdsForProfile());const ids=["custom",...AVATARS.map(a=>a.id)].filter((id,i,a)=>a.indexOf(id)===i).filter(id=>id==="custom"||owned.has(id));picker.innerHTML="";ids.map(id=>id==="custom"?{id:"custom",name:"Personalizado",icon:"🎨"}:AVATARS.find(a=>a.id===id)).filter(Boolean).filter(a=>!q||String(a.name||"").toLowerCase().includes(q)).forEach(a=>{const id=a.id,sel=(save.identity.baseAvatar||"custom")===id,d=document.createElement("div");d.className="identity-base-option "+(sel?"sel":"");let visual=id==="custom"?avatarMarkup(save.customAvatar,{equippedOutfit:save.equippedOutfit,selectedAura:save.selectedAura,identity:save.identity}):avatarVisual(a);d.innerHTML=`<div class="identity-base-visual">${visual}</div><b>${a.name}</b><div class="muted">${id==="custom"?"Editable":profileAvatarGenderForId(id,a)==="animal"?"Animal":"Prediseñado"}</div>${sel?'<span class="upi-check">✓</span>':""}`;d.onclick=()=>selectIdentityBase(id);picker.appendChild(d)});if(!picker.children.length)picker.innerHTML='<div class="muted">No encontramos avatares con esa búsqueda.</div>'}
function renderUnifiedPicker(targetId,type){const box=$(targetId);if(!box)return;ensureIdentityState();const cfg=identityConfig(type),items=stableIdentityItems(type).filter(item=>identityOwns(type,item.id));box.innerHTML="";items.forEach(item=>{const sel=cfg?.equipKey?save.identity[cfg.equipKey]===item.id:type==="emote"?identityEmoteEquipped(item.id):type==="spray"?identitySprayEquipped(item.id):false,primary=type==="emote"&&save.identity.primaryEmote===item.id,d=document.createElement("div");d.className="unified-picker-item "+(sel?"sel ":"")+(primary?"primary-emote ":"")+(type==="profilebg"?" bg-item":"");const icon=type==="profilebg"?`<div class="upi-swatch" style="background:${item.style}"></div>`:`<div class="upi-icon">${item.emoji||item.icon||"✨"}</div>`;d.innerHTML=`${icon}<b>${item.name}</b><small>${primary?"VISIBLE EN AVATAR":rarityLabel(item.rarity||"common")}</small>${sel?'<span class="upi-check">✓</span>':""}`;d.onclick=()=>{if(type==="emote")equipIdentityEmote(item.id);else if(type==="spray")toggleIdentitySpray(item.id);else identityEquip(type,item.id)};box.appendChild(d)});if(!items.length)box.innerHTML='<div class="muted">Todavía no tienes objetos de esta categoría.</div>'}
function renderUnifiedOutfits(){const box=$("avatarOutfitGrid");if(!box)return;box.innerHTML="";(OUTFITS||[]).filter(item=>save.wardrobeOwned.includes(item.id)).forEach(item=>{const sel=save.equippedOutfit===item.id,d=document.createElement("div");d.className="unified-picker-item "+(sel?"sel":"");d.innerHTML=`<div class="upi-icon">${item.icon}</div><b>${item.name}</b><small>Maestría ${outfitStage(item.id)}/3</small>${sel?'<span class="upi-check">✓</span>':""}`;d.onclick=()=>equipOutfit(item.id);box.appendChild(d)});if(!box.children.length)box.innerHTML='<div class="muted">No tienes conjuntos desbloqueados.</div>'}
function renderUnifiedAuras(){const box=$("avatarAuraGrid");if(!box)return;box.innerHTML="";(AVATAR_AURAS||[]).filter(item=>save.aurasOwned.includes(item.id)).forEach(item=>{const sel=save.selectedAura===item.id,d=document.createElement("div");d.className="unified-picker-item "+(sel?"sel":"");d.innerHTML=`<div class="upi-icon">${item.icon}</div><b>${item.name}</b><small>${item.desc||"Aura"}</small>${sel?'<span class="upi-check">✓</span>':""}`;d.onclick=()=>equipAura(item.id);box.appendChild(d)})}
function renderUnifiedFrames(){const box=$("unifiedFrameGrid");if(!box)return;box.innerHTML="";(save.framesOwned||["none"]).map(id=>FRAMES.find(f=>f.id===id)).filter(Boolean).forEach(f=>{const sel=save.selectedFrame===f.id,d=document.createElement("div");d.className="unified-picker-item "+(sel?"sel":"");d.innerHTML=`<div class="upi-icon">${f.icon||"🖼️"}</div><b>${f.name}</b><small>${rarityLabel(f.rarity||"common")}</small>${sel?'<span class="upi-check">✓</span>':""}`;d.onclick=()=>{save.selectedFrame=f.id;persist();renderAvatarBuilder()};box.appendChild(d)})}
function renderUnifiedSlots(){const es=$("equippedEmoteSlots");if(es){const i=ensureIdentityState(),eq=i.equippedEmotes;es.innerHTML="";for(let n=0;n<6;n++){const item=EMOTES_COLLECTION.find(x=>x.id===eq[n]),d=document.createElement("div");d.className="emote-slot "+(item?"":"empty")+(item&&i.primaryEmote===item.id?" primary":"");d.innerHTML=item?`${item.emoji}<div>${item.name}</div><small>${i.primaryEmote===item.id?"👁️ visible":"toca para quitar"}</small>`:`Slot ${n+1}`;if(item)d.onclick=()=>i.primaryEmote===item.id?equipIdentityEmote(item.id):removeIdentityEmote(item.id);es.appendChild(d)}}const ss=$("equippedSpraySlots");if(ss){const eq=ensureIdentityState().equippedSprays;ss.innerHTML="";for(let n=0;n<3;n++){const item=SPRAYS_COLLECTION.find(x=>x.id===eq[n]),d=document.createElement("div");d.className="spray-slot "+(item?"":"empty");d.innerHTML=item?`${item.emoji}<div>${item.name}</div>`:`Slot ${n+1}`;ss.appendChild(d)}}}
function renderUnifiedProfileAnimations(){const box=$("unifiedProfileAnimationGrid");if(!box)return;box.innerHTML="";PROFILE_ANIMATIONS.forEach(a=>{const owned=save.animationsOwned.includes(a.id),sel=save.profileAnimation===a.id,d=document.createElement("div");d.className="unified-picker-item "+(sel?"sel":"")+(owned?"":" locked");d.innerHTML=`<div class="upi-icon">${a.icon}</div><b>${a.name}</b><small>${owned?"Disponible":a.source==="vault"?"Bóveda":a.currency==="gems"?a.cost+" 💎":a.cost+" 🪙"}</small>${sel?'<span class="upi-check">✓</span>':""}`;d.onclick=()=>selectProfileAnimation(a.id);box.appendChild(d)})}
function renderUnifiedTitles(){const box=$("identityTitleGrid");if(!box)return;box.innerHTML="";PROFILE_TITLES.filter(t=>t.check()).forEach(t=>{const sel=(save.selectedTitle||"")===t.id,d=document.createElement("div");d.className="unified-picker-item "+(sel?"sel":"");d.innerHTML=`<div class="upi-icon">${t.icon}</div><b>${t.name}</b>${sel?'<span class="upi-check">✓</span>':""}`;d.onclick=()=>{save.selectedTitle=t.id;persist();renderAvatarBuilder()};box.appendChild(d)})}
function renderUnifiedProfileFields(){const n=$("unifiedProfileName"),b=$("unifiedProfileBio"),a=$("unifiedFeaturedAchievement");if(n&&document.activeElement!==n)n.value=save.name||"Jugador";if(b&&document.activeElement!==b)b.value=save.profileBio||"";if(a){const current=save.featuredAchievement||"";a.innerHTML='<option value="">🏆 Sin logro destacado</option>'+ACH.filter(x=>save.ach[x.id]).map(x=>`<option value="${x.id}">${x.icon} ${x.name}</option>`).join("");a.value=current;a.onchange=()=>saveUnifiedProfileFields(false)}if(n&&!n.dataset.bound){n.dataset.bound="1";n.addEventListener("change",()=>saveUnifiedProfileFields(false))}if(b&&!b.dataset.bound){b.dataset.bound="1";b.addEventListener("change",()=>saveUnifiedProfileFields(false))}}
async function saveUnifiedProfileFields(notify=false){const n=$("unifiedProfileName"),b=$("unifiedProfileBio"),a=$("unifiedFeaturedAchievement");if(n)save.name=(n.value.trim()||"Jugador").slice(0,18);if(b)save.profileBio=b.value.trim().slice(0,90);if(a)save.featuredAchievement=a.value||"";persist();renderUnifiedAvatarPreview();if(notify){if(onlineProfileReady&&onlineProfileToken)await syncOnlineProfile();toast("☁️ Avatar y perfil guardados")}}
function renderAvatarBuilder(){ensureIdentityState();renderUnifiedAvatarPreview();const makeText=(id,list,key)=>{const box=$(id);if(!box)return;box.innerHTML="";list.forEach(v=>{const b=document.createElement("button");b.className="opt "+(save.customAvatar[key]===v[0]?"active":"");b.textContent=v[1];b.onclick=()=>updateCustomAvatarField(key,v[0]);box.appendChild(b)})};const pb=$("presentationOptions");if(pb){pb.innerHTML="";[["male","👨 Masculino"],["female","👩 Femenino"]].forEach(([id,label])=>{const b=document.createElement("button");b.className="opt "+(save.customAvatar.presentation===id?"active":"");b.textContent=label;b.onclick=()=>updateCustomAvatarField("presentation",id);pb.appendChild(b)})}makeText("skinOptions",SKINS.map(v=>[v[0],v[2]]),"skin");makeText("hairOptions",HAIR_STYLES,"hairStyle");const hc=$("hairColorOptions");if(hc){hc.innerHTML="";HAIR_COLORS.forEach(v=>{const b=document.createElement("button");b.className="opt "+(save.customAvatar.hairColor===v[0]?"active":"");b.innerHTML=`<span class="color-dot" style="background:${v[1]}"></span>${v[2]}`;b.onclick=()=>updateCustomAvatarField("hairColor",v[0]);hc.appendChild(b)})}makeText("expressionOptions",EXPRESSIONS,"expression");renderUnifiedBasePicker();renderUnifiedPicker("unifiedHeadwearGrid","headwear");renderUnifiedPicker("unifiedFaceGrid","face");renderUnifiedPicker("unifiedTopGrid","top");renderUnifiedPicker("unifiedBottomGrid","bottom");renderUnifiedPicker("unifiedAccessoryGrid","accessory");renderUnifiedAuras();renderUnifiedFrames();renderUnifiedPicker("identityProfileBgGrid","profilebg");renderUnifiedPicker("identityResponseGrid","response");renderUnifiedPicker("identityEmoteGrid","emote");renderUnifiedPicker("identitySprayGrid","spray");renderUnifiedPicker("identityEntryGrid","entry");renderUnifiedPicker("identityVictoryGrid","victory");renderUnifiedPicker("identityDefeatGrid","defeat");renderUnifiedProfileAnimations();renderUnifiedSlots();renderUnifiedTitles();renderUnifiedProfileFields();renderAvatarProgressUI();renderGameAvatarWidget("ready")}
function renderAvatarProgressUI(){
 const l=$("avatarStudioLevel"),bar=$("avatarStudioXpBar"),txt=$("avatarStudioXpText"),hint=$("avatarLevelRewardHint");
 if(l)l.textContent=save.level;
 if(bar)bar.style.width=levelProgressPercent()+"%";
 if(txt)txt.textContent=save.level>=MAX_LEVEL?"Nivel máximo alcanzado":`${save.xp}/${levelXpRequired(save.level)} XP · total ${save.totalXp||0}`;
 if(hint){const milestone=nextLevelMilestone();hint.textContent=save.level>=MAX_LEVEL?`Has alcanzado el nivel máximo ${MAX_LEVEL}`:`Próximo hito: nivel ${milestone}`}
}
function canUseCosmetic(item){return save.level>=(item.levelReq||1)}
function buyOutfit(id){
 const item=OUTFITS.find(x=>x.id===id);if(!item)return;
 if(item.currency==="season")return toast("Este outfit se consigue en el camino de temporada");if(item.currency==="world")return toast("🗺️ Este outfit se consigue en World Tour");
 if(!canUseCosmetic(item))return toast(`Necesitas nivel ${item.levelReq}`);
 if(item.currency==="gems"){if(save.gems<item.cost)return toast("No tienes suficientes diamantes");save.gems-=item.cost}else{if(save.coins<item.cost)return toast("No tienes suficientes monedas");save.coins-=item.cost}
 save.wardrobeOwned.push(item.id);save.outfitXp[item.id]=save.outfitXp[item.id]||0;save.equippedOutfit=item.id;save.avatar="custom";ensureIdentityState().baseAvatar="custom";persist();renderAvatarBuilder();renderSideAvatar();toast(`${item.icon} ${item.name} desbloqueado y equipado`)
}
function equipOutfit(id){if(!save.wardrobeOwned.includes(id))return;save.equippedOutfit=id;save.avatar="custom";ensureIdentityState().baseAvatar="custom";persist();renderAvatarBuilder();renderSideAvatar();toast(`👕 ${OUTFITS.find(x=>x.id===id)?.name||id} equipado en tu personaje`)}
function renderAvatarOutfits(){
 const box=$("avatarOutfitGrid");if(!box)return;box.innerHTML="";
 OUTFITS.forEach(item=>{
  const owned=save.wardrobeOwned.includes(item.id),equipped=save.equippedOutfit===item.id,allowed=canUseCosmetic(item),xp=outfitXpValue(item.id),stage=outfitStage(item.id);
  const nextNeed=stage>=3?OUTFIT_MASTERY_STAGES[2]:OUTFIT_MASTERY_STAGES[stage];
  const pct=stage>=3?100:Math.max(0,Math.min(100,(xp/nextNeed)*100));
  const d=document.createElement("div");d.className="card cos-card "+(!owned?"locked":"");
  d.innerHTML=`<div class="stage-badge">Etapa ${stage}/3</div><div class="bigico">${item.icon}</div><h3>${item.name}</h3><p class="muted">${item.desc}</p><div class="aura-chip">${owned?(equipped?"✅ Equipado":"🎒 En inventario"):(item.currency==="season"?"🏅 Temporada":item.currency==="world"?"🗺️ World Tour":allowed?(item.currency==="gems"?item.cost+" 💎":item.cost+" 🪙"):`🔒 Nivel ${item.levelReq}`)}</div><div class="mini-bar"><div style="width:${pct}%"></div></div><div class="muted" style="margin-top:6px">${owned?`Maestría ${xp} XP${stage<3?` · siguiente etapa en ${nextNeed} XP`:" · máximo"}`:`Requiere nivel ${item.levelReq}`}</div>`;
  d.onclick=()=>{if(owned)equipOutfit(item.id);else if(item.currency==="season")toast("🏅 Se obtiene en el camino de temporada");else if(item.currency==="world")toast("🗺️ Se obtiene en World Tour");else if(allowed)buyOutfit(item.id);else toast(`Sube al nivel ${item.levelReq} para desbloquearlo`)};
  box.appendChild(d)
 })
}
function buyAura(id){
 const item=AVATAR_AURAS.find(x=>x.id===id);if(!item)return;
 if(item.currency==="season")return toast("Esta aura se consigue en el camino de temporada");if(item.currency==="world")return toast("🗺️ Esta aura se consigue en World Tour");
 if(!canUseCosmetic(item))return toast(`Necesitas nivel ${item.levelReq}`);
 if(item.currency==="gems"){if(save.gems<item.cost)return toast("No tienes suficientes diamantes");save.gems-=item.cost}else{if(save.coins<item.cost)return toast("No tienes suficientes monedas");save.coins-=item.cost}
 save.aurasOwned.push(item.id);save.selectedAura=item.id;save.avatar="custom";ensureIdentityState().baseAvatar="custom";persist();renderAvatarBuilder();renderSideAvatar();toast(`${item.icon} ${item.name} desbloqueada y equipada`)
}
function equipAura(id){if(!save.aurasOwned.includes(id))return;save.selectedAura=id;save.avatar="custom";ensureIdentityState().baseAvatar="custom";persist();renderAvatarBuilder();renderSideAvatar();toast(`${AVATAR_AURAS.find(x=>x.id===id)?.icon||"✨"} Aura equipada en tu personaje`)}
function renderAvatarAuras(){
 const box=$("avatarAuraGrid");if(!box)return;box.innerHTML="";
 AVATAR_AURAS.forEach(item=>{
  const owned=save.aurasOwned.includes(item.id),selected=save.selectedAura===item.id,allowed=canUseCosmetic(item);
  const d=document.createElement("div");d.className="card cos-card "+(!owned?"locked":"");
  d.innerHTML=`<div class="bigico">${item.icon}</div><h3>${item.name}</h3><p class="muted">${item.desc}</p><div class="aura-chip">${owned?(selected?"✅ Activa":"Disponible"):(item.currency==="season"?"🏅 Temporada":item.currency==="world"?"🗺️ World Tour":allowed?(item.currency==="gems"?item.cost+" 💎":item.cost+" 🪙"):`🔒 Nivel ${item.levelReq}`)}</div>`;
  d.onclick=()=>{if(owned)equipAura(item.id);else if(item.currency==="season")toast("🏅 Se obtiene en el camino de temporada");else if(item.currency==="world")toast("🗺️ Se obtiene en World Tour");else if(allowed)buyAura(item.id);else toast(`Sube al nivel ${item.levelReq} para desbloquearla`)};
  box.appendChild(d)
 })
}

function selectIdentityBase(id){ensureIdentityState();save.identity.baseAvatar=id;save.avatar=id==="custom"?"custom":id;const a=AVATARS.find(x=>x.id===id);if(a)save.profileGender=profileAvatarGenderForId(id,a);persist();renderAvatarBuilder();renderSideAvatar();toast("🧬 Avatar base actualizado")}
function identityPreviewHTML(){ensureIdentityState();const box=document.createElement("div");box.className="public-avatar profile-bg-"+(save.identity.profileBackground||"nebula");box.innerHTML=identityAvatarMarkup(save.identity.baseAvatar||save.avatar,{identity:save.identity,customAvatar:save.customAvatar,equippedOutfit:save.equippedOutfit,selectedAura:save.selectedAura});applyFrameToElement(box,save.selectedFrame||"none");applyProfileAnimation(box,save.profileAnimation||"none");applyEntryAnimation(box,{identity:save.identity});return box.outerHTML}
function renderIdentityInventory(targetId,type,titleText,subtitleText){const box=$(targetId);if(!box)return;const items=stableIdentityItems(type);const cfg=identityConfig(type);box.innerHTML=items.map(item=>{const owned=identityOwns(type,item.id),equipped=cfg?.equipKey?ensureIdentityState()[cfg.equipKey]===item.id:type==="emote"?identityEmoteEquipped(item.id):type==="spray"?identitySprayEquipped(item.id):false;const canBuy=item.currency!=="unlock";const rarity=item.rarity||"common";const visual=type==="profilebg"?`<div class="bg-swatch" style="background:${item.style}"></div>`:type==="emote"?`<div class="emote-preview">${item.emoji}</div>`:type==="spray"?`<div class="spray-preview">${item.emoji}</div>`:`<div class="bigico">${item.emoji||item.icon||"✨"}</div>`;const action=type==="emote"?(owned?`toggleIdentityEmote('${item.id}')`:`buyIdentityItem('emote','${item.id}')`):type==="spray"?(owned?`toggleIdentitySpray('${item.id}')`:`buyIdentitySpray('${item.id}')`):(owned?`identityEquip('${type}','${item.id}')`:(canBuy?`buyIdentityItem('${type}','${item.id}')`:`toast('🏆 Se consigue jugando')`));const stateLabel=owned?(equipped?"✅ Equipado":"Disponible"):identityCostLabel(item);return `<div class="card rarity-shell r-${rarity} ${type==='emote'?'emote-card':type==='spray'?'spray-card':'identity-card'} ${owned?'':'locked'} ${equipped?'sel':''}">${rarity==='epic'?'<span class="rarity-feature">PARTÍCULAS</span>':rarity==='legendary'?'<span class="rarity-feature">ANIMADO</span>':rarity==='mythic'?'<span class="rarity-feature">PRESENTACIÓN+</span>':rarity==='prestige'?'<span class="rarity-feature">SOLO LOGRO</span>':''}${visual}<div class="slot-label">${titleText||item.theme||''}</div><h3>${item.name}</h3><div class="muted">${item.desc||subtitleText||''}</div><div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="rarity-badge rarity-${rarity}">${rarityLabel(rarity)}</span><span class="price-pill">${stateLabel}</span></div><button class="btn ${owned?'secondary':'primary'}" style="margin-top:10px" onclick="${action}">${owned?(equipped?'QUITAR / USANDO':'EQUIPAR'):(item.currency==='unlock'?'BLOQUEADO':'DESBLOQUEAR')}</button></div>`}).join('')}
function renderAvatarExpressionHub(){ensureIdentityState();const prev=$("identityExpressionPreview");if(prev){prev.className='identity-preview-stage rarity-shell r-'+equippedIdentityRarity()+' profile-bg-'+(save.identity.profileBackground||'nebula');prev.innerHTML=identityPreviewHTML()+`<div class="identity-avatar-ambient"><span class="identity-ambient-badge">🎭 ${currentIdentityLabel('entry')}</span><span class="identity-ambient-badge">🏆 ${currentIdentityLabel('victory')}</span><span class="identity-ambient-badge">💥 ${currentIdentityLabel('response')}</span></div>`}const slots=$("equippedEmoteSlots");if(slots){const eq=ensureIdentityState().equippedEmotes;slots.innerHTML='';for(let i=0;i<6;i++){const id=eq[i],item=EMOTES_COLLECTION.find(x=>x.id===id);const d=document.createElement('div');d.className='emote-slot '+(item?'':'empty');d.innerHTML=item?`${item.emoji}<div>${item.name}</div>`:`Slot ${i+1}`;slots.appendChild(d)}}renderIdentityInventory('identityEmoteGrid','emote');renderIdentityInventory('identityEntryGrid','entry');renderIdentityInventory('identityVictoryGrid','victory');renderIdentityInventory('identityDefeatGrid','defeat');renderIdentityInventory('identityResponseGrid','response');const ss=$("equippedSpraySlots");if(ss){const eq=ensureIdentityState().equippedSprays;ss.innerHTML='';for(let j=0;j<3;j++){const id=eq[j],item=SPRAYS_COLLECTION.find(x=>x.id===id),d=document.createElement('div');d.className='spray-slot '+(item?'':'empty');d.innerHTML=item?`${item.emoji}<div>${item.name}</div>`:`Slot ${j+1}`;ss.appendChild(d)}}renderIdentityInventory('identitySprayGrid','spray')}
function renderAvatarProfileHub(){ensureIdentityState();const prev=$("identityProfilePreview");if(prev){prev.className='identity-preview-stage rarity-shell r-'+equippedIdentityRarity()+' profile-bg-'+(save.identity.profileBackground||'nebula');prev.innerHTML=identityPreviewHTML()+`<div class="identity-avatar-ambient"><span class="identity-ambient-badge">🖼️ ${profileBackgroundInfo(save.identity.profileBackground).name}</span><span class="identity-ambient-badge">🏷️ ${selectedProfileTitleInfo().label}</span></div>`}const tc=$("identityTitleChip"),bc=$("identityBackgroundChip"),rc=$("identityReactionChip");if(tc)tc.textContent=selectedProfileTitleInfo().label;if(bc)bc.textContent=`🖼️ ${profileBackgroundInfo(save.identity.profileBackground).name}`;if(rc)rc.textContent=`💥 ${currentIdentityLabel('response')}`;const picker=$("identityBasePicker");if(picker){picker.innerHTML='';baseAvatarChoices().forEach(id=>{const owned=id==='custom'||ownedAvatarIdsForProfile().includes(id);const a=id==='custom'?{id:'custom',name:'Personalizado'}:AVATARS.find(x=>x.id===id);if(!a)return;const d=document.createElement('div');d.className='identity-base-option '+((save.identity.baseAvatar||'custom')===id?'sel ':'')+(owned?'':'locked');const visual=id==='custom'?avatarMarkup(save.customAvatar,{equippedOutfit:save.equippedOutfit,selectedAura:save.selectedAura,identity:save.identity}):avatarVisual(a);d.innerHTML=`<div class="identity-base-tag">${baseAvatarType(id)}</div><div class="identity-base-visual">${visual}</div><b>${a.name}</b><div class="muted">${owned?'Disponible':'Bloqueado'}</div>`;d.onclick=()=>owned?selectIdentityBase(id):toast('🔒 Primero desbloquéalo');picker.appendChild(d)})}renderIdentityInventory('identityProfileBgGrid','profilebg');const tg=$("identityTitleGrid");if(tg){const titles=PROFILE_TITLES.filter(t=>t.check());tg.innerHTML=titles.map(t=>`<div class="card identity-card ${(save.selectedTitle||'')===t.id?'sel':''}"><div class="bigico">${t.icon}</div><h3>${t.name}</h3><div class="muted">Título equipable del perfil</div><button class="btn ${(save.selectedTitle||'')===t.id?'secondary':'primary'}" style="margin-top:10px" onclick="save.selectedTitle='${t.id}';persist();renderAvatarProfileHub();renderIdentity();refresh()">${(save.selectedTitle||'')===t.id?'USANDO':'ELEGIR'}</button></div>`).join('')}}
function renderSemantropicCatalog(targetSummary='catalogSummaryGrid',targetSets='catalogSetGrid'){ensureIdentityState();const sg=$(targetSummary);if(sg){sg.innerHTML=themeCatalogGroups().map(g=>{const total=identityThemePool(g.id).length,owned=identityThemeOwned(g.id),pct=total?Math.round(owned/total*100):0;return `<div class="card catalog-card"><div class="bigico">${g.icon}</div><div class="catalog-count">${owned}/${total}</div><h3>${g.name}</h3><div class="catalog-bar"><div style="width:${pct}%"></div></div><div class="catalog-meta"><span class="muted">${pct}% completado</span><span class="count-pill">0.5.0</span></div></div>`}).join('')}const setg=$(targetSets);if(setg){setg.innerHTML=SEMANTROPIC_SETS.map(set=>{const owned=set.items.filter(spec=>ownsBySpec(spec)).length,pct=Math.round(owned/set.items.length*100),claimed=ensureIdentityState().claimedSets.includes(set.id);return `<div class="card set-card ${owned>=set.items.length?'ready identity-set-complete':''}"><div class="bigico">${set.icon}</div><h3>${set.name}</h3><div class="muted">${set.desc}</div><div class="set-items">${set.items.map(spec=>`<span class="set-pill">${ownsBySpec(spec)?'✅':'🔒'} ${setSpecLabel(spec)}</span>`).join('')}</div><div class="set-bar"><div style="width:${pct}%"></div></div><div class="muted" style="margin-top:8px">${owned}/${set.items.length} piezas</div><div class="set-reward">🎁 Recompensa: ${rewardText(set.reward||{})}${set.reward?.title?' + título':''}${set.reward?.background?' + fondo':''}${set.reward?.outfit?' + traje':''}</div><button class="btn ${claimed?'secondary':'primary'}" style="margin-top:10px" ${claimed?'disabled':''} onclick="claimIdentitySet('${set.id}')">${claimed?'✅ RECLAMADO':owned>=set.items.length?'RECLAMAR SET':'EN PROGRESO'}</button></div>`}).join('')}}
function renderCollectionCatalogSummary(){renderSemantropicCatalog('collectionCatalogSummary','collectionSetGrid')}
function renderAvatarLabShop(){renderIdentityInventory('shopHeadwearGrid','headwear');renderIdentityInventory('shopFaceGrid','face');renderIdentityInventory('shopTopGrid','top');renderIdentityInventory('shopBottomGrid','bottom');renderIdentityInventory('shopAccessoryGrid','accessory');renderIdentityInventory('shopEmoteGrid','emote');renderIdentityInventory('shopProfileBgGrid','profilebg');renderIdentityInventory('shopSprayGrid','spray')}
function gameAvatarFigureHTML(mood="ready"){ensureIdentityState();const icon=mood==="nervous"?"😬":mood==="good"?"✨":mood==="bad"?"💢":mood==="win"?"🏆":mood==="lose"?"💧":"";const d=document.createElement("div");d.id="gameAvatarFigure";d.className="public-avatar profile-bg-"+(save.identity.profileBackground||"nebula");d.innerHTML=identityAvatarMarkup(save.identity.baseAvatar||save.avatar,{identity:save.identity,customAvatar:save.customAvatar,equippedOutfit:save.equippedOutfit,selectedAura:save.selectedAura},icon);applyFrameToElement(d,save.selectedFrame||"none");applyProfileAnimation(d,save.profileAnimation||"none");const firstQ=!state||((state.mode==="tournament"?state.ri:state.idx)||0)===0;if(firstQ&&mood==="ready")applyEntryAnimation(d,{identity:save.identity});d.classList.add("mood-"+mood);return d.outerHTML}
function renderGameAvatarWidget(stateName='ready'){ensureIdentityState();const fig=$("gameAvatarFigure"),m=$("gameAvatarMood"),load=$("gameAvatarLoadout"),bar=$("gameEmoteBar"),wrap=$("gameAvatarWidget");if(!fig||!m||!load||!bar||!wrap)return;fig.outerHTML=gameAvatarFigureHTML(stateName);const moodMap={ready:['🙂 Concentrado','question-mood-ready'],nervous:['😬 Quedan 3 segundos','question-mood-nervous'],good:['😄 ¡Bien hecho!','question-mood-good'],bad:['😖 Esa dolió','question-mood-bad'],win:['🏆 Victoria','question-mood-good'],lose:['😭 A seguir','question-mood-bad']};const mood=moodMap[stateName]||moodMap.ready;m.textContent=mood[0];m.className='game-avatar-mood '+mood[1];load.textContent=`${currentIdentityLabel('response')} · ${profileBackgroundInfo(save.identity.profileBackground).name} · ${selectedProfileTitleInfo().name}`;wrap.className='game-avatar-widget response-effect-'+(save.identity.responseEffect||'spark');bar.innerHTML=(save.identity.equippedEmotes||[]).map(id=>{const e=EMOTES_COLLECTION.find(x=>x.id===id);return e?`<span class="game-emote-pill">${e.emoji} ${e.name}</span>`:''}).join('')||'<span class="game-emote-pill">Sin emotes equipados</span>'}
function applyOutfitXp(n){
 const id=save.equippedOutfit||"hoodie";if(!id)return;
 save.outfitXp[id]=Number(save.outfitXp[id]||0)+Math.max(1,Math.round(n));
 const before=cosmeticStageFromXp(Number(save.outfitXp[id]||0)-Math.max(1,Math.round(n))),after=outfitStage(id);
 if(after>before)toast(`✨ ${OUTFITS.find(x=>x.id===id)?.name||id} subió a etapa ${after}`)
}
let levelUpQueue=[],levelUpShowing=false;
function levelRewardPreview(level){
 return level%5===0?{coins:50,gems:1,keys:1}:{coins:0,gems:0,keys:0}
}
function grantLevelRewards(level){
 const reward=levelRewardPreview(level);
 if(reward.coins)save.coins+=reward.coins;
 if(reward.gems)save.gems+=reward.gems;
 if(reward.keys)addKey("silver",reward.keys);
 return reward
}
function queueLevelUpCelebration(level,reward=levelRewardPreview(level)){
 levelUpQueue.push({level,reward});
 const gameVisible=$("game")&&!$("game").classList.contains("hidden");
 const resultVisible=$("resultModal")&&!$("resultModal").classList.contains("hidden");
 if(!gameVisible||resultVisible)setTimeout(showNextLevelUpCelebration,80)
}
function showNextLevelUpCelebration(){
 if(levelUpShowing||!levelUpQueue.length)return;
 const item=levelUpQueue.shift();levelUpShowing=true;
 $("levelUpNumber").textContent=item.level;
 const milestone=item.reward?.coins||item.reward?.gems||item.reward?.keys;
 $("levelUpRewardText").textContent=milestone?"🎁 ¡Hito de 5 niveles alcanzado!":"¡Excelente! Sigue sumando experiencia.";
 const icons=$("levelUpRewardIcons");icons.innerHTML="";
 if(milestone){
  [[`🪙 +${item.reward.coins}`],[`💎 +${item.reward.gems}`],[`🔑 +${item.reward.keys}`]].forEach(x=>{const s=document.createElement("span");s.textContent=x[0];icons.appendChild(s)})
 }else{
  const next=Math.min(MAX_LEVEL,Math.ceil((item.level+1)/5)*5);
  const s=document.createElement("span");s.textContent=item.level>=MAX_LEVEL?"👑 NIVEL MÁXIMO":"🎯 Próximo premio: nivel "+next;icons.appendChild(s)
 }
 beep("win");$("levelUpModal").classList.remove("hidden")
}
function closeLevelUpCelebration(){
 $("levelUpModal").classList.add("hidden");levelUpShowing=false;
 if(levelUpQueue.length)setTimeout(showNextLevelUpCelebration,120)
}
function flushLevelUpCelebrations(){if(levelUpQueue.length&&!levelUpShowing)setTimeout(showNextLevelUpCelebration,120)}
function gainXp(n,cosmeticShare=.55){
 const amount=Math.max(0,Math.round(Number(n)||0));if(!amount)return;
 save.totalXp=Number(save.totalXp||0)+amount;
 applyOutfitXp(Math.max(1,Math.round(amount*cosmeticShare)));
 if(save.level>=MAX_LEVEL){save.level=MAX_LEVEL;save.xp=levelXpRequired(MAX_LEVEL);refresh();return}
 save.xp+=amount;
 while(save.level<MAX_LEVEL&&save.xp>=levelXpRequired(save.level)){
  save.xp-=levelXpRequired(save.level);
  save.level++;
  const reward=grantLevelRewards(save.level);
  queueLevelUpCelebration(save.level,reward)
 }
 if(save.level>=MAX_LEVEL){save.level=MAX_LEVEL;save.xp=levelXpRequired(MAX_LEVEL)}
 refresh()
}
function saveCustomAvatar(){save.avatar="custom";ensureIdentityState().baseAvatar="custom";persist();beep("power");renderSideAvatar();toast("✅ Personaje personalizado guardado y equipado")}
