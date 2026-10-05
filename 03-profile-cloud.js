/* ===== CLOUD PROFILE + ADMIN / ALPHA 0.4.0 ===== */
let onlineProfileToken="",onlineProfileRevision=0,onlineProfileReady=false,onlineSyncTimer=null,onlineProfile=null,onlineAccountUsername="",accountLoggedIn=false,serverProfilePollTimer=null,lastServerProfileCheck=0;
function localAchievementIds(){return Object.keys(save.ach||{}).filter(id=>save.ach[id])}
function achievementInfo(id){return ACH.find(a=>a.id===id)||null}
function achievementLabel(id){const a=achievementInfo(id);return a?`${a.icon} ${a.name}`:"🏆 Sin logro exhibido"}
function levelXpRequired(level){return Math.min(500,80+Math.max(0,level-1)*12)}
function levelProgressPercent(){if(save.level>=MAX_LEVEL)return 100;return Math.max(0,Math.min(100,(Number(save.xp||0)/levelXpRequired(save.level))*100))}
function nextLevelMilestone(){for(let i=5;i<=MAX_LEVEL;i+=5)if(save.level<i)return i;return MAX_LEVEL}
function cosmeticStageFromXp(xp){const n=Number(xp||0);if(n>=OUTFIT_MASTERY_STAGES[2])return 3;if(n>=OUTFIT_MASTERY_STAGES[1])return 2;return 1}
function outfitXpValue(id){return Number((save.outfitXp||{})[id]||0)}
function outfitStage(id){return cosmeticStageFromXp(outfitXpValue(id))}
function currentOutfit(){return OUTFITS.find(x=>x.id===save.equippedOutfit)||OUTFITS[0]}
function currentAura(){return AVATAR_AURAS.find(x=>x.id===save.selectedAura)||AVATAR_AURAS[0]}
function applyCreatorTestUnlocks(){
 if(!save.creatorUnlockAll)return;
 save.avatars=[...new Set([...save.avatars,...AVATARS.map(a=>a.id),"custom"])];
 save.framesOwned=[...new Set([...save.framesOwned,...FRAMES.map(f=>f.id)])];
 save.effectsOwned=[...new Set([...save.effectsOwned,...VISUAL_FX.map(f=>f.id)])];
 save.wardrobeOwned=[...new Set([...save.wardrobeOwned,...OUTFITS.map(o=>o.id)])];
 save.aurasOwned=[...new Set([...save.aurasOwned,...AVATAR_AURAS.map(a=>a.id)])];ensureEconomyState();ensureIdentityState();Object.entries(identityPools()).forEach(([type,arr])=>{const cfg=identityConfig(type);if(cfg)save.identity[cfg.ownedKey]=arr.map(x=>x.id)});save.identity.equippedEmotes=EMOTES_COLLECTION.slice(0,6).map(x=>x.id);save.identity.equippedSprays=SPRAYS_COLLECTION.slice(0,3).map(x=>x.id);save.identity.claimedSets=SEMANTROPIC_SETS.map(x=>x.id);save.identity.unlockedTitles=["set_japan_master","set_science_genius","set_world_explorer","set_boss_slayer","set_arcade_master","set_cinema_star","set_animal_friend","set_event_star"];save.keyring={silver:99,gold:50,diamond:25};save.keys=99;save.chestInventory={common:20,epic:20,world:20,legendary:20};save.vault={points:9999,claimed:VAULT_REWARDS.map(r=>r.level)};save.album={claimed:ALBUMS.map(a=>a.id)};save.animationsOwned=PROFILE_ANIMATIONS.map(a=>a.id);PRESTIGE_AVATARS.forEach(a=>{if(!save.avatars.includes(a.id))save.avatars.push(a.id)})
}
function profileMetaPayload(){ensureIdentityState();return{level:save.level||1,xp:save.xp||0,totalXp:save.totalXp||0,customAvatar:save.customAvatar||{},wardrobeOwned:save.wardrobeOwned||["hoodie"],equippedOutfit:save.equippedOutfit||"hoodie",outfitXp:save.outfitXp||{hoodie:0},aurasOwned:save.aurasOwned||["none"],selectedAura:save.selectedAura||"none",ownedAvatars:save.avatars||[],ownedFrames:save.framesOwned||["none"],creatorUnlockAll:!!save.creatorUnlockAll,season:save.season||{},missionState:save.missionState||{},loginStreak:save.loginStreak||{},chestStats:save.chestStats||{},keyring:save.keyring||{},chestInventory:save.chestInventory||{},fragments:save.fragments||{},vault:save.vault||{},album:save.album||{},economyStats:save.economyStats||{},selectedTitle:save.selectedTitle||"",profileAnimation:save.profileAnimation||"none",animationsOwned:save.animationsOwned||["none"],lifetime:save.lifetime||{},worldTour:save.worldTour||{},identity:save.identity||defaultIdentityState()}}
function profileSyncPayload(){return{avatarId:save.avatar||"starter_m",gender:save.profileGender||"neutral",frameId:save.selectedFrame||"none",featuredAchievement:save.featuredAchievement||"",bio:save.profileBio||"",achievements:localAchievementIds(),profileMeta:profileMetaPayload()}}
function ownedAvatarIdsForProfile(){
 const owned=[...new Set(["starter_m","starter_f","brain",...(save.avatars||[])])];
 return save.creatorUnlockAll?[...new Set([...owned,...AVATARS.map(a=>a.id),"custom"])] : owned.filter(id=>id==="custom"||AVATARS.some(a=>a.id===id));
}
function allAvatarIdsForProfile(){
 return [...new Set(["custom",...AVATARS.map(a=>a.id)])]
}
function profileHasAvatarOwnership(profile,avatarId){
 if(!avatarId||["starter_m","starter_f","brain","custom"].includes(avatarId))return true;
 const meta=profile?.profileMeta||{};
 const owned=new Set(["starter_m","starter_f","brain",...(Array.isArray(meta.ownedAvatars)?meta.ownedAvatars:[])]);
 if(meta.creatorUnlockAll)AVATARS.forEach(a=>owned.add(a.id));
 return owned.has(avatarId);
}
function avatarForProfile(p){
 if(!p)return "👨";
 let avatarId=p.avatarId;
 if(!profileHasAvatarOwnership(p,avatarId))avatarId=p.gender==="female"?"starter_f":"starter_m";
 const a=AVATARS.find(x=>x.id===avatarId);
 return a?avatarVisual(a):(p.gender==="female"?"👩":p.gender==="animal"?"🐾":"👨")
}
function profileAvatarHTML(p){const m=p?.profileMeta||{},ident={...defaultIdentityState(),...(m.identity||{})};let avatarId=ident.baseAvatar||p?.avatarId||"starter_m";if(avatarId!=="custom"&&!profileHasAvatarOwnership(p,avatarId))avatarId=p?.gender==="female"?"starter_f":"starter_m";return identityAvatarMarkup(avatarId,{...m,identity:{...ident,baseAvatar:avatarId},customAvatar:m.customAvatar||save.customAvatar||{},equippedOutfit:m.equippedOutfit||"hoodie",selectedAura:m.selectedAura||"none",outfitStage:cosmeticStageFromXp(Number(m.outfitXp?.[m.equippedOutfit||"hoodie"]||0))})}
function profileFrameClass(p){return(FRAMES.find(f=>f.id===(p?.frameId||"none"))||FRAMES[0]).className}
function applyFrameToElement(el,frameId){if(!el)return;FRAMES.forEach(f=>el.classList.remove(f.className));el.classList.add((FRAMES.find(f=>f.id===frameId)||FRAMES[0]).className)}
function applyIdentityBackground(el,meta){if(!el)return;[...el.classList].filter(x=>x.startsWith("profile-bg-")).forEach(x=>el.classList.remove(x));const id=meta?.identity?.profileBackground||"nebula";el.classList.add("profile-bg-"+id)}
function applyEntryAnimation(el,meta){if(!el)return;[...el.classList].filter(x=>x.startsWith("entry-")).forEach(x=>el.classList.remove(x));const id=meta?.identity?.entryAnimation||"none";if(id!=="none")el.classList.add("entry-"+id)}
function applyResultAnimation(el,meta,won){if(!el)return;const id=won?(meta?.identity?.victoryAnimation||"cheer"):(meta?.identity?.defeatAnimation||"shrug");el.classList.add((won?"victory-":"defeat-")+id)}

let accountMustChangePassword=false;
try{onlineProfileToken=localStorage.getItem("semantropicProfileToken")||"";onlineAccountUsername=localStorage.getItem("semantropicAccountUsername")||""}catch(e){}
function setAccountSession(username,playerId,token,profile,mustChangePassword=false){
 onlineAccountUsername=username||"";accountLoggedIn=!!(username&&token);accountMustChangePassword=!!mustChangePassword;onlineProfileToken=token||"";mp.playerId=playerId||mp.playerId;
 try{if(playerId)localStorage.setItem("semantropicOnlinePlayerId",playerId);if(token)localStorage.setItem("semantropicProfileToken",token);if(username)localStorage.setItem("semantropicAccountUsername",username)}catch(e){}
 if(profile){onlineProfileReady=true;applyOnlineProfile(profile,true)}renderAccountUI()
}
function renderAccountUI(){
 const u=$("accountLoggedUsername"),su=$("settingsAccountUsername"),sideU=$("sidebarAccountUsername");
 if(u)u.textContent=onlineAccountUsername||"usuario";
 if(su)su.textContent=onlineAccountUsername||"usuario";
 if(sideU)sideU.textContent=onlineAccountUsername||"usuario";
 if(accountLoggedIn&&accountMustChangePassword)setTimeout(()=>openPasswordModal(true),120)
}
async function refreshAccountSession(){
 accountLoggedIn=false;if(!onlineAccountUsername||!onlineProfileToken){renderAccountUI();return false}
 try{const r=await mpRequest("/api/account/me",{token:onlineProfileToken});setAccountSession(r.username,r.playerId,onlineProfileToken,r.profile,r.mustChangePassword);return true}catch(e){
  accountLoggedIn=false;accountMustChangePassword=false;onlineAccountUsername="";onlineProfileToken="";onlineProfileReady=false;onlineProfile=null;
  try{
   localStorage.removeItem("semantropicAccountUsername");
   localStorage.removeItem("semantropicProfileToken");
   localStorage.removeItem("semantropicOnlinePlayerId")
  }catch(_){}
  renderAccountUI();return false
 }
}
let authMode="login";
function authSetMode(mode){
 authMode=mode;const reg=mode==="register",forgot=mode==="forgot";
 $("authLoginTab").classList.toggle("active",mode==="login");$("authRegisterTab").classList.toggle("active",reg);
 $("authMainModes").classList.toggle("hidden",forgot);
 $("authPassword").classList.toggle("hidden",forgot);$("authPassword2").classList.toggle("hidden",!reg);$("authStarterAvatar").classList.toggle("hidden",!reg);
 $("authForgotHelp").classList.toggle("hidden",!forgot);$("authForgotBtn").classList.toggle("hidden",forgot||reg);$("authBackBtn").classList.toggle("hidden",!forgot);
 $("authPrimaryBtn").textContent=reg?"CREAR MI CUENTA":forgot?"SOLICITAR RECUPERACIÓN":"ENTRAR A SEMANTROPIC";
 $("authPassword").autocomplete=reg?"new-password":"current-password";
 $("authMessage").textContent="";
}
function showAuthGate(message=""){
 document.body.classList.add("auth-locked");$("authGate").classList.remove("hidden");$("authMessage").textContent=message;authSetMode("login")
}
function enterSemantropic(){
 document.body.classList.remove("auth-locked");$("authGate").classList.add("hidden");renderAccountUI();refresh();startServerProfilePolling();page("home");setTimeout(ensureDailyCheckin,350)
}
async function initializeAccountGate(){
 authSetMode("login");
 const msg=$("authMessage");
 if(onlineAccountUsername&&onlineProfileToken){
  msg.textContent="Restaurando tu sesión…";
  if(await refreshAccountSession()){enterSemantropic();return}
 }
 showAuthGate()
}
async function authPrimaryAction(){
 if(authMode==="register")return accountRegister();
 if(authMode==="forgot")return accountForgotPassword();
 return accountLogin()
}
async function accountRegister(){
 const username=($("authUsername")?.value||"").trim(),password=$("authPassword")?.value||"",password2=$("authPassword2")?.value||"",gender=$("authStarterAvatar")?.value||"male",msg=$("authMessage");
 if(password!==password2){msg.textContent="❌ Las contraseñas no coinciden.";return}
 msg.textContent="Creando tu cuenta…";
 try{
  const r=await mpRequest("/api/account/register",{username,password,gender});
  save=blank();
  quietPersist();
  setAccountSession(r.username,r.playerId,r.token,r.profile,r.mustChangePassword);
  msg.textContent="";toast("✅ Cuenta creada. Bienvenido a Semantropic.");enterSemantropic()
 }catch(e){msg.textContent="❌ "+e.message}
}
async function accountLogin(){
 const username=($("authUsername")?.value||"").trim(),password=$("authPassword")?.value||"",msg=$("authMessage");msg.textContent="Iniciando sesión…";
 try{
  const r=await mpRequest("/api/account/login",{username,password});
  setAccountSession(r.username,r.playerId,r.token,r.profile,r.mustChangePassword);
  msg.textContent="";toast(`👋 Bienvenido, @${r.username}`);enterSemantropic()
 }catch(e){msg.textContent="❌ "+e.message}
}
async function accountForgotPassword(){
 const username=($("authUsername")?.value||"").trim(),msg=$("authMessage");
 if(!username){msg.textContent="Escribe primero tu nombre de usuario.";return}
 msg.textContent="Enviando solicitud…";
 try{
  await mpRequest("/api/account/forgot-password",{username});
  msg.textContent="✅ Solicitud enviada. El administrador podrá darte una contraseña temporal. Luego inicia sesión con ella y Semantropic te pedirá crear una nueva."
 }catch(e){msg.textContent="❌ No se pudo enviar la solicitud. Intenta nuevamente."}
}
async function accountLogout(){
 try{if(onlineProfileToken)await mpRequest("/api/account/logout",{token:onlineProfileToken})}catch(e){}
 stopServerProfilePolling();
 accountLoggedIn=false;accountMustChangePassword=false;onlineAccountUsername="";onlineProfileToken="";onlineProfileReady=false;onlineProfile=null;try{localStorage.removeItem("semantropicAccountUsername");localStorage.removeItem("semantropicProfileToken")}catch(e){}renderAccountUI();showAuthGate("Sesión cerrada.");toast("Sesión cerrada")
}
function openPasswordModal(forced=false){
 if(!accountLoggedIn)return;
 $("passwordChangeTitle").textContent=forced?"⚠️ Cambia tu contraseña temporal":"🔑 Cambiar contraseña";
 $("passwordChangeInfo").textContent=forced?"El administrador restableció tu acceso. Para continuar jugando online debes crear una contraseña nueva.":"Escribe tu contraseña actual y luego una nueva.";
 $("passwordChangeMsg").textContent="";
 $("passwordCurrent").value="";$("passwordNew").value="";$("passwordNew2").value="";
 $("passwordCancelBtn").classList.toggle("hidden",forced);
 $("passwordChangeModal").classList.remove("hidden")
}
function closePasswordModal(){
 if(accountMustChangePassword)return toast("Debes cambiar tu contraseña temporal para continuar");
 $("passwordChangeModal").classList.add("hidden")
}
async function accountChangePassword(){
 if(!accountLoggedIn||!onlineProfileToken)return;
 const currentPassword=$("passwordCurrent").value,newPassword=$("passwordNew").value,newPassword2=$("passwordNew2").value,msg=$("passwordChangeMsg");
 if(newPassword!==newPassword2){msg.textContent="❌ Las contraseñas nuevas no coinciden";return}
 if(newPassword.length<8){msg.textContent="❌ La nueva contraseña debe tener al menos 8 caracteres";return}
 msg.textContent="Guardando…";
 try{
  const r=await mpRequest("/api/account/change-password",{token:onlineProfileToken,currentPassword,newPassword});
  onlineProfileToken=r.token;accountMustChangePassword=false;
  try{localStorage.setItem("semantropicProfileToken",r.token)}catch(e){}
  $("passwordChangeModal").classList.add("hidden");renderAccountUI();toast("✅ Contraseña actualizada. Las otras sesiones fueron cerradas.")
 }catch(e){msg.textContent="❌ "+e.message}
}
async function accountLogoutAll(){
 if(!accountLoggedIn||!onlineProfileToken)return;
 if(!confirm("¿Cerrar tu cuenta en todos los dispositivos? También se cerrará esta sesión."))return;
 try{await mpRequest("/api/account/logout-all",{token:onlineProfileToken})}catch(e){}
 await accountLogout()
}

function applyOnlineProfile(p,replaceWallet=true){
 if(!p)return;
 const hadOnlineProfile=!!onlineProfile,previousLevel=Number(save.level||1);
 onlineProfile=p;onlineProfileRevision=Number(p.revision||0);
 if(replaceWallet){save.coins=Number(p.coins??save.coins);save.gems=Number(p.gems??save.gems);save.keys=Number(p.keys??save.keys);save.lastRewardSpin=Number(p.lastWheelSpin??save.lastRewardSpin)}
 if(p.name)save.name=p.name;
 if(p.avatarId!==undefined)save.avatar=p.avatarId;
 if(p.gender)p.gender&&(save.profileGender=p.gender);
 if(p.frameId&&FRAMES.some(f=>f.id===p.frameId)){save.selectedFrame=p.frameId;if(!save.framesOwned.includes(p.frameId))save.framesOwned.push(p.frameId)}
 if(p.bio!==undefined)save.profileBio=p.bio||"";
 if(p.featuredAchievement!==undefined)save.featuredAchievement=p.featuredAchievement||"";
 if(p.level!==undefined)save.level=Math.max(1,Math.min(MAX_LEVEL,Number(p.level||save.level||1)));
 if(p.xp!==undefined)save.xp=Math.max(0,Number(p.xp||0));
 if(p.profileMeta){
  const m=p.profileMeta;
  if(m.customAvatar)save.customAvatar={...save.customAvatar,...m.customAvatar};
  if(Array.isArray(m.wardrobeOwned))save.wardrobeOwned=[...new Set(["hoodie",...m.wardrobeOwned])];
  if(m.equippedOutfit)save.equippedOutfit=m.equippedOutfit;
  if(m.outfitXp)save.outfitXp={...save.outfitXp,...m.outfitXp};
  if(Array.isArray(m.aurasOwned))save.aurasOwned=[...new Set(["none",...m.aurasOwned])];
  if(m.selectedAura!==undefined)save.selectedAura=m.selectedAura||"none";
  if(Array.isArray(m.ownedAvatars))save.avatars=[...new Set(["starter_m","starter_f","brain",...m.ownedAvatars])];
  if(Array.isArray(m.ownedFrames))save.framesOwned=[...new Set(["none",...m.ownedFrames])];
  if(m.totalXp!==undefined)save.totalXp=Number(m.totalXp||save.totalXp||0);
  if(m.creatorUnlockAll!==undefined)save.creatorUnlockAll=!!m.creatorUnlockAll;
  if(m.season)save.season={...save.season,...m.season};
  if(m.missionState)save.missionState={...save.missionState,...m.missionState};
  if(m.loginStreak)save.loginStreak={...save.loginStreak,...m.loginStreak};
  if(m.chestStats)save.chestStats={...save.chestStats,...m.chestStats};
  if(m.keyring){save.keyring={...save.keyring,...m.keyring};save.keyring.silver=Number(p.keys??save.keyring.silver??0);save.keys=Number(save.keyring.silver||0)}
  if(m.chestInventory)save.chestInventory={...save.chestInventory,...m.chestInventory};if(m.fragments)save.fragments={...m.fragments};if(m.vault)save.vault={...save.vault,...m.vault};if(m.album)save.album={...save.album,...m.album};if(m.economyStats)save.economyStats={...save.economyStats,...m.economyStats};if(m.selectedTitle!==undefined)save.selectedTitle=m.selectedTitle||"";if(m.profileAnimation!==undefined)save.profileAnimation=m.profileAnimation||"none";if(Array.isArray(m.animationsOwned))save.animationsOwned=[...new Set(["none",...m.animationsOwned])];
  if(m.lifetime)save.lifetime={...save.lifetime,...m.lifetime};
  if(m.identity)save.identity={...defaultIdentityState(),...m.identity,ownedHeadwear:[...new Set(m.identity.ownedHeadwear||defaultIdentityState().ownedHeadwear)],ownedFaceItems:[...new Set(m.identity.ownedFaceItems||defaultIdentityState().ownedFaceItems)],ownedTopItems:[...new Set(m.identity.ownedTopItems||defaultIdentityState().ownedTopItems)],ownedBottomItems:[...new Set(m.identity.ownedBottomItems||defaultIdentityState().ownedBottomItems)],ownedAccessoryItems:[...new Set(m.identity.ownedAccessoryItems||defaultIdentityState().ownedAccessoryItems)],ownedProfileBackgrounds:[...new Set(m.identity.ownedProfileBackgrounds||defaultIdentityState().ownedProfileBackgrounds)],ownedEntryAnimations:[...new Set(m.identity.ownedEntryAnimations||defaultIdentityState().ownedEntryAnimations)],ownedVictoryAnimations:[...new Set(m.identity.ownedVictoryAnimations||defaultIdentityState().ownedVictoryAnimations)],ownedDefeatAnimations:[...new Set(m.identity.ownedDefeatAnimations||defaultIdentityState().ownedDefeatAnimations)],ownedEmotes:[...new Set(m.identity.ownedEmotes||defaultIdentityState().ownedEmotes)],equippedEmotes:[...new Set(m.identity.equippedEmotes||[])].slice(0,6),ownedSprays:[...new Set(m.identity.ownedSprays||defaultIdentityState().ownedSprays)],equippedSprays:[...new Set(m.identity.equippedSprays||[])].slice(0,3),ownedResponseEffects:[...new Set(m.identity.ownedResponseEffects||defaultIdentityState().ownedResponseEffects)],claimedSets:[...new Set(m.identity.claimedSets||[])],unlockedTitles:[...new Set(m.identity.unlockedTitles||[])]};
  if(m.worldTour)save.worldTour={...save.worldTour,...m.worldTour,countries:{...(m.worldTour.countries||{})},continentsClaimed:[...new Set(m.worldTour.continentsClaimed||[])],passportClaimed:[...new Set(m.worldTour.passportClaimed||[])],questionDecks:{...(m.worldTour.questionDecks||{})}};
 }
 applyCreatorTestUnlocks();
 (p.achievements||[]).forEach(id=>save.ach[id]=true);
 unlockFrames();unlockAchievementAvatars();
 try{if(storageOK)localStorage.setItem("triviaArenaPocketSave",JSON.stringify(save))}catch(e){}
 const set=(id,v)=>{const e=$(id);if(e)e.textContent=v};
 set("opName",p.name||save.name);set("opRankTitle",playerTitle(p.level||1).label);set("opRating",p.rating??1000);set("opWins",p.wins??0);set("opLosses",p.losses??0);set("opGames",p.games??0);set("opCoins",p.coins??0);set("opGems",p.gems??0);set("opFeatured",achievementLabel(p.featuredAchievement));set("opStorage",p.storage==="postgres"?"☁️ Perfil persistente en base de datos":"💾 Perfil en almacenamiento local del servidor");
 const av=$("opAvatar");if(av){av.innerHTML=profileAvatarHTML(p);applyFrameToElement(av,p.frameId);applyIdentityBackground(av,p.profileMeta||{});applyEntryAnimation(av,p.profileMeta||{})}
 if(hadOnlineProfile&&Number(save.level||1)>previousLevel){
  for(let lvl=previousLevel+1;lvl<=Number(save.level||1);lvl++)queueLevelUpCelebration(lvl,levelRewardPreview(lvl))
 }
 refresh();renderAch()
}
async function refreshAuthenticatedProfile({force=false,notify=false}={}){
 if(location.protocol==="file:"||!accountLoggedIn||!onlineProfileToken)return null;
 // Do not pull an old server copy while a local change is waiting to be synchronized.
 if(!force&&onlineSyncTimer)return null;
 try{
  const r=await mpRequest("/api/account/me",{token:onlineProfileToken});
  accountMustChangePassword=!!r.mustChangePassword;
  const incomingRevision=Number(r.profile?.revision||0);
  const changed=force||incomingRevision!==Number(onlineProfileRevision||0);
  if(changed&&r.profile){
   applyOnlineProfile(r.profile,true);
   if(notify)toast("☁️ Perfil actualizado desde el servidor")
  }
  renderAccountUI();
  lastServerProfileCheck=Date.now();
  return r.profile||null
 }catch(e){
  if(e?.message&&/sesión|cuenta no encontrada/i.test(e.message)){
   accountLoggedIn=false;onlineProfileReady=false;onlineProfile=null;onlineProfileToken="";onlineAccountUsername="";
   try{
    localStorage.removeItem("semantropicAccountUsername");
    localStorage.removeItem("semantropicProfileToken");
    localStorage.removeItem("semantropicOnlinePlayerId")
   }catch(_){}
   stopServerProfilePolling();
   showAuthGate("Tu sesión ya no es válida. Inicia sesión nuevamente.")
  }
  return null
 }
}
function startServerProfilePolling(){
 stopServerProfilePolling();
 serverProfilePollTimer=setInterval(()=>{
  if(document.visibilityState==="visible"&&accountLoggedIn)refreshAuthenticatedProfile()
 },10000)
}
function stopServerProfilePolling(){
 if(serverProfilePollTimer)clearInterval(serverProfilePollTimer);
 serverProfilePollTimer=null
}
function applyAdminProfileIfCurrent(playerId,profile){
 if(profile&&String(playerId||"")===String(mpPlayerId()||"")){
  applyOnlineProfile(profile,true);
  return true
 }
 return false
}
window.addEventListener("focus",()=>{if(accountLoggedIn)refreshAuthenticatedProfile()});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&accountLoggedIn)refreshAuthenticatedProfile()});

async function bootstrapOnlineProfile(){
 if(location.protocol==="file:")return null;
 const playerId=mpPlayerId();
 try{
  const r=await mpRequest("/api/profile/bootstrap",{playerId,name:save.name||mpName(),token:onlineProfileToken,coins:save.coins,gems:save.gems,keys:save.keys,lastRewardSpin:save.lastRewardSpin||0,...profileSyncPayload()});
  if(r.token){onlineProfileToken=r.token;try{localStorage.setItem("semantropicProfileToken",r.token)}catch(e){}}
  onlineProfileReady=true;applyOnlineProfile(r.profile,true);
  const status=$("opStorage");
  if(status&&r.profile?.storage==="postgres")status.textContent="☁️ Perfil online verificado y persistente";
  return r.profile
 }catch(e){
  onlineProfileReady=false;
  const status=$("opStorage");
  if(status)status.textContent="⚠️ Perfil online pendiente de verificación";
  return null
 }
}
function scheduleOnlineProfileSync(){
 if(!onlineProfileReady||location.protocol==="file:")return;
 clearTimeout(onlineSyncTimer);onlineSyncTimer=setTimeout(syncOnlineProfile,650)
}
async function syncOnlineProfile(){
 if(!onlineProfileReady||!onlineProfileToken)return;
 try{
  const r=await mpRequest("/api/profile/sync",{playerId:mpPlayerId(),token:onlineProfileToken,expectedRevision:onlineProfileRevision,name:save.name,coins:save.coins,gems:save.gems,keys:save.keys,lastRewardSpin:save.lastRewardSpin||0,...profileSyncPayload()});
  applyOnlineProfile(r.profile,false)
 }catch(e){
  if(e.payload?.profile){applyOnlineProfile(e.payload.profile,true);toast("☁️ Tu perfil se actualizó desde el servidor")}
 }
}
async function refreshOnlineProfile(){if(location.protocol!=="file:")return bootstrapOnlineProfile()}


let profileDraftAvatar="starter_m";
function renderProfileEditPreview(){
 const p={
  avatarId:profileDraftAvatar,
  gender:save.profileGender,
  frameId:$("profileFrameSelect")?.value||save.selectedFrame,
  profileMeta:{...profileMetaPayload(),identity:{...ensureIdentityState(),baseAvatar:profileDraftAvatar}}
 };
 const el=$("profileEditAvatar");
 if(el){
  el.innerHTML=profileAvatarHTML(p);
  applyFrameToElement(el,p.frameId);applyIdentityBackground(el,p.profileMeta||{});applyEntryAnimation(el,p.profileMeta||{})
 }
 const a=$("profileAchievementSelect")?.value||save.featuredAchievement;
 const t=$("profileEditTitle");
 if(t)t.textContent=achievementLabel(a)
}
function profileAvatarGenderForId(id,a){
 if(id==="starter_f"||/_f$/.test(id))return"female";
 if(id==="starter_m"||/_m\d?$/.test(id)||/_m$/.test(id))return"male";
 if(["cat","dog","wolf","fox","horse","lion","panda","rabbit","dragon"].includes(id))return"animal";
 return a?.portrait?.gender||"neutral"
}
function renderProfileAvatarPicker(){
 const picker=$("profileAvatarPicker");if(!picker)return;
 const ownedIds=new Set(ownedAvatarIdsForProfile());
 const allIds=allAvatarIdsForProfile();
 picker.innerHTML="";
 const unlockedCount=allIds.filter(id=>id==="custom"||ownedIds.has(id)).length;

 const header=document.createElement("div");
 header.className="profile-avatar-picker-header";
 header.style.gridColumn="1/-1";
 header.innerHTML=`<div class="muted">Elige un avatar desbloqueado</div><div class="profile-avatar-picker-counter">${unlockedCount}/${allIds.length} disponibles</div>`;
 picker.appendChild(header);

 allIds.map(id=>id==="custom"?{id:"custom",name:"Personalizado"}:AVATARS.find(a=>a.id===id)).filter(Boolean).forEach(a=>{
  const id=a.id;
  const owned=id==="custom"||ownedIds.has(id);
  const selected=profileDraftAvatar===id;
  const d=document.createElement("div");
  d.className="profile-avatar-option "+(selected?"sel ":"")+(owned?"":"locked");

  const visual=id==="custom"
   ? avatarMarkup(save.customAvatar||{},{
       equippedOutfit:save.equippedOutfit||"hoodie",
       selectedAura:save.selectedAura||"none",
       outfitStage:outfitStage(save.equippedOutfit||"hoodie")
     })
   : avatarVisual(a);

  let status="";
  if(selected)status='<div class="profile-avatar-status selected">✓ Seleccionado</div>';
  else if(owned)status='<div class="profile-avatar-status available">Disponible</div>';
  else if(a.levelReq)status=`<div class="profile-avatar-status locked-text">🔒 Nivel ${a.levelReq}</div>`;
  else if(a.currency==="gems")status=`<div class="profile-avatar-status locked-text">🔒 ${a.cost} 💎</div>`;
  else if(a.cost>0)status=`<div class="profile-avatar-status locked-text">🔒 ${a.cost} 🪙</div>`;
  else status='<div class="profile-avatar-status locked-text">🔒 Debes desbloquearlo</div>';

  d.innerHTML=`
   ${!owned?'<span class="lock-badge">🔒</span>':""}
   ${selected?'<span class="profile-avatar-selected-mark">USANDO</span>':""}
   <div class="big">${visual}</div>
   <div class="profile-avatar-name">${a.name}</div>
   ${status}
  `;

  d.onclick=()=>{
   if(!owned){
    toast("🔒 Primero debes desbloquear este avatar");
    return
   }
   profileDraftAvatar=id;
   save.profileGender=profileAvatarGenderForId(id,a);
   renderProfileAvatarPicker();
   renderProfileEditPreview()
  };
  picker.appendChild(d)
 })
}
function openProfileEditor(){openUnifiedAvatarEditor("profile")}
function closeProfileEditor(){}
async function saveProfileCustomization(){return saveUnifiedProfileFields(true)}
async function openPublicProfile(id){try{const r=await mpRequest(`/api/profile/public?id=${encodeURIComponent(id)}`),p=r.profile,m=p.profileMeta||{},ident={...defaultIdentityState(),...(m.identity||{})};const av=$('publicProfileAvatar');av.innerHTML=profileAvatarHTML(p);applyFrameToElement(av,p.frameId);applyIdentityBackground(av,m);applyEntryAnimation(av,m);$('publicProfileName').textContent=p.name;$('publicProfileFeatured').textContent=achievementLabel(p.featuredAchievement);const pr=selectedProfileTitleInfo(m,p.level||1),ps=seasonRank(m?.season?.points||0);$('publicProfileRank').textContent=`${pr.label} · ${ps.label} · ${m?.season?.points||0} SP`;$('publicProfileWorld').textContent=`✈️ World Tour · ${worldCompletedCountFromSave({worldTour:m?.worldTour||worldBlankState()})} países · ${worldTotalStarsFromSave({worldTour:m?.worldTour||worldBlankState()})}⭐ · ${worldAverageKnowledgeFromSave({worldTour:m?.worldTour||worldBlankState()})}%`;$('publicProfileCollection').textContent=`💎 Colección · ${profileCollectionCount(p)}/${collectionTotalCount()}`;$('publicProfilePrestige').textContent=`👑 Prestigio · ${(m?.ownedAvatars||[]).filter(x=>x.startsWith('prestige_')||x==='vault_oracle').length}`;$('publicProfileBio').textContent=p.bio||'Sin descripción pública.';const load=$('publicProfileLoadout');if(load){const pieces=[['🎩',findIdentityItem('headwear',ident.headwear)?.name||'Sin accesorio'],['👕',findIdentityItem('top',ident.topItem)?.name||'Ropa base'],['🎒',findIdentityItem('accessory',ident.accessoryItem)?.name||'Sin accesorio'],['✨',m.selectedAura||'none'],['🖼️',profileBackgroundInfo(ident.profileBackground).name],['💥',findIdentityItem('response',ident.responseEffect)?.name||'Destello']];load.innerHTML=pieces.map(x=>`<div class="public-loadout-chip">${x[0]} ${x[1]}</div>`).join('')}const pe=$('publicProfileEmotes');if(pe)pe.innerHTML=(ident.equippedEmotes||[]).map(eid=>{const e=EMOTES_COLLECTION.find(x=>x.id===eid);return e?`<span class="public-emote-chip">${e.emoji} ${e.name}</span>`:''}).join('');const pspr=$('publicProfileSprays');if(pspr)pspr.innerHTML=(ident.equippedSprays||[]).map(sid=>{const sp=SPRAYS_COLLECTION.find(x=>x.id===sid);return sp?`<span class="public-emote-chip">🎨 ${sp.emoji} ${sp.name}</span>`:''}).join('');$('ppRating').textContent=p.rating;$('ppWins').textContent=p.wins;$('ppLosses').textContent=p.losses;$('ppGames').textContent=p.games;const box=$('publicProfileAchievements');box.innerHTML='';(p.achievements||[]).slice(0,18).forEach(aid=>{const a=achievementInfo(aid);if(a){const s=document.createElement('span');s.className='profile-ach-chip';s.textContent=`${a.icon} ${a.name}`;box.appendChild(s)}});if(!box.children.length)box.innerHTML='<span class="muted">Aún no exhibe logros.</span>';$('publicProfileModal').classList.remove('hidden')}catch(e){toast(e.message)}}
function selectStarterAvatar(id,gender){
 save.avatar=id;save.profileGender=gender;ensureIdentityState().baseAvatar=id;
 save.customAvatar.presentation=gender==="female"?"female":"male";
 if(!save.avatars.includes(id))save.avatars.push(id);
 persist();renderAvatarBuilder();renderAvatars("avatarGridStudio");
 toast(id==="starter_f"?"👩 Avatar femenino seleccionado":"👨 Avatar masculino seleccionado")
}
function setFeaturedAchievement(id){if(id&&!save.ach[id])return;save.featuredAchievement=id||"";persist();renderAch();scheduleOnlineProfileSync();toast(id?`🏆 Ahora exhibes: ${achievementInfo(id)?.name||id}`:"Logro exhibido eliminado")}

let adminToken="",adminPlayers=[],adminRooms=[],adminPasswordResets=[],adminSelectedId=null;
try{adminToken=sessionStorage.getItem("semantropicAdminToken")||""}catch(e){}
async function adminRequest(path,data=null){
 const opts={headers:{"Authorization":"Bearer "+adminToken}};if(data!==null){opts.method="POST";opts.headers["Content-Type"]="application/json";opts.body=JSON.stringify(data)}
 const r=await fetch(path,opts);let out={};try{out=await r.json()}catch(e){}if(!r.ok){const err=new Error(out.error||"Error de administrador");err.payload=out;throw err}return out
}
function renderAdminPage(){
 const logged=!!adminToken;$('adminLoginCard').classList.toggle('hidden',logged);$('adminPanel').classList.toggle('hidden',!logged);$('adminStatus').textContent=logged?'🟢 Sesión de propietario':'🔒 Sesión no iniciada';if(logged)adminRefresh()
}
async function adminLogin(){
 const key=$('adminKeyInput').value;if(!key)return;
 $('adminLoginMsg').textContent='Verificando…';
 try{const r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});const out=await r.json();if(!r.ok)throw new Error(out.error||'Acceso rechazado');adminToken=out.token;sessionStorage.setItem('semantropicAdminToken',adminToken);$('adminKeyInput').value='';$('adminLoginMsg').textContent='';renderAdminPage()}catch(e){$('adminLoginMsg').textContent='❌ '+e.message}
}
function adminLogout(){adminToken='';adminSelectedId=null;try{sessionStorage.removeItem('semantropicAdminToken')}catch(e){}renderAdminPage()}
async function adminRefresh(){
 try{
  const [r,rr,wc,pr]=await Promise.all([adminRequest('/api/admin/players'),adminRequest('/api/admin/rooms'),adminRequest('/api/admin/wheel-config'),adminRequest('/api/admin/password-resets')]);
  adminPlayers=r.players||[];adminRooms=rr.rooms||[];adminPasswordResets=pr.requests||[];renderAdminWheelConfig(wc);renderAdminPasswordResets();
  $('adminPlayersCount').textContent=r.summary?.players??adminPlayers.length;$('adminGamesCount').textContent=r.summary?.games??0;$('adminRoomsCount').textContent=adminRooms.length;$('adminStorageMode').textContent=r.summary?.storage==='postgres'?'POSTGRES':'LOCAL';
  renderAdminPlayers();renderAdminRooms();if(adminSelectedId&&!adminPlayers.some(p=>p.id===adminSelectedId))adminSelect(null)
 }catch(e){if(e.message.toLowerCase().includes('sesión')||e.message.toLowerCase().includes('token'))adminLogout();else toast(e.message)}
}
function renderAdminPasswordResets(){
 const box=$("adminResetRequests");if(!box)return;box.innerHTML="";
 if(!adminPasswordResets.length){box.innerHTML='<div class="muted">No hay solicitudes pendientes.</div>';return}
 adminPasswordResets.forEach(r=>{
  const d=document.createElement("div");d.className="reset-request";
  const when=r.requestedAt?new Date(r.requestedAt).toLocaleString():"";
  d.innerHTML=`<div><b>@${r.username}</b><small>${when}</small></div><button class="btn secondary">SELECCIONAR</button>`;
  d.querySelector("button").onclick=()=>{adminSelect(r.playerId);toast(`Seleccionado @${r.username}. Usa “Contraseña temporal”.`)};
  box.appendChild(d)
 })
}
function renderAdminPlayers(){
 const body=$('adminPlayersBody');if(!body)return;body.innerHTML='';const q=($('adminSearch')?.value||'').trim().toLowerCase();const rows=adminPlayers.filter(p=>!q||p.name.toLowerCase().includes(q)||p.id.toLowerCase().includes(q));
 rows.forEach(p=>{const tr=document.createElement('tr');if(p.id===adminSelectedId)tr.classList.add('selected');const wheel=(Date.now()-Number(p.lastWheelSpin||0)>=REWARD_COOLDOWN_MS)?'Disponible':'Cooldown';tr.innerHTML=`<td><b>${p.name}</b><div class="muted">${p.id.slice(0,10)}…</div></td><td>${p.accountUsername?"@"+p.accountUsername+(p.accountMustChangePassword?" ⚠️":""):"—"}</td><td>${p.rating}</td><td>${p.wins}/${p.losses}</td><td>${p.games}</td><td>${p.coins}</td><td>${p.gems}</td><td>${wheel}</td>`;tr.onclick=()=>adminSelect(p.id);body.appendChild(tr)});
 if(!rows.length)body.innerHTML='<tr><td colspan="8" class="muted">No hay perfiles.</td></tr>'
}
function adminSelect(id){
 adminSelectedId=id;const p=adminPlayers.find(x=>x.id===id);
 $('adminSelectedName').textContent=p?.name||'Ninguno';
 $('adminSelectedId').textContent=p?(p.id+(p.accountUsername?` · @${p.accountUsername}${p.accountMustChangePassword?" · ⚠️ cambio de contraseña pendiente":""}`:" · sin cuenta")):'—';
 if(p){
  $('adminRatingValue').value=p.rating;
  if($('adminLevelValue'))$('adminLevelValue').value=Math.max(1,Math.min(MAX_LEVEL,Number(p.level||1)));
 }
 $('adminTempPassword').value="";
 renderAdminPlayers()
}
function renderAdminWheelConfig(c){
 if(!c)return;const cooldown=Math.round((Number(c.wheelCooldownMs)||7200000)/60000);$("adminWheelCooldown").value=cooldown;REWARD_COOLDOWN_MS=Number(c.wheelCooldownMs)||REWARD_COOLDOWN_MS;if(Array.isArray(c.wheelPrizes)&&c.wheelPrizes.length)PRIZE_WHEEL=c.wheelPrizes;
 const box=$("adminWheelSlots");if(!box)return;box.innerHTML="";PRIZE_WHEEL.forEach((p,i)=>{const d=document.createElement("div");d.className="admin-wheel-slot";d.innerHTML=`<div class="slot-num">${i+1}</div><select data-wheel-type="${i}"><option value="coins">🪙 Monedas</option><option value="gems">💎 Diamantes</option><option value="keys">🔑 Llaves</option><option value="shield">🛡️ Escudo</option><option value="double">⚡ Doble</option><option value="life">❤️ Vida</option><option value="surprise">🎁 Sorpresa</option></select><input data-wheel-amount="${i}" type="number" min="1" max="100000" value="${p.amount||1}">`;box.appendChild(d);d.querySelector("select").value=p.type})
}
async function adminSaveWheelConfig(){
 const cooldownMinutes=Math.max(1,Number($("adminWheelCooldown").value||120)),prizes=[];document.querySelectorAll("[data-wheel-type]").forEach((s,i)=>{const type=s.value,amount=Math.max(1,Number(document.querySelector(`[data-wheel-amount="${i}"]`)?.value||1));prizes.push({type,amount})});
 try{
  const r=await adminRequest("/api/admin/wheel-config",{cooldownMinutes,prizes});
  renderAdminWheelConfig(r);gameConfigLoaded=true;
  renderRewardWheelLabels();updateRewardTimer();
  toast("🎡 Configuración de ruleta guardada")
 }catch(e){toast(e.message)}
}

async function adminGrant(){
 if(!adminSelectedId)return toast('Selecciona un jugador');
 const targetId=adminSelectedId;
 try{
  const r=await adminRequest('/api/admin/player/grant',{playerId:targetId,coins:Number($('adminCoinsDelta').value||0),gems:Number($('adminGemsDelta').value||0),keys:Number($('adminKeysDelta').value||0)});
  applyAdminProfileIfCurrent(targetId,r.profile);
  toast('💰 Recursos actualizados');
  await adminRefresh()
 }catch(e){toast(e.message)}
}
async function adminSetRating(){
 if(!adminSelectedId)return toast('Selecciona un jugador');
 const targetId=adminSelectedId;
 try{
  const r=await adminRequest('/api/admin/player/rating',{playerId:targetId,rating:Number($('adminRatingValue').value||1000)});
  applyAdminProfileIfCurrent(targetId,r.profile);
  toast('🏆 Rating actualizado');
  await adminRefresh()
 }catch(e){toast(e.message)}
}
async function adminSetLevelValue(level){
 if(!adminSelectedId)return toast("Selecciona un jugador");
 const targetId=adminSelectedId;
 level=Math.max(1,Math.min(MAX_LEVEL,Math.round(Number(level)||1)));
 try{
  const r=await adminRequest("/api/admin/player/level",{playerId:targetId,level});
  applyAdminProfileIfCurrent(targetId,r.profile);
  if($("adminLevelValue"))$("adminLevelValue").value=r.profile.level||level;
  toast(`⭐ Nivel fijado en ${r.profile.level}`);
  await adminRefresh()
 }catch(e){toast(e.message)}
}
async function adminSetLevel(){return adminSetLevelValue($("adminLevelValue")?.value||1)}
async function adminAdjustLevel(delta){
 if(!adminSelectedId)return toast("Selecciona un jugador");
 const p=adminPlayers.find(x=>x.id===adminSelectedId);
 return adminSetLevelValue(Number(p?.level||$("adminLevelValue")?.value||1)+Number(delta||0))
}
async function adminGrantXp(){
 if(!adminSelectedId)return toast("Selecciona un jugador");
 const targetId=adminSelectedId;
 try{
  const r=await adminRequest("/api/admin/player/xp",{playerId:targetId,amount:100});
  applyAdminProfileIfCurrent(targetId,r.profile);
  if($("adminLevelValue"))$("adminLevelValue").value=r.profile.level||1;
  toast(`✨ +100 XP · Nivel ${r.profile.level}`);
  await adminRefresh()
 }catch(e){toast(e.message)}
}
async function adminUnlockAllForTesting(){
 if(!adminSelectedId)return toast("Selecciona un jugador");
 const p=adminPlayers.find(x=>x.id===adminSelectedId);
 if(!confirm(`¿Desbloquear TODOS los cosméticos para ${p?.name||"este jugador"}?\n\nSe habilitarán avatares, ropa, auras, marcos y efectos para pruebas.`))return;
 const targetId=adminSelectedId;
 try{
  const r=await adminRequest("/api/admin/player/unlock-all",{playerId:targetId});
  applyAdminProfileIfCurrent(targetId,r.profile);
  if($("adminLevelValue"))$("adminLevelValue").value=MAX_LEVEL;
  toast(`🧪 Todo desbloqueado · Nivel ${MAX_LEVEL} · Maestría máxima`);
  await adminRefresh();
  if(targetId===mpPlayerId()){
   renderAvatarBuilder();renderAvatars("avatarGridStudio");renderFrames();renderFxShop();renderShop()
  }
 }catch(e){toast(e.message)}
}
async function adminResetWheel(all=false){
 if(!all&&!adminSelectedId)return toast('Selecciona un jugador');
 if(all&&!confirm('¿Reiniciar la ruleta de todos los perfiles?'))return;
 const targetId=adminSelectedId;
 try{
  const r=await adminRequest('/api/admin/player/reset-wheel',{playerId:all?null:targetId,all});
  if(all)await refreshAuthenticatedProfile({force:true});
  else applyAdminProfileIfCurrent(targetId,r.profile);
  updateRewardTimer();
  toast(all?'🎡 Todas las ruletas reiniciadas':'🎡 Ruleta reiniciada');
  await adminRefresh()
 }catch(e){toast(e.message)}
}
async function adminResetStats(){
 if(!adminSelectedId)return toast('Selecciona un jugador');
 if(!confirm('¿Reiniciar victorias, derrotas, partidas y rating de este jugador?'))return;
 const targetId=adminSelectedId;
 try{
  const r=await adminRequest('/api/admin/player/reset-stats',{playerId:targetId});
  applyAdminProfileIfCurrent(targetId,r.profile);
  toast('♻️ Estadísticas reiniciadas');
  await adminRefresh()
 }catch(e){toast(e.message)}
}
async function adminResetAuth(){
 if(!adminSelectedId)return toast('Selecciona un jugador');
 const p=adminPlayers.find(x=>x.id===adminSelectedId);
 if(!confirm(`¿Reparar el acceso online de ${p?.name||'este jugador'}?\n\nNo se borrarán monedas, rating ni estadísticas. El jugador deberá recargar la página.`))return;
 try{
  await adminRequest('/api/admin/player/reset-auth',{playerId:adminSelectedId});
  toast('🔑 Credencial reiniciada. El jugador debe recargar la página.');
  adminRefresh()
 }catch(e){toast(e.message)}
}
async function adminResetAccountPassword(password=""){
 if(!adminSelectedId)return toast("Selecciona un jugador");
 const p=adminPlayers.find(x=>x.id===adminSelectedId);
 if(!p?.accountUsername)return toast("Este perfil todavía no tiene una cuenta registrada");
 try{
  const r=await adminRequest("/api/admin/account/reset-password",{playerId:adminSelectedId,password,forceChange:true});
  $("adminTempPassword").value=r.temporaryPassword;
  alert(`Contraseña temporal para @${r.username}:\n\n${r.temporaryPassword}\n\nEntrégala al jugador de forma privada. Al iniciar sesión deberá cambiarla.`);
  toast("🔑 Contraseña temporal creada. Sus sesiones anteriores fueron cerradas.");
  adminRefresh()
 }catch(e){toast(e.message)}
}
async function adminGenerateTempPassword(){
 await adminResetAccountPassword("")
}
async function adminSetTempPassword(){
 const password=($("adminTempPassword").value||"").trim();
 if(!password)return toast("Escribe una contraseña temporal o usa Generar");
 if(password.length<8)return toast("La contraseña temporal debe tener al menos 8 caracteres");
 if(!confirm("¿Reemplazar la contraseña de esta cuenta y cerrar todas sus sesiones?"))return;
 await adminResetAccountPassword(password)
}
async function adminLogoutPlayerSessions(){
 if(!adminSelectedId)return toast("Selecciona un jugador");
 const p=adminPlayers.find(x=>x.id===adminSelectedId);
 if(!p?.accountUsername)return toast("Este perfil todavía no tiene una cuenta registrada");
 if(!confirm(`¿Cerrar todas las sesiones de @${p.accountUsername}?`))return;
 try{await adminRequest("/api/admin/account/logout-sessions",{playerId:adminSelectedId});toast("🚪 Todas las sesiones fueron cerradas")}catch(e){toast(e.message)}
}
async function adminDeleteAccount(){
 if(!adminSelectedId)return toast("Selecciona un jugador");
 const p=adminPlayers.find(x=>x.id===adminSelectedId);
 const label=p?.accountUsername?`@${p.accountUsername}`:(p?.name||"este perfil");
 const deletingSelf=adminSelectedId===mp?.playerId;
 const typed=prompt(
  `⚠️ ELIMINACIÓN DEFINITIVA\n\nSe borrará ${label} junto con su perfil, progreso guardado en servidor, monedas, rating, logros y todas sus sesiones.\n\nEscribe ELIMINAR para confirmar:`
 );
 if(typed!=="ELIMINAR")return toast("Eliminación cancelada");
 try{
  await adminRequest("/api/admin/account/delete",{playerId:adminSelectedId});
  adminSelectedId="";
  $("adminSelectedName").textContent="Ninguno";
  $("adminSelectedId").textContent="—";
  toast("🗑️ Cuenta y perfil eliminados");
  if(deletingSelf){
   accountLoggedIn=false;accountMustChangePassword=false;onlineAccountUsername="";onlineProfileToken="";onlineProfileReady=false;onlineProfile=null;
   try{
    localStorage.removeItem("semantropicAccountUsername");
    localStorage.removeItem("semantropicProfileToken");
    localStorage.removeItem("semantropicOnlinePlayerId")
   }catch(e){}
   showAuthGate("Tu cuenta fue eliminada.");
   return
  }
  await adminRefresh()
 }catch(e){toast(e.message)}
}
