const http=require("http");
const fs=require("fs");
const path=require("path");
const os=require("os");
const crypto=require("crypto");
const {Pool}=require("pg");

const ROOT=__dirname;
const PORT=Number(process.env.PORT||8787);
const DATABASE_URL=String(process.env.DATABASE_URL||"").trim();
const ADMIN_KEY=String(process.env.ADMIN_KEY||"");
const QUESTIONS=JSON.parse(fs.readFileSync(path.join(ROOT,"general_questions.json"),"utf8"));
const DATA_DIR=path.join(ROOT,"data");
const RANK_FILE=path.join(DATA_DIR,"rankings.json");
const ACCOUNTS_FILE=path.join(DATA_DIR,"accounts.json");
const SESSIONS_FILE=path.join(DATA_DIR,"account_sessions.json");
const SETTINGS_FILE=path.join(DATA_DIR,"game_settings.json");
const RESET_REQUESTS_FILE=path.join(DATA_DIR,"password_reset_requests.json");
if(!fs.existsSync(DATA_DIR))fs.mkdirSync(DATA_DIR,{recursive:true});

let rankings={},accounts={},accountByPlayerId={},accountSessions=new Map(),passwordResetRequests={};
let gameConfig={wheelCooldownMs:2*60*60*1000,wheelPrizes:[{type:"coins",amount:100},{type:"coins",amount:250},{type:"gems",amount:1},{type:"gems",amount:2},{type:"keys",amount:1},{type:"shield",amount:1},{type:"double",amount:1},{type:"surprise",amount:1}]};
try{rankings=JSON.parse(fs.readFileSync(RANK_FILE,"utf8"))}catch(e){rankings={}}
try{accounts=JSON.parse(fs.readFileSync(ACCOUNTS_FILE,"utf8"))}catch(e){accounts={}}
try{const raw=JSON.parse(fs.readFileSync(SESSIONS_FILE,"utf8"));accountSessions=new Map(Object.entries(raw||{}))}catch(e){accountSessions=new Map()}
try{const raw=JSON.parse(fs.readFileSync(SETTINGS_FILE,"utf8"));if(raw&&raw.wheelCooldownMs)gameConfig=raw}catch(e){}
try{passwordResetRequests=JSON.parse(fs.readFileSync(RESET_REQUESTS_FILE,"utf8"))||{}}catch(e){passwordResetRequests={}}
let pool=null,storageMode="file";
const rooms=new Map();
const adminSessions=new Map();
const adminFailures=new Map();
const accountFailures=new Map();
const MIME={".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".css":"text/css; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".svg":"image/svg+xml",".txt":"text/plain; charset=utf-8"};


const MAX_LEVEL=50;
function xpThreshold(level){level=clamp(level,1,MAX_LEVEL);return Math.min(500,80+Math.max(0,level-1)*12)}
function cleanStringArray(v,allowedDefault=[]){return [...new Set((Array.isArray(v)?v:allowedDefault).map(x=>String(x||"").trim()).filter(Boolean))]}
function normalizeProfileMeta(meta={}){
 const defaults={level:1,xp:0,totalXp:0,customAvatar:{presentation:"male",skin:"warm",hairStyle:"short",hairColor:"brown",expression:"smile",accessory:"none",bg:"violet"},wardrobeOwned:["hoodie"],equippedOutfit:"hoodie",outfitXp:{hoodie:0},aurasOwned:["none"],selectedAura:"none",ownedAvatars:["starter_m","starter_f","brain"],ownedFrames:["none"],creatorUnlockAll:false,season:{key:"",points:0,claimed:[]},missionState:{},loginStreak:{lastDate:"",count:0,best:0,totalDays:0},chestStats:{opened:0,common:0,rare:0,legendary:0,legendaryPity:0},lifetime:{missionsClaimed:0,seasonClaims:0},worldTour:{selected:"chile",planeAt:"chile",countries:{},continentsClaimed:[],passportClaimed:[],eventWeek:"",eventCountry:"",eventClaimed:false}};
 const out={...defaults,...(meta||{})};
 out.level=clamp(out.level,1,MAX_LEVEL);
 out.xp=Math.max(0,Number(out.xp||0));
 out.totalXp=Math.max(0,Number(out.totalXp||0));
 out.customAvatar={...defaults.customAvatar,...(meta?.customAvatar||{})};
 out.wardrobeOwned=cleanStringArray(out.wardrobeOwned,["hoodie"]);if(!out.wardrobeOwned.includes("hoodie"))out.wardrobeOwned.unshift("hoodie");
 out.aurasOwned=cleanStringArray(out.aurasOwned,["none"]);if(!out.aurasOwned.includes("none"))out.aurasOwned.unshift("none");
 out.ownedAvatars=cleanStringArray(out.ownedAvatars,["starter_m","starter_f","brain"]);["starter_m","starter_f","brain"].forEach(x=>{if(!out.ownedAvatars.includes(x))out.ownedAvatars.push(x)});
 out.ownedFrames=cleanStringArray(out.ownedFrames,["none"]);if(!out.ownedFrames.includes("none"))out.ownedFrames.unshift("none");
 out.equippedOutfit=String(out.equippedOutfit||"hoodie");if(!out.wardrobeOwned.includes(out.equippedOutfit))out.equippedOutfit=out.wardrobeOwned[0]||"hoodie";
 out.selectedAura=String(out.selectedAura||"none");if(!out.aurasOwned.includes(out.selectedAura))out.selectedAura=out.aurasOwned[0]||"none";
 out.creatorUnlockAll=!!out.creatorUnlockAll;
 out.season={key:String(out.season?.key||""),points:Math.max(0,Number(out.season?.points||0)),claimed:[...new Set((Array.isArray(out.season?.claimed)?out.season.claimed:[]).map(Number).filter(x=>x>=1&&x<=20))]};
 out.missionState=(out.missionState&&typeof out.missionState==="object")?out.missionState:{};
 out.loginStreak={lastDate:String(out.loginStreak?.lastDate||""),count:Math.max(0,Number(out.loginStreak?.count||0)),best:Math.max(0,Number(out.loginStreak?.best||0)),totalDays:Math.max(0,Number(out.loginStreak?.totalDays||0))};
 out.chestStats={opened:Math.max(0,Number(out.chestStats?.opened||0)),common:Math.max(0,Number(out.chestStats?.common||0)),rare:Math.max(0,Number(out.chestStats?.rare||0)),legendary:Math.max(0,Number(out.chestStats?.legendary||0)),legendaryPity:Math.max(0,Number(out.chestStats?.legendaryPity||0))};
 out.lifetime={missionsClaimed:Math.max(0,Number(out.lifetime?.missionsClaimed||0)),seasonClaims:Math.max(0,Number(out.lifetime?.seasonClaims||0))};
 out.worldTour={selected:String(out.worldTour?.selected||"chile"),planeAt:String(out.worldTour?.planeAt||"chile"),countries:(out.worldTour?.countries&&typeof out.worldTour.countries==="object")?out.worldTour.countries:{},continentsClaimed:cleanStringArray(out.worldTour?.continentsClaimed,[]),passportClaimed:cleanStringArray(out.worldTour?.passportClaimed,[]),eventWeek:String(out.worldTour?.eventWeek||""),eventCountry:String(out.worldTour?.eventCountry||""),eventClaimed:!!out.worldTour?.eventClaimed};
 const ox={hoodie:0};for(const [k,v] of Object.entries(out.outfitXp||{}))ox[String(k)]=Math.max(0,Number(v||0));out.outfitXp=ox;
 return out
}
function gainRankXp(r,amount){
 amount=Math.max(0,Math.round(Number(amount)||0));if(!amount)return;
 const meta=normalizeProfileMeta(r.profileMeta||{level:r.level||1,xp:r.xp||0});
 meta.totalXp=Math.max(0,Number(meta.totalXp||0))+amount;
 if(meta.level>=MAX_LEVEL){meta.level=MAX_LEVEL;meta.xp=xpThreshold(MAX_LEVEL);r.level=meta.level;r.xp=meta.xp;r.profileMeta=meta;return}
 meta.xp+=amount;
 while(meta.level<MAX_LEVEL&&meta.xp>=xpThreshold(meta.level)){
  meta.xp-=xpThreshold(meta.level);
  meta.level++;
  if(meta.level%5===0){r.coins+=50;r.gems+=1;r.keys+=1}
 }
 if(meta.level>=MAX_LEVEL){meta.level=MAX_LEVEL;meta.xp=xpThreshold(MAX_LEVEL)}
 r.level=meta.level;r.xp=meta.xp;r.profileMeta=meta
}

const ONLINE_ACH_RULES=[
 ["online_first_game",r=>r.games>=1],
 ["online_first_win",r=>r.wins>=1],
 ["online_games5",r=>r.games>=5],
 ["online_games10",r=>r.games>=10],
 ["online_games25",r=>r.games>=25],
 ["online_wins3",r=>r.wins>=3],
 ["online_wins10",r=>r.wins>=10],
 ["online_ranked_win",r=>r.onlineStats.rankedWins>=1],
 ["online_rank1100",r=>r.rating>=1100],
 ["online_rank1250",r=>r.rating>=1250],
 ["online_battle_win",r=>r.onlineStats.battleWins>=1],
 ["online_comp_win",r=>r.onlineStats.competitionWins>=1],
 ["online_team_play",r=>r.onlineStats.teamGames>=1],
 ["online_team_win",r=>r.onlineStats.teamWins>=1],
 ["online_team3",r=>r.onlineStats.teamWins>=3],
 ["online_perfect",r=>r.onlineStats.perfectGames>=1],
 ["online_blitz_win",r=>r.onlineStats.blitzWins>=1],
 ["online_marathon",r=>r.onlineStats.marathonGames>=1]
];

function cleanName(v){return String(v||"Jugador").replace(/[<>]/g,"").trim().slice(0,18)||"Jugador"}
function cleanBio(v){return String(v||"").replace(/[<>]/g,"").replace(/\s+/g," ").trim().slice(0,90)}
function cleanId(v,fallback=""){const s=String(v||"");return /^[a-z0-9_:-]{0,48}$/i.test(s)?s:fallback}
function cleanGender(v){return ["male","female","neutral","animal"].includes(v)?v:"neutral"}
function cleanAchievements(v){return [...new Set((Array.isArray(v)?v:[]).map(x=>cleanId(x,"")).filter(Boolean))].slice(0,120)}
function clamp(n,min,max){n=Number(n);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):min}
function cleanUsername(v){const s=String(v||"").trim();if(!/^[A-Za-z0-9_.-]{3,20}$/.test(s))return null;return s}
function usernameKey(v){const s=cleanUsername(v);return s?s.toLowerCase():null}
function validPassword(v){return typeof v==="string"&&v.length>=8&&v.length<=72}
function hashPassword(password,saltHex=null){const salt=saltHex?Buffer.from(saltHex,"hex"):crypto.randomBytes(16),hash=crypto.scryptSync(String(password),salt,64);return{salt:salt.toString("hex"),hash:hash.toString("hex")}}
function verifyPassword(password,account){try{const got=hashPassword(password,account.passwordSalt);return secureEqual(got.hash,account.passwordHash)}catch(e){return false}}
function accountMustChange(a){return !!(a&&a.forcePasswordChange)}
function generateTemporaryPassword(){
 const chars="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
 const part=n=>Array.from({length:n},()=>chars[Math.floor(Math.random()*chars.length)]).join("");
 return `ST-${part(4)}-${part(4)}-${part(4)}`
}
function wheelMeta(type,amount){amount=clamp(amount,1,100000);if(type==="coins")return{type,amount,icon:"🪙",label:`${amount} Monedas`};if(type==="gems")return{type,amount,icon:"💎",label:`${amount} Diamante${amount===1?"":"s"}`};if(type==="keys")return{type,amount,icon:"🔑",label:`${amount} Llave${amount===1?"":"s"}`};if(type==="shield")return{type,amount,icon:"🛡️",label:amount===1?"Escudo":`${amount} Escudos`};if(type==="double")return{type,amount,icon:"⚡",label:amount===1?"Doble x2":`${amount} Dobles x2`};if(type==="life")return{type,amount,icon:"❤️",label:amount===1?"Vida extra":`${amount} Vidas extra`};return{type:"surprise",amount:1,icon:"🎁",label:"Sorpresa"}}
function normalizeGameConfig(v={}){const allowed=new Set(["coins","gems","keys","shield","double","life","surprise"]),src=Array.isArray(v.wheelPrizes)?v.wheelPrizes:gameConfig.wheelPrizes,prizes=src.slice(0,8).map(p=>wheelMeta(allowed.has(p?.type)?p.type:"surprise",p?.amount||1));while(prizes.length<8)prizes.push(wheelMeta("coins",100));return{wheelCooldownMs:clamp(v.wheelCooldownMs??gameConfig.wheelCooldownMs,60000,7*24*60*60*1000),wheelPrizes:prizes}}

function normalizeOnlineStats(s={}){return{
 battleGames:Number(s.battleGames||0),rankedGames:Number(s.rankedGames||0),competitionGames:Number(s.competitionGames||0),teamGames:Number(s.teamGames||0),blitzGames:Number(s.blitzGames||0),marathonGames:Number(s.marathonGames||0),
 battleWins:Number(s.battleWins||0),rankedWins:Number(s.rankedWins||0),competitionWins:Number(s.competitionWins||0),teamWins:Number(s.teamWins||0),blitzWins:Number(s.blitzWins||0),marathonWins:Number(s.marathonWins||0),
 correct:Number(s.correct||0),answers:Number(s.answers||0),perfectGames:Number(s.perfectGames||0),bestScore:Number(s.bestScore||0)
}}
function normalizeRank(id,r={}){
 const profileMeta=normalizeProfileMeta(r.profileMeta??r.profile_meta??{level:r.level||1,xp:r.xp||0});
 return{
 id:String(id),name:cleanName(r.name),rating:Number(r.rating??1000),wins:Number(r.wins||0),losses:Number(r.losses||0),games:Number(r.games||0),totalScore:Number(r.totalScore??r.total_score??0),
 coins:Number(r.coins??200),gems:Number(r.gems||0),keys:Number(r.keys??1),lastWheelSpin:Number(r.lastWheelSpin??r.last_wheel_spin??0),recent:Array.isArray(r.recent)?r.recent:[],revision:Number(r.revision||0),authHash:r.authHash||r.auth_hash||null,
 avatarId:cleanId(r.avatarId??r.avatar_id,"starter_m")||"starter_m",gender:cleanGender(r.gender||"neutral"),frameId:cleanId(r.frameId??r.frame_id,"none")||"none",
 featuredAchievement:cleanId(r.featuredAchievement??r.featured_achievement,""),bio:cleanBio(r.bio),achievements:cleanAchievements(r.achievements),onlineStats:normalizeOnlineStats(r.onlineStats??r.online_stats??{}),
 level:clamp(r.level??profileMeta.level,1,MAX_LEVEL),xp:Math.max(0,Number(r.xp??profileMeta.xp??0)),profileMeta
}}
function saveFile(){const safe={};for(const [id,r] of Object.entries(rankings))safe[id]={...r,recent:(r.recent||[]).slice(-250)};try{fs.writeFileSync(RANK_FILE,JSON.stringify(safe,null,2),"utf8")}catch(e){console.error("file persistence:",e.message)}}
function saveAccountsFile(){
 try{
  fs.writeFileSync(ACCOUNTS_FILE,JSON.stringify(accounts,null,2),"utf8");
  fs.writeFileSync(SESSIONS_FILE,JSON.stringify(Object.fromEntries(accountSessions),null,2),"utf8");
  fs.writeFileSync(SETTINGS_FILE,JSON.stringify(gameConfig,null,2),"utf8");
  fs.writeFileSync(RESET_REQUESTS_FILE,JSON.stringify(passwordResetRequests,null,2),"utf8")
 }catch(e){console.error("account/settings persistence:",e.message)}
}

async function initStore(){
 if(!DATABASE_URL){
  storageMode="file";
  const cleanupMarker=path.join(DATA_DIR,"alpha_0_2_7_initial_account_cleanup.done");
  if(!fs.existsSync(cleanupMarker)){
   rankings={};accounts={};accountByPlayerId={};accountSessions=new Map();passwordResetRequests={};
   saveFile();saveAccountsFile();
   fs.writeFileSync(cleanupMarker,"done","utf8");
   console.log("[Alpha 0.2.7] Limpieza única: cuentas y perfiles de prueba eliminados.")
  }
  for(const [id,r] of Object.entries(rankings))rankings[id]=normalizeRank(id,r);
  accountByPlayerId={};
  for(const [k,a] of Object.entries(accounts)){
   if(a?.playerId){
    a.forcePasswordChange=!!a.forcePasswordChange;
    accountByPlayerId[a.playerId]=k
   }
  }
  gameConfig=normalizeGameConfig(gameConfig);return
 }
 try{
  pool=new Pool({connectionString:DATABASE_URL});
  await pool.query(`CREATE TABLE IF NOT EXISTS players(
   id TEXT PRIMARY KEY,name TEXT NOT NULL,rating INTEGER NOT NULL DEFAULT 1000,wins INTEGER NOT NULL DEFAULT 0,losses INTEGER NOT NULL DEFAULT 0,games INTEGER NOT NULL DEFAULT 0,total_score INTEGER NOT NULL DEFAULT 0,
   coins INTEGER NOT NULL DEFAULT 200,gems INTEGER NOT NULL DEFAULT 0,keys INTEGER NOT NULL DEFAULT 1,last_wheel_spin BIGINT NOT NULL DEFAULT 0,recent JSONB NOT NULL DEFAULT '[]'::jsonb,revision INTEGER NOT NULL DEFAULT 0,auth_hash TEXT,
   avatar_id TEXT NOT NULL DEFAULT 'starter_m',gender TEXT NOT NULL DEFAULT 'neutral',frame_id TEXT NOT NULL DEFAULT 'none',featured_achievement TEXT NOT NULL DEFAULT '',bio TEXT NOT NULL DEFAULT '',achievements JSONB NOT NULL DEFAULT '[]'::jsonb,online_stats JSONB NOT NULL DEFAULT '{}'::jsonb,level INTEGER NOT NULL DEFAULT 1,xp INTEGER NOT NULL DEFAULT 0,profile_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const migrations=[
   `ALTER TABLE players ADD COLUMN IF NOT EXISTS avatar_id TEXT NOT NULL DEFAULT 'starter_m'`,
   `ALTER TABLE players ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT 'neutral'`,
   `ALTER TABLE players ADD COLUMN IF NOT EXISTS frame_id TEXT NOT NULL DEFAULT 'none'`,
   `ALTER TABLE players ADD COLUMN IF NOT EXISTS featured_achievement TEXT NOT NULL DEFAULT ''`,
   `ALTER TABLE players ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT ''`,
   `ALTER TABLE players ADD COLUMN IF NOT EXISTS achievements JSONB NOT NULL DEFAULT '[]'::jsonb`,
   `ALTER TABLE players ADD COLUMN IF NOT EXISTS online_stats JSONB NOT NULL DEFAULT '{}'::jsonb`,
   `ALTER TABLE players ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1`,
   `ALTER TABLE players ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0`,
   `ALTER TABLE players ADD COLUMN IF NOT EXISTS profile_meta JSONB NOT NULL DEFAULT '{}'::jsonb`
  ];
  for(const sql of migrations)await pool.query(sql);
  await pool.query(`CREATE TABLE IF NOT EXISTS accounts(
   username_key TEXT PRIMARY KEY,username TEXT NOT NULL,player_id TEXT UNIQUE NOT NULL,
   password_salt TEXT NOT NULL,password_hash TEXT NOT NULL,
   force_password_change BOOLEAN NOT NULL DEFAULT FALSE,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`CREATE TABLE IF NOT EXISTS password_reset_requests(
   username_key TEXT PRIMARY KEY REFERENCES accounts(username_key) ON DELETE CASCADE,
   requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS account_sessions(token_hash TEXT PRIMARY KEY,username_key TEXT NOT NULL,player_id TEXT NOT NULL,expires_at BIGINT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS game_settings(key TEXT PRIMARY KEY,value JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);

  // Limpieza ÚNICA de las cuentas/perfiles de prueba existentes antes de este hotfix.
  // El marcador queda guardado en PostgreSQL y evita que futuros reinicios borren cuentas nuevas.
  const cleanupKey="alpha_0_2_7_initial_account_cleanup";
  const cleanupState=await pool.query('SELECT value FROM app_meta WHERE key=$1',[cleanupKey]);
  if(!cleanupState.rows.length){
   await pool.query('BEGIN');
   try{
    await pool.query('DELETE FROM account_sessions');
    await pool.query('DELETE FROM password_reset_requests');
    await pool.query('DELETE FROM accounts');
    await pool.query('DELETE FROM players');
    await pool.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[cleanupKey,'done']);
    await pool.query('COMMIT');
    console.log("[Alpha 0.2.7] Limpieza única: cuentas y perfiles de prueba eliminados.")
   }catch(cleanupError){
    await pool.query('ROLLBACK');
    throw cleanupError
   }
  }

  const {rows}=await pool.query('SELECT id,name,rating,wins,losses,games,total_score,coins,gems,keys,last_wheel_spin,recent,revision,auth_hash,avatar_id,gender,frame_id,featured_achievement,bio,achievements,online_stats,level,xp,profile_meta FROM players');
  rankings={};for(const row of rows)rankings[row.id]=normalizeRank(row.id,row);
  const ar=await pool.query('SELECT username_key,username,player_id,password_salt,password_hash,force_password_change FROM accounts');accounts={};accountByPlayerId={};for(const a of ar.rows){accounts[a.username_key]={username:a.username,playerId:a.player_id,passwordSalt:a.password_salt,passwordHash:a.password_hash,forcePasswordChange:!!a.force_password_change};accountByPlayerId[a.player_id]=a.username_key}
  const pr=await pool.query('SELECT username_key,requested_at FROM password_reset_requests ORDER BY requested_at ASC');
  passwordResetRequests={};
  for(const row of pr.rows)passwordResetRequests[row.username_key]={requestedAt:new Date(row.requested_at).getTime()};
  const sr=await pool.query('SELECT token_hash,username_key,player_id,expires_at FROM account_sessions WHERE expires_at>$1',[Date.now()]);accountSessions=new Map(sr.rows.map(s=>[s.token_hash,{usernameKey:s.username_key,playerId:s.player_id,expiresAt:Number(s.expires_at)}]));
  const gr=await pool.query("SELECT value FROM game_settings WHERE key='wheel'");if(gr.rows[0]?.value)gameConfig=normalizeGameConfig(gr.rows[0].value);else gameConfig=normalizeGameConfig(gameConfig);
  storageMode="postgres";
  console.log(`Postgres conectado: ${rows.length} perfiles, ${ar.rows.length} cuentas.`)
 }catch(e){console.error("Postgres no disponible, usando archivo temporal:",e.message);pool=null;storageMode="file";for(const [id,r] of Object.entries(rankings))rankings[id]=normalizeRank(id,r)}
}
async function persistRank(r){
 rankings[r.id]=r;
 r.profileMeta=normalizeProfileMeta(r.profileMeta||{level:r.level||1,xp:r.xp||0});
 r.level=clamp(r.level??r.profileMeta.level,1,MAX_LEVEL);
 r.xp=Math.max(0,Number(r.xp??r.profileMeta.xp??0));
 r.profileMeta.level=r.level;r.profileMeta.xp=r.xp;
 if(storageMode!=="postgres"||!pool){saveFile();return}
 await pool.query(`INSERT INTO players(id,name,rating,wins,losses,games,total_score,coins,gems,keys,last_wheel_spin,recent,revision,auth_hash,avatar_id,gender,frame_id,featured_achievement,bio,achievements,online_stats,level,xp,profile_meta,updated_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21::jsonb,$22,$23,$24::jsonb,NOW())
 ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,rating=EXCLUDED.rating,wins=EXCLUDED.wins,losses=EXCLUDED.losses,games=EXCLUDED.games,total_score=EXCLUDED.total_score,coins=EXCLUDED.coins,gems=EXCLUDED.gems,keys=EXCLUDED.keys,last_wheel_spin=EXCLUDED.last_wheel_spin,recent=EXCLUDED.recent,revision=EXCLUDED.revision,auth_hash=EXCLUDED.auth_hash,avatar_id=EXCLUDED.avatar_id,gender=EXCLUDED.gender,frame_id=EXCLUDED.frame_id,featured_achievement=EXCLUDED.featured_achievement,bio=EXCLUDED.bio,achievements=EXCLUDED.achievements,online_stats=EXCLUDED.online_stats,level=EXCLUDED.level,xp=EXCLUDED.xp,profile_meta=EXCLUDED.profile_meta,updated_at=NOW()`,
 [r.id,r.name,r.rating,r.wins,r.losses,r.games,r.totalScore,r.coins,r.gems,r.keys,String(r.lastWheelSpin||0),JSON.stringify((r.recent||[]).slice(-250)),r.revision||0,r.authHash||null,r.avatarId,r.gender,r.frameId,r.featuredAchievement||"",r.bio||"",JSON.stringify(r.achievements||[]),JSON.stringify(r.onlineStats||{}),r.level||1,r.xp||0,JSON.stringify(r.profileMeta||{})])
}
async function persistAccount(key,a){
 accounts[key]=a;accountByPlayerId[a.playerId]=key;
 if(storageMode!=="postgres"||!pool){saveAccountsFile();return}
 await pool.query(`INSERT INTO accounts(username_key,username,player_id,password_salt,password_hash,force_password_change,updated_at)
 VALUES($1,$2,$3,$4,$5,$6,NOW())
 ON CONFLICT(username_key) DO UPDATE SET username=EXCLUDED.username,player_id=EXCLUDED.player_id,password_salt=EXCLUDED.password_salt,password_hash=EXCLUDED.password_hash,force_password_change=EXCLUDED.force_password_change,updated_at=NOW()`,
 [key,a.username,a.playerId,a.passwordSalt,a.passwordHash,!!a.forcePasswordChange])
}
async function createAccountSession(key,playerId){const token=crypto.randomBytes(32).toString("base64url"),tokenHash=hashToken(token),expiresAt=Date.now()+30*24*60*60*1000;accountSessions.set(tokenHash,{usernameKey:key,playerId,expiresAt});if(storageMode==="postgres"&&pool)await pool.query('INSERT INTO account_sessions(token_hash,username_key,player_id,expires_at) VALUES($1,$2,$3,$4) ON CONFLICT(token_hash) DO UPDATE SET expires_at=EXCLUDED.expires_at',[tokenHash,key,playerId,String(expiresAt)]);else saveAccountsFile();return token}
async function deleteAccountSession(token){const h=hashToken(token);accountSessions.delete(h);if(storageMode==="postgres"&&pool)await pool.query('DELETE FROM account_sessions WHERE token_hash=$1',[h]);else saveAccountsFile()}
async function deleteAllAccountSessions(usernameKey){
 for(const [h,s] of [...accountSessions])if(s.usernameKey===usernameKey)accountSessions.delete(h);
 if(storageMode==="postgres"&&pool)await pool.query('DELETE FROM account_sessions WHERE username_key=$1',[usernameKey]);
 else saveAccountsFile()
}
async function deleteAccountAndProfile(playerId){
 const id=String(playerId||"");
 if(!id)throw new Error("Jugador inválido");
 const key=accountByPlayerId[id]||"";

 if(storageMode==="postgres"&&pool){
  await pool.query('BEGIN');
  try{
   if(key){
    await pool.query('DELETE FROM account_sessions WHERE username_key=$1',[key]);
    await pool.query('DELETE FROM password_reset_requests WHERE username_key=$1',[key]);
    await pool.query('DELETE FROM accounts WHERE username_key=$1',[key])
   }
   await pool.query('DELETE FROM players WHERE id=$1',[id]);
   await pool.query('COMMIT')
  }catch(e){
   await pool.query('ROLLBACK');throw e
  }
 }else{
  if(key){
   for(const [h,s] of [...accountSessions])if(s.usernameKey===key)accountSessions.delete(h);
   delete passwordResetRequests[key];
   delete accounts[key];
   delete accountByPlayerId[id]
  }
  delete rankings[id];
  saveFile();saveAccountsFile()
 }

 if(key){
  for(const [h,s] of [...accountSessions])if(s.usernameKey===key)accountSessions.delete(h);
  delete passwordResetRequests[key];
  delete accounts[key];
  delete accountByPlayerId[id]
 }
 delete rankings[id];

 for(const room of rooms.values()){
  if(room.players?.has(id))kickRoomPlayer(room,id,"Tu cuenta fue eliminada por el administrador")
 }
 return {ok:true,playerId:id,username:key}
}
async function persistPasswordResetRequest(usernameKey){
 const requestedAt=Date.now();passwordResetRequests[usernameKey]={requestedAt};
 if(storageMode==="postgres"&&pool){
  await pool.query(`INSERT INTO password_reset_requests(username_key,requested_at) VALUES($1,NOW())
   ON CONFLICT(username_key) DO UPDATE SET requested_at=NOW()`,[usernameKey])
 }else saveAccountsFile();
 return requestedAt
}
async function clearPasswordResetRequest(usernameKey){
 delete passwordResetRequests[usernameKey];
 if(storageMode==="postgres"&&pool)await pool.query('DELETE FROM password_reset_requests WHERE username_key=$1',[usernameKey]);
 else saveAccountsFile()
}
function sessionForToken(token){const h=hashToken(token),s=accountSessions.get(h);if(!s)return null;if(Number(s.expiresAt)<=Date.now()){accountSessions.delete(h);return null}return s}
function verifyProfileAccess(r,token){if(verifyProfileToken(r,token))return true;const s=sessionForToken(token);return !!(s&&r&&s.playerId===r.id)}
async function persistGameConfig(){gameConfig=normalizeGameConfig(gameConfig);if(storageMode==="postgres"&&pool)await pool.query(`INSERT INTO game_settings(key,value,updated_at) VALUES('wheel',$1::jsonb,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,[JSON.stringify(gameConfig)]);else saveAccountsFile()}
function adminAccountUsername(playerId){const k=accountByPlayerId[playerId];return k&&accounts[k]?accounts[k].username:""}
function adminAccountState(playerId){
 const k=accountByPlayerId[playerId],a=k&&accounts[k];
 return a?{username:a.username,mustChangePassword:!!a.forcePasswordChange}:null
}

function json(res,status,obj){const body=JSON.stringify(obj);res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(body)}
function body(req){return new Promise((resolve,reject)=>{let d="";req.on("data",c=>{d+=c;if(d.length>1e6)req.destroy()});req.on("end",()=>{try{resolve(d?JSON.parse(d):{})}catch(e){reject(e)}});req.on("error",reject)})}
function roomCode(){const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let c="";do{c="";for(let i=0;i<5;i++)c+=chars[Math.floor(Math.random()*chars.length)]}while(rooms.has(c));return c}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
function hashToken(v){return crypto.createHash('sha256').update(String(v||'')).digest('hex')}
function secureEqual(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function getRank(id,name){id=String(id);if(!rankings[id])rankings[id]=normalizeRank(id,{name});rankings[id].name=cleanName(name||rankings[id].name);return rankings[id]}
function publicView(r){return{id:r.id,name:r.name,rating:r.rating,wins:r.wins,losses:r.losses,games:r.games,totalScore:r.totalScore,avatarId:r.avatarId,gender:r.gender,frameId:r.frameId,featuredAchievement:r.featuredAchievement||"",bio:r.bio||"",achievements:r.achievements||[],achievementCount:(r.achievements||[]).length,onlineStats:r.onlineStats||{},level:r.level||1,xp:r.xp||0,profileMeta:normalizeProfileMeta(r.profileMeta||{level:r.level||1,xp:r.xp||0})}}
function publicProfile(r){return{...publicView(r),coins:r.coins,gems:r.gems,keys:r.keys,lastWheelSpin:r.lastWheelSpin,revision:r.revision||0,storage:storageMode,accountUsername:adminAccountUsername(r.id)}}
function topRanking(){return Object.values(rankings).sort((a,b)=>b.rating-a.rating||b.wins-a.wins||b.totalScore-a.totalScore).slice(0,50).map(publicView)}
function currentSeasonKey(){const d=new Date();return`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`}
function ensureServerSeason(r){const meta=normalizeProfileMeta(r.profileMeta||{}),key=currentSeasonKey();if(meta.season.key!==key)meta.season={key,points:0,claimed:[]};r.profileMeta=meta;return meta.season}
function addSeasonPoints(r,n){const s=ensureServerSeason(r);s.points=Math.max(0,Number(s.points||0)+Math.max(0,Math.round(Number(n)||0)));r.profileMeta.season=s}
function topSeasonRanking(){const key=currentSeasonKey();return Object.values(rankings).map(r=>{ensureServerSeason(r);return r}).filter(r=>r.profileMeta?.season?.key===key&&Number(r.profileMeta?.season?.points||0)>0).sort((a,b)=>Number(b.profileMeta.season.points||0)-Number(a.profileMeta.season.points||0)||b.wins-a.wins).slice(0,50).map(publicView)}
function verifyProfileToken(r,token){return !!(r&&r.authHash&&token&&secureEqual(r.authHash,hashToken(token)))}
function profileSummary(id){
 const r=rankings[id];
 return r?{avatarId:r.avatarId,gender:r.gender,frameId:r.frameId,featuredAchievement:r.featuredAchievement||"",achievementCount:(r.achievements||[]).length,level:r.level||1,profileMeta:normalizeProfileMeta(r.profileMeta||{})}:{avatarId:"starter_m",gender:"neutral",frameId:"none",featuredAchievement:"",achievementCount:0,level:1,profileMeta:normalizeProfileMeta({})}
}
function publicPlayers(room){return[...room.players.values()].map(p=>({id:p.id,name:p.name,score:p.score,lives:p.lives,answered:!!p.answered,eliminated:!!p.eliminated,online:(room.streams.get(p.id)?.size||0)>0,team:p.team||null,...profileSummary(p.id)}))}
function applyClientProfileFields(r,b,{initial=false}={}){
 if(initial){
  if((!r.avatarId||r.avatarId==="starter_m")&&b.avatarId!==undefined)r.avatarId=cleanId(b.avatarId,"starter_m")||"starter_m";
  if(!r.bio&&b.bio)r.bio=cleanBio(b.bio);
  if(!r.featuredAchievement&&b.featuredAchievement)r.featuredAchievement=cleanId(b.featuredAchievement,"");
  if((!r.frameId||r.frameId==="none")&&b.frameId)r.frameId=cleanId(b.frameId,"none")||"none";
  if(r.gender==="neutral"&&b.gender)r.gender=cleanGender(b.gender)
 }else{
  if(b.avatarId!==undefined)r.avatarId=cleanId(b.avatarId,r.avatarId)||r.avatarId;
  if(b.gender!==undefined)r.gender=cleanGender(b.gender);
  if(b.frameId!==undefined)r.frameId=cleanId(b.frameId,r.frameId)||r.frameId;
  if(b.bio!==undefined)r.bio=cleanBio(b.bio)
 }
 if(Array.isArray(b.achievements))r.achievements=[...new Set([...(r.achievements||[]),...cleanAchievements(b.achievements)])];
 if(b.featuredAchievement!==undefined){const f=cleanId(b.featuredAchievement,"");r.featuredAchievement=!f||(r.achievements||[]).includes(f)?f:r.featuredAchievement}
 if(b.profileMeta!==undefined){
  const incoming=normalizeProfileMeta({...r.profileMeta,...b.profileMeta,level:b.profileMeta?.level??r.level,xp:b.profileMeta?.xp??r.xp});
  r.profileMeta=incoming;r.level=incoming.level;r.xp=incoming.xp
 }
 if(b.level!==undefined)r.level=clamp(b.level,1,MAX_LEVEL);
 if(b.xp!==undefined)r.xp=Math.max(0,Number(b.xp||0));
 r.profileMeta=normalizeProfileMeta({...r.profileMeta,level:r.level||1,xp:r.xp||0});
 r.name=cleanName(b.name||r.name)
}
function unlockOnlineAchievements(r){const before=new Set(r.achievements||[]),added=[];for(const [id,fn] of ONLINE_ACH_RULES){if(!before.has(id)&&fn(r)){before.add(id);added.push(id)}}r.achievements=[...before];return added}
function sendSSE(res,msg){try{res.write(`data: ${JSON.stringify(msg)}\n\n`)}catch(e){}}
function broadcast(room,msg){for(const set of room.streams.values())for(const res of set)sendSSE(res,msg)}
function lobby(room){room.lastActivity=Date.now();broadcast(room,{type:"lobby",code:room.code,mode:room.mode,hostId:room.hostId,players:publicPlayers(room)})}
function publicRooms(){return[...rooms.values()].map(r=>({code:r.code,mode:r.mode,status:r.status,hostId:r.hostId,hostName:r.players.get(r.hostId)?.name||"",createdAt:r.createdAt,lastActivity:r.lastActivity||r.createdAt,round:r.round||0,players:publicPlayers(r)})).sort((a,b)=>b.createdAt-a.createdAt)}
function closeRoom(room,message="La sala fue cerrada"){if(!room)return;clearTimeout(room.timer);broadcast(room,{type:"roomClosed",message});for(const set of room.streams.values())for(const res of set)try{res.end()}catch(e){}room.streams.clear();rooms.delete(room.code)}
function kickRoomPlayer(room,targetId,message="Fuiste expulsado de la sala"){const target=room.players.get(targetId);if(!target)return false;const sets=room.streams.get(targetId);if(sets)for(const res of sets){sendSSE(res,{type:"kicked",message});try{res.end()}catch(e){}}room.streams.delete(targetId);room.players.delete(targetId);room.lastActivity=Date.now();if(room.players.size===0){closeRoom(room,"Sala vacía");return true}if(room.hostId===targetId)room.hostId=room.players.keys().next().value;if(room.status==="lobby")lobby(room);else broadcast(room,{type:"players",players:publicPlayers(room)});return true}
function teamCounts(room){const c={A:0,B:0};for(const p of room.players.values())if(p.team&&c[p.team]!==undefined)c[p.team]++;return c}
function nextTeam(room){const c=teamCounts(room);return c.A<=c.B?"A":"B"}
function createRoom(playerId,name,mode){const code=roomCode(),p={id:playerId,name:cleanName(name),score:0,lives:3,answered:null,eliminated:false,team:mode==="teams"?"A":null,correctCount:0,answerCount:0};const maxRounds=mode==="ranked"||mode==="blitz"?10:mode==="marathon"?25:(mode==="competition"||mode==="teams")?12:15,durationMs=mode==="blitz"?8000:15000;const r={code,mode,hostId:playerId,status:"lobby",players:new Map([[playerId,p]]),streams:new Map(),createdAt:Date.now(),lastActivity:Date.now(),round:0,maxRounds,durationMs,current:null,timer:null,finishing:false,questions:[],used:[]};rooms.set(code,r);return r}
function roomQuestionSet(room,count){const recent=new Set();for(const p of room.players.values()){const r=getRank(p.id,p.name);for(const q of(r.recent||[]).slice(-180))recent.add(q)}let pool=QUESTIONS.filter(q=>!recent.has(q.id));if(pool.length<count*2)pool=[...QUESTIONS];const by={};for(const q of shuffle(pool))(by[q.category]??=[]).push(q);const cats=shuffle(Object.keys(by)),out=[];let idx=0,guard=0;while(out.length<count&&guard++<10000){const c=cats[idx++%cats.length],arr=by[c];if(arr?.length)out.push(arr.pop())}if(out.length<count){const used=new Set(out.map(q=>q.id));out.push(...shuffle(pool.filter(q=>!used.has(q.id))).slice(0,count-out.length))}return out}
function prepareQuestion(q){const opts=q.answers.map((text,i)=>({text,correct:i===q.correct})),mixed=shuffle(opts);return{id:q.id,category:q.category,difficulty:q.difficulty,question:q.question,answers:mixed.map(x=>x.text),correct:mixed.findIndex(x=>x.correct)}}
function startMatch(room){room.status="playing";room.round=0;room.used=[];room.questions=roomQuestionSet(room,room.maxRounds);for(const p of room.players.values()){p.score=0;p.lives=3;p.answered=null;p.eliminated=false;p.correctCount=0;p.answerCount=0}nextQuestion(room)}
function nextQuestion(room){if(room.status!=="playing")return;room.round++;if(room.round>room.maxRounds)return finishMatch(room);const raw=room.questions[room.round-1];if(!raw)return finishMatch(room);const q=prepareQuestion(raw),durationMs=room.durationMs||15000,endsAt=Date.now()+durationMs;room.current={...q,seq:room.round,endsAt};room.finishing=false;room.used.push(q.id);for(const p of room.players.values())p.answered=null;broadcast(room,{type:"question",seq:room.round,round:room.round,totalRounds:room.maxRounds,mode:room.mode,category:q.category,question:q.question,answers:q.answers,endsAt,durationMs,players:publicPlayers(room)});clearTimeout(room.timer);room.timer=setTimeout(()=>finishRound(room),durationMs+100)}
function activePlayers(room){return[...room.players.values()].filter(p=>!p.eliminated)}
function allAnswered(room){const active=activePlayers(room);return active.length>0&&active.every(p=>p.answered)}
function answer(room,playerId,seq,index){room.lastActivity=Date.now();if(room.status!=="playing"||!room.current||room.current.seq!==seq)return{ok:false,error:"La pregunta ya cambió."};const p=room.players.get(playerId);if(!p||p.eliminated)return{ok:false,error:"Jugador no activo."};if(p.answered)return{ok:false,error:"Ya respondiste."};const correct=index===room.current.correct,remaining=Math.max(0,room.current.endsAt-Date.now()),points=correct?100+Math.floor(50*(remaining/Math.max(1000,room.durationMs||15000))):0;p.score+=points;p.answerCount++;if(correct)p.correctCount++;if(room.mode==="battle"&&!correct){p.lives--;if(p.lives<=0)p.eliminated=true}p.answered={index,correct,points};broadcast(room,{type:"players",players:publicPlayers(room)});if(allAnswered(room))setTimeout(()=>finishRound(room),450);return{ok:true}}
function finishRound(room){if(room.status!=="playing"||!room.current||room.finishing)return;room.finishing=true;clearTimeout(room.timer);for(const p of activePlayers(room)){if(!p.answered){p.answerCount++;p.answered={index:null,correct:false,points:0};if(room.mode==="battle"){p.lives--;if(p.lives<=0)p.eliminated=true}}}const q=room.current;broadcast(room,{type:"reveal",correctIndex:q.correct,players:publicPlayers(room)});const alive=activePlayers(room),shouldEnd=(room.mode==="battle"&&alive.length<=1&&room.players.size>=2)||room.round>=room.maxRounds;room.current=null;setTimeout(()=>shouldEnd?finishMatch(room):nextQuestion(room),1500)}
function rankingDeltas(n){if(n<=2)return[20,-12];if(n===3)return[25,5,-10];return[30,10,-5,-15]}
function teamResult(room){const scores={A:0,B:0},correct={A:0,B:0};for(const p of room.players.values()){if(p.team){scores[p.team]+=p.score;correct[p.team]+=p.correctCount||0}}let winner=null;if(scores.A!==scores.B)winner=scores.A>scores.B?"A":"B";else if(correct.A!==correct.B)winner=correct.A>correct.B?"A":"B";return{scores,correct,winner}}
async function finishMatch(room){
 if(room.status!=="playing")return;room.status="finished";room.finishedAt=Date.now();room.lastActivity=Date.now();clearTimeout(room.timer);
 let results=[...room.players.values()],teamData=room.mode==="teams"?teamResult(room):null;
 results.sort((a,b)=>{if(room.mode==="teams"&&teamData?.winner&&a.team!==b.team)return a.team===teamData.winner?-1:1;if(room.mode==="battle"){if(a.eliminated!==b.eliminated)return a.eliminated?1:-1;if(a.lives!==b.lives)return b.lives-a.lives}return b.score-a.score});
 const deltas=rankingDeltas(results.length);
 for(let i=0;i<results.length;i++){
  const p=results[i],r=getRank(p.id,p.name),s=r.onlineStats=normalizeOnlineStats(r.onlineStats);r.games++;r.totalScore+=p.score;s.correct+=p.correctCount||0;s.answers+=p.answerCount||0;s.bestScore=Math.max(s.bestScore||0,p.score||0);
  const modeKey=room.mode==="teams"?"team":room.mode;if(modeKey==="battle")s.battleGames++;else if(modeKey==="ranked")s.rankedGames++;else if(modeKey==="competition")s.competitionGames++;else if(modeKey==="team")s.teamGames++;else if(modeKey==="blitz")s.blitzGames++;else if(modeKey==="marathon")s.marathonGames++;
  let won=false,lost=false;if(room.mode==="teams"){won=!!teamData.winner&&p.team===teamData.winner;lost=!!teamData.winner&&p.team!==teamData.winner}else{won=i===0;lost=i!==0}
  if(won){r.wins++;if(modeKey==="battle")s.battleWins++;else if(modeKey==="ranked")s.rankedWins++;else if(modeKey==="competition")s.competitionWins++;else if(modeKey==="team")s.teamWins++;else if(modeKey==="blitz")s.blitzWins++;else if(modeKey==="marathon")s.marathonWins++}else if(lost)r.losses++;
  if((p.answerCount||0)>=5&&(p.correctCount||0)===(p.answerCount||0))s.perfectGames++;
  let delta=0;if(room.mode==="ranked"){delta=deltas[i]||0;r.rating=Math.max(100,r.rating+delta)}
  const xpBase=12+Math.max(0,Math.round((p.correctCount||0)*4))+Math.max(0,Math.round((p.score||0)/45))+(won?20:6);
  gainRankXp(r,xpBase);addSeasonPoints(r,15+Math.round((p.correctCount||0)*3)+(won?25:8));
  r.recent=[...(r.recent||[]),...room.used].slice(-250);const newAchievements=unlockOnlineAchievements(r);r.revision=(r.revision||0)+1;p.finalRating=r.rating;p.delta=delta;p.newAchievements=newAchievements;await persistRank(r)
 }
 broadcast(room,{type:"matchEnd",mode:room.mode,teamScores:teamData?.scores||null,winningTeam:teamData?.winner||null,results:results.map((p,i)=>({id:p.id,name:p.name,place:i+1,score:p.score,lives:p.lives,rating:p.finalRating,delta:p.delta,team:p.team||null,newAchievements:p.newAchievements||[],...profileSummary(p.id)})),ranking:topRanking()})
}
function leaveRoom(room,id){const wasHost=room.hostId===id;room.players.delete(id);const sets=room.streams.get(id);if(sets)for(const res of sets)try{res.end()}catch(e){}room.streams.delete(id);room.lastActivity=Date.now();if(room.players.size===0){closeRoom(room,"Sala vacía");return}if(wasHost)room.hostId=room.players.keys().next().value;if(room.status==="lobby")lobby(room);else broadcast(room,{type:"players",players:publicPlayers(room)})}
function staticFile(req,res,pathname){let rel=pathname==="/"?"index.html":decodeURIComponent(pathname).replace(/^\/+/,"");const file=path.normalize(path.join(ROOT,rel));if(!file.startsWith(ROOT))return json(res,403,{error:"Forbidden"});fs.stat(file,(err,st)=>{if(err||!st.isFile())return json(res,404,{error:"Not found"});const ext=path.extname(file).toLowerCase();res.writeHead(200,{"Content-Type":MIME[ext]||"application/octet-stream","Cache-Control":ext===".html"?"no-store":"public, max-age=3600"});fs.createReadStream(file).pipe(res)})}
function bearer(req){return String(req.headers.authorization||'').replace(/^Bearer\s+/i,'')}
function validAdmin(req){const t=bearer(req),s=adminSessions.get(t);if(!s||s<Date.now()){if(t)adminSessions.delete(t);return false}return true}
function clientIp(req){return String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim()}
function adminLoginAllowed(req){const ip=clientIp(req),v=adminFailures.get(ip);if(!v||Date.now()-v.start>15*60*1000){adminFailures.delete(ip);return true}return v.count<5}
function adminFail(req){const ip=clientIp(req),v=adminFailures.get(ip);if(!v||Date.now()-v.start>15*60*1000)adminFailures.set(ip,{count:1,start:Date.now()});else v.count++}
function accountLoginAllowed(req,key){const id=clientIp(req)+"|"+String(key||"");const v=accountFailures.get(id);if(!v||Date.now()-v.start>15*60*1000){accountFailures.delete(id);return true}return v.count<8}
function accountFail(req,key){const id=clientIp(req)+"|"+String(key||""),v=accountFailures.get(id);if(!v||Date.now()-v.start>15*60*1000)accountFailures.set(id,{count:1,start:Date.now()});else v.count++}


const server=http.createServer(async(req,res)=>{const u=new URL(req.url,`http://${req.headers.host||"localhost"}`),p=u.pathname;try{
 if(req.method==="GET"&&p==="/api/status")return json(res,200,{ok:true,rooms:rooms.size,players:[...rooms.values()].reduce((a,r)=>a+r.players.size,0),questions:QUESTIONS.length,storage:storageMode,profiles:Object.keys(rankings).length,adminConfigured:!!ADMIN_KEY,accounts:Object.keys(accounts).length});
 if(req.method==="GET"&&p==="/api/ranking")return json(res,200,{ranking:topRanking(),storage:storageMode});
 if(req.method==="GET"&&p==="/api/season-ranking")return json(res,200,{season:currentSeasonKey(),ranking:topSeasonRanking(),storage:storageMode});
 if(req.method==="GET"&&p==="/api/game/config")return json(res,200,gameConfig);
 if(req.method==="POST"&&p==="/api/account/register"){
  const b=await body(req),username=cleanUsername(b.username),key=usernameKey(b.username),password=String(b.password||"");
  if(!username||!key)return json(res,400,{error:"El usuario debe tener 3–20 caracteres: letras, números, punto, guion o guion bajo"});
  if(!validPassword(password))return json(res,400,{error:"La contraseña debe tener entre 8 y 72 caracteres"});
  if(accounts[key])return json(res,409,{error:"Ese nombre de usuario ya existe"});
  const id="p_"+crypto.randomBytes(12).toString("hex");
  const gender=["male","female"].includes(b.gender)?b.gender:"neutral";
  const avatarId=gender==="female"?"starter_f":"starter_m";
  const r=normalizeRank(id,{name:username,coins:200,gems:0,keys:1,avatarId,gender,frameId:"none",achievements:[],onlineStats:{}});
  rankings[id]=r;
  await persistRank(r);
  const hp=hashPassword(password),a={username,playerId:id,passwordSalt:hp.salt,passwordHash:hp.hash,forcePasswordChange:false};
  await persistAccount(key,a);
  const token=await createAccountSession(key,id);
  return json(res,200,{ok:true,username,playerId:id,token,mustChangePassword:false,profile:publicProfile(r)})
 }
 if(req.method==="POST"&&p==="/api/account/login"){
  const b=await body(req),key=usernameKey(b.username),password=String(b.password||"");if(!key||!accountLoginAllowed(req,key))return json(res,429,{error:"Demasiados intentos. Prueba más tarde."});const a=accounts[key];if(!a||!verifyPassword(password,a)){accountFail(req,key);return json(res,401,{error:"Usuario o contraseña incorrectos"})}const r=rankings[a.playerId];if(!r)return json(res,404,{error:"El perfil asociado no existe"});const token=await createAccountSession(key,a.playerId);return json(res,200,{ok:true,username:a.username,playerId:a.playerId,token,mustChangePassword:!!a.forcePasswordChange,profile:publicProfile(r)})
 }
 if(req.method==="POST"&&p==="/api/account/forgot-password"){
  const b=await body(req),key=usernameKey(b.username);
  if(key&&accounts[key])await persistPasswordResetRequest(key);
  return json(res,200,{ok:true,message:"Si la cuenta existe, la solicitud de recuperación quedó registrada."})
 }
 if(req.method==="POST"&&p==="/api/account/me"){const b=await body(req),s=sessionForToken(b.token);if(!s)return json(res,401,{error:"La sesión venció. Inicia sesión nuevamente."});const a=accounts[s.usernameKey],r=rankings[s.playerId];if(!a||!r)return json(res,404,{error:"Cuenta no encontrada"});return json(res,200,{username:a.username,playerId:s.playerId,mustChangePassword:!!a.forcePasswordChange,profile:publicProfile(r)})}
 
 if(req.method==="POST"&&p==="/api/progression/checkin"){
  const b=await body(req),s=sessionForToken(String(b.token||""));if(!s)return json(res,401,{error:"La sesión venció"});const r=rankings[s.playerId];if(!r)return json(res,404,{error:"Perfil no encontrado"});
  const meta=normalizeProfileMeta(r.profileMeta||{}),now=new Date(),today=now.toISOString().slice(0,10),yesterday=new Date(now.getTime()-86400000).toISOString().slice(0,10);let reward=null;
  if(meta.loginStreak.lastDate!==today){const count=meta.loginStreak.lastDate===yesterday?Number(meta.loginStreak.count||0)+1:1;meta.loginStreak={lastDate:today,count,best:Math.max(Number(meta.loginStreak.best||0),count),totalDays:Number(meta.loginStreak.totalDays||0)+1};reward={coins:40+Math.min(count,7)*10,xp:25,gems:count%7===0?1:0,keys:count%7===0?1:0};r.profileMeta=meta;r.coins+=reward.coins;r.gems+=reward.gems;r.keys+=reward.keys;gainRankXp(r,reward.xp);addSeasonPoints(r,10);r.revision=(r.revision||0)+1;await persistRank(r)}
  return json(res,200,{ok:true,streak:r.profileMeta?.loginStreak?.count||0,reward,profile:publicProfile(r)})
 }
 if(req.method==="POST"&&p==="/api/account/logout"){const b=await body(req);if(b.token)await deleteAccountSession(b.token);return json(res,200,{ok:true})}
 if(req.method==="POST"&&p==="/api/account/change-password"){
  const b=await body(req),token=String(b.token||""),s=sessionForToken(token);
  if(!s)return json(res,401,{error:"La sesión venció. Inicia sesión nuevamente."});
  const a=accounts[s.usernameKey];if(!a)return json(res,404,{error:"Cuenta no encontrada"});
  const currentPassword=String(b.currentPassword||""),newPassword=String(b.newPassword||"");
  if(!verifyPassword(currentPassword,a))return json(res,401,{error:"La contraseña actual no es correcta"});
  if(!validPassword(newPassword))return json(res,400,{error:"La nueva contraseña debe tener entre 8 y 72 caracteres"});
  if(currentPassword===newPassword)return json(res,400,{error:"La nueva contraseña debe ser diferente"});
  const hp=hashPassword(newPassword);a.passwordSalt=hp.salt;a.passwordHash=hp.hash;a.forcePasswordChange=false;
  await persistAccount(s.usernameKey,a);
  await clearPasswordResetRequest(s.usernameKey);
  await deleteAllAccountSessions(s.usernameKey);
  const newToken=await createAccountSession(s.usernameKey,a.playerId);
  return json(res,200,{ok:true,token:newToken,username:a.username,playerId:a.playerId,mustChangePassword:false})
 }
 if(req.method==="POST"&&p==="/api/account/logout-all"){
  const b=await body(req),s=sessionForToken(String(b.token||""));
  if(!s)return json(res,401,{error:"La sesión venció"});
  await deleteAllAccountSessions(s.usernameKey);
  return json(res,200,{ok:true})
 }

 if(req.method==="GET"&&p==="/api/profile/public"){const id=String(u.searchParams.get("id")||"");const r=rankings[id];if(!r)return json(res,404,{error:"Perfil no encontrado"});return json(res,200,{profile:publicView(r)})}
 if(req.method==="POST"&&p==="/api/profile/bootstrap"){
  const b=await body(req),id=String(b.playerId||'');if(!id)return json(res,400,{error:'Jugador inválido'});const r=getRank(id,b.name);let token=String(b.token||''),issuedToken=null;
  if(r.authHash){if(!verifyProfileAccess(r,token)){if(accountByPlayerId[id])return json(res,401,{error:'Inicia sesión con tu cuenta Semantropic.'});const recoverable=Number(r.games||0)===0&&Number(r.wins||0)===0&&Number(r.losses||0)===0&&Number(r.totalScore||0)===0;if(!recoverable)return json(res,401,{error:'Este perfil pertenece a otro navegador.'});issuedToken=crypto.randomBytes(24).toString('base64url');token=issuedToken;r.authHash=hashToken(issuedToken);r.revision=Math.max(1,Number(r.revision||0));await persistRank(r)}}else{issuedToken=crypto.randomBytes(24).toString('base64url');token=issuedToken;r.authHash=hashToken(issuedToken);r.coins=clamp(b.coins??r.coins,0,100000000);r.gems=clamp(b.gems??r.gems,0,1000000);r.keys=clamp(b.keys??r.keys,0,1000000);r.lastWheelSpin=Math.max(0,Number(b.lastRewardSpin??r.lastWheelSpin??0));r.revision=(r.revision||0)+1;applyClientProfileFields(r,b,{initial:true});await persistRank(r)}
  applyClientProfileFields(r,b,{initial:true});unlockOnlineAchievements(r);await persistRank(r);return json(res,200,{profile:publicProfile(r),token:issuedToken||undefined})
 }
 if(req.method==="POST"&&p==="/api/profile/sync"){
  const b=await body(req),r=rankings[String(b.playerId||'')];if(!r||!verifyProfileAccess(r,b.token))return json(res,401,{error:'Perfil no autorizado'});if(Number(b.expectedRevision)!==Number(r.revision||0))return json(res,409,{error:'El perfil cambió en el servidor',profile:publicProfile(r)});
  r.coins=clamp(b.coins,0,100000000);r.gems=clamp(b.gems,0,1000000);r.keys=clamp(b.keys,0,1000000);r.lastWheelSpin=Math.max(0,Number(b.lastRewardSpin||0));applyClientProfileFields(r,b);unlockOnlineAchievements(r);r.revision++;await persistRank(r);return json(res,200,{profile:publicProfile(r)})
 }
 if(req.method==="POST"&&p==="/api/profile/customize"){
  const b=await body(req),r=rankings[String(b.playerId||'')];if(!r||!verifyProfileAccess(r,b.token))return json(res,401,{error:'Perfil no autorizado'});applyClientProfileFields(r,b);r.revision++;await persistRank(r);return json(res,200,{profile:publicProfile(r)})
 }
 if(req.method==="POST"&&p==="/api/admin/login"){if(!ADMIN_KEY)return json(res,503,{error:'ADMIN_KEY no está configurada en Render'});if(!adminLoginAllowed(req))return json(res,429,{error:'Demasiados intentos. Prueba más tarde.'});const b=await body(req);if(!secureEqual(String(b.key||''),ADMIN_KEY)){adminFail(req);return json(res,403,{error:'Clave incorrecta'})}const token=crypto.randomBytes(32).toString('base64url');adminSessions.set(token,Date.now()+8*60*60*1000);return json(res,200,{token,expiresHours:8})}
 if(p.startsWith('/api/admin/')&&!validAdmin(req))return json(res,401,{error:'Sesión de administrador inválida o vencida'});
 if(req.method==="GET"&&p==="/api/admin/players"){
  const players=Object.values(rankings).sort((a,b)=>b.rating-a.rating).map(r=>{
   const state=adminAccountState(r.id);
   return{...publicProfile(r),accountUsername:state?.username||"",accountMustChangePassword:!!state?.mustChangePassword}
  });
  return json(res,200,{players,summary:{players:players.length,games:players.reduce((a,x)=>a+x.games,0),rooms:rooms.size,storage:storageMode}})
 }
 if(req.method==="GET"&&p==="/api/admin/password-resets"){
  const requests=Object.entries(passwordResetRequests).map(([key,v])=>{
   const a=accounts[key];return a?{username:a.username,playerId:a.playerId,requestedAt:Number(v.requestedAt||0)}:null
  }).filter(Boolean).sort((a,b)=>a.requestedAt-b.requestedAt);
  return json(res,200,{requests})
 }
 if(req.method==="GET"&&p==="/api/admin/wheel-config")return json(res,200,gameConfig);
 if(req.method==="POST"&&p==="/api/admin/wheel-config"){const b=await body(req);gameConfig=normalizeGameConfig({wheelCooldownMs:Number(b.cooldownMinutes||120)*60000,wheelPrizes:b.prizes});await persistGameConfig();return json(res,200,gameConfig)}
 if(req.method==="GET"&&p==="/api/admin/rooms")return json(res,200,{rooms:publicRooms()});
 if(req.method==="POST"&&p==="/api/admin/room/close"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(!room)return json(res,404,{error:"Sala no encontrada"});closeRoom(room,"Sala cerrada por el propietario");return json(res,200,{ok:true})}
 if(req.method==="POST"&&p==="/api/admin/room/kick"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(!room)return json(res,404,{error:"Sala no encontrada"});const target=String(b.targetId||"");if(!room.players.has(target))return json(res,404,{error:"Jugador no encontrado en la sala"});kickRoomPlayer(room,target,"Fuiste expulsado por el administrador");return json(res,200,{ok:true})}
 if(req.method==="POST"&&p==="/api/admin/player/grant"){const b=await body(req),r=rankings[String(b.playerId||'')];if(!r)return json(res,404,{error:'Jugador no encontrado'});r.coins=Math.max(0,r.coins+clamp(b.coins,-1000000,1000000));r.gems=Math.max(0,r.gems+clamp(b.gems,-100000,100000));r.keys=Math.max(0,r.keys+clamp(b.keys,-100000,100000));r.revision++;await persistRank(r);return json(res,200,{profile:publicProfile(r)})}
 if(req.method==="POST"&&p==="/api/admin/player/rating"){const b=await body(req),r=rankings[String(b.playerId||'')];if(!r)return json(res,404,{error:'Jugador no encontrado'});r.rating=clamp(b.rating,100,5000);unlockOnlineAchievements(r);r.revision++;await persistRank(r);return json(res,200,{profile:publicProfile(r)})}
 if(req.method==="POST"&&p==="/api/admin/player/world-tour"){
  const b=await body(req),r=rankings[String(b.playerId||"")];
  if(!r)return json(res,404,{error:"Jugador no encontrado"});
  r.profileMeta=normalizeProfileMeta(r.profileMeta||{});
  if(String(b.action||"")==="reset"){
   r.profileMeta.worldTour={selected:"chile",planeAt:"chile",countries:{},continentsClaimed:[],passportClaimed:[],eventWeek:"",eventCountry:"",eventClaimed:false}
  }else if(String(b.action||"")==="complete"){
   const ids=["chile","argentina","peru","brazil","colombia","mexico","usa","canada","spain","france","italy","uk","morocco","egypt","japan","south_korea"],countries={};
   for(const id of ids)countries[id]={completed:true,stars:3,knowledge:100,runs:1,stages:{geo:{completed:true,bestPct:100},culture:{completed:true,bestPct:100},history:{completed:true,bestPct:100},people:{completed:true,bestPct:100},curious:{completed:true,bestPct:100}},boss:{completed:true,bestPct:100,bestLives:0}};
   r.profileMeta.worldTour={selected:"south_korea",planeAt:"south_korea",countries,continentsClaimed:["south_america","north_america","europe","africa","asia"],passportClaimed:["3","6","10","16"],eventWeek:"",eventCountry:"",eventClaimed:true}
  }else return json(res,400,{error:"Acción World Tour inválida"});
  r.revision=(r.revision||0)+1;await persistRank(r);
  return json(res,200,{ok:true,profile:publicProfile(r)})
 }
 if(req.method==="POST"&&p==="/api/admin/player/level"){
  const b=await body(req),r=rankings[String(b.playerId||"")];
  if(!r)return json(res,404,{error:"Jugador no encontrado"});
  const level=clamp(b.level,1,MAX_LEVEL);
  r.profileMeta=normalizeProfileMeta(r.profileMeta||{});
  r.level=level;r.xp=0;r.profileMeta.level=level;r.profileMeta.xp=0;
  r.revision++;await persistRank(r);
  return json(res,200,{profile:publicProfile(r)})
 }
 if(req.method==="POST"&&p==="/api/admin/player/xp"){
  const b=await body(req),r=rankings[String(b.playerId||"")];
  if(!r)return json(res,404,{error:"Jugador no encontrado"});
  const amount=clamp(b.amount,0,100000);
  gainRankXp(r,amount);
  r.revision++;await persistRank(r);
  return json(res,200,{profile:publicProfile(r)})
 }
 if(req.method==="POST"&&p==="/api/admin/player/unlock-all"){
  const b=await body(req),r=rankings[String(b.playerId||"")];
  if(!r)return json(res,404,{error:"Jugador no encontrado"});
  r.profileMeta=normalizeProfileMeta(r.profileMeta||{});
  r.profileMeta.creatorUnlockAll=true;
  r.profileMeta.wardrobeOwned=["hoodie","academy","shadow","cosmic","velocity","royal","neonchamp","ascendant","world_explorer"];
  r.profileMeta.aurasOwned=["none","spark","butterflies","firefeet","cosmic","storm","prism","mythic","season_crown","desert_sun","sakura_trail"];
  r.profileMeta.ownedAvatars=["starter_m","starter_f","brain","premium_alma","premium_nico","premium_nara","premium_max","premium_nova","premium_sol","premium_vega","premium_kai","premium_mia","premium_orion","premium_reina","premium_maestro"];
  r.profileMeta.ownedFrames=["none","solar_ring","golden_square","amethyst_royal","ruby_solar","sapphire_imperial","golden_wings","celestial_crown","semantropic_throne","emerald_elite","ascendant_frame","season_vanguard","world_route_frame","world_crown_frame","world_master_frame","world_event_frame"];
  r.profileMeta.outfitXp={hoodie:400,academy:400,shadow:400,cosmic:400,velocity:400,royal:400,neonchamp:400,ascendant:400};
  r.level=MAX_LEVEL;r.xp=xpThreshold(MAX_LEVEL);
  r.profileMeta.level=MAX_LEVEL;r.profileMeta.xp=r.xp;
  r.profileMeta.totalXp=Math.max(Number(r.profileMeta.totalXp||0),5000);
  r.revision++;await persistRank(r);
  return json(res,200,{profile:publicProfile(r)})
 }
 if(req.method==="POST"&&p==="/api/admin/player/reset-wheel"){const b=await body(req);if(b.all){for(const r of Object.values(rankings)){r.lastWheelSpin=0;r.revision++;await persistRank(r)}return json(res,200,{ok:true,count:Object.keys(rankings).length})}const r=rankings[String(b.playerId||'')];if(!r)return json(res,404,{error:'Jugador no encontrado'});r.lastWheelSpin=0;r.revision++;await persistRank(r);return json(res,200,{profile:publicProfile(r)})}
 if(req.method==="POST"&&p==="/api/admin/player/reset-stats"){const b=await body(req),r=rankings[String(b.playerId||'')];if(!r)return json(res,404,{error:'Jugador no encontrado'});r.rating=1000;r.wins=0;r.losses=0;r.games=0;r.totalScore=0;r.recent=[];r.onlineStats=normalizeOnlineStats({});r.achievements=(r.achievements||[]).filter(x=>!x.startsWith('online_'));if(r.featuredAchievement?.startsWith('online_'))r.featuredAchievement="";r.revision++;await persistRank(r);return json(res,200,{profile:publicProfile(r)})}
 if(req.method==="POST"&&p==="/api/admin/player/reset-auth"){const b=await body(req),r=rankings[String(b.playerId||'')];if(!r)return json(res,404,{error:'Jugador no encontrado'});r.authHash='';r.revision++;await persistRank(r);return json(res,200,{ok:true,profile:publicProfile(r)})}
 if(req.method==="POST"&&p==="/api/admin/account/reset-password"){
  const b=await body(req),playerId=String(b.playerId||""),key=accountByPlayerId[playerId],a=key&&accounts[key];
  if(!a)return json(res,404,{error:"Este perfil no tiene una cuenta registrada"});
  let temporaryPassword=String(b.password||"").trim();
  if(!temporaryPassword)temporaryPassword=generateTemporaryPassword();
  if(!validPassword(temporaryPassword))return json(res,400,{error:"La contraseña temporal debe tener entre 8 y 72 caracteres"});
  const hp=hashPassword(temporaryPassword);a.passwordSalt=hp.salt;a.passwordHash=hp.hash;a.forcePasswordChange=b.forceChange!==false;
  await persistAccount(key,a);
  await clearPasswordResetRequest(key);
  await deleteAllAccountSessions(key);
  return json(res,200,{ok:true,username:a.username,temporaryPassword,mustChangePassword:!!a.forcePasswordChange})
 }
 if(req.method==="POST"&&p==="/api/admin/account/logout-sessions"){
  const b=await body(req),playerId=String(b.playerId||""),key=accountByPlayerId[playerId],a=key&&accounts[key];
  if(!a)return json(res,404,{error:"Este perfil no tiene una cuenta registrada"});
  await deleteAllAccountSessions(key);
  return json(res,200,{ok:true,username:a.username})
 }
 if(req.method==="POST"&&p==="/api/admin/account/delete"){
  const b=await body(req),playerId=String(b.playerId||"");
  if(!playerId)return json(res,400,{error:"Jugador inválido"});
  const r=rankings[playerId];
  if(!r)return json(res,404,{error:"Perfil no encontrado"});
  const username=adminAccountUsername(playerId),name=r.name;
  await deleteAccountAndProfile(playerId);
  return json(res,200,{ok:true,playerId,username,name})
 }
 if(req.method==="GET"&&p==="/api/multi/stream"){const code=(u.searchParams.get("code")||"").toUpperCase(),id=u.searchParams.get("playerId")||"",room=rooms.get(code);if(!room||!room.players.has(id))return json(res,404,{error:"Sala o jugador no encontrado"});res.writeHead(200,{"Content-Type":"text/event-stream","Cache-Control":"no-cache","Connection":"keep-alive","X-Accel-Buffering":"no"});res.write(": connected\n\n");if(!room.streams.has(id))room.streams.set(id,new Set());room.streams.get(id).add(res);const hb=setInterval(()=>{try{res.write(": ping\n\n")}catch(e){}},20000);req.on("close",()=>{clearInterval(hb);room.streams.get(id)?.delete(res);if(room.status==="lobby")lobby(room)});if(room.status==="lobby")sendSSE(res,{type:"lobby",code:room.code,mode:room.mode,hostId:room.hostId,players:publicPlayers(room)});return}
 if(req.method==="POST"&&p==="/api/multi/create"){const b=await body(req),mode=["battle","ranked","competition","teams","blitz","marathon"].includes(b.mode)?b.mode:"competition",id=String(b.playerId||'');if(!id)return json(res,400,{error:"Jugador inválido"});const r=getRank(id,b.name);if(r.authHash&&!verifyProfileAccess(r,b.profileToken))return json(res,401,{error:'Perfil online no verificado'});const accKey=accountByPlayerId[id],acc=accKey&&accounts[accKey];if(acc?.forcePasswordChange)return json(res,403,{error:"Debes cambiar tu contraseña temporal antes de jugar online",mustChangePassword:true});const room=createRoom(id,b.name,mode);await persistRank(r);return json(res,200,{code:room.code,mode,hostId:room.hostId})}
 if(req.method==="POST"&&p==="/api/multi/join"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(!room)return json(res,404,{error:"La sala no existe"});if(room.status!=="lobby")return json(res,409,{error:"La partida ya comenzó"});if(room.players.size>=4&&!room.players.has(b.playerId))return json(res,409,{error:"La sala ya tiene 4 jugadores"});const id=String(b.playerId||"");if(!id)return json(res,400,{error:"Jugador inválido"});const r=getRank(id,b.name);if(r.authHash&&!verifyProfileAccess(r,b.profileToken))return json(res,401,{error:'Perfil online no verificado'});const accKey=accountByPlayerId[id],acc=accKey&&accounts[accKey];if(acc?.forcePasswordChange)return json(res,403,{error:"Debes cambiar tu contraseña temporal antes de jugar online",mustChangePassword:true});room.players.set(id,{id,name:cleanName(b.name),score:0,lives:3,answered:null,eliminated:false,team:room.mode==="teams"?nextTeam(room):null,correctCount:0,answerCount:0});await persistRank(r);lobby(room);return json(res,200,{ok:true,mode:room.mode,hostId:room.hostId})}
 if(req.method==="POST"&&p==="/api/multi/team"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase()),id=String(b.playerId||""),team=String(b.team||"").toUpperCase();if(!room)return json(res,404,{error:"Sala no encontrada"});if(room.mode!=="teams"||room.status!=="lobby")return json(res,409,{error:"No puedes cambiar equipo ahora"});if(!["A","B"].includes(team))return json(res,400,{error:"Equipo inválido"});const player=room.players.get(id);if(!player)return json(res,404,{error:"Jugador no encontrado"});const counts=teamCounts(room);if(player.team!==team&&counts[team]>=2){const oldTeam=player.team,swap=[...room.players.values()].find(x=>x.id!==id&&x.team===team);if(!oldTeam||!swap)return json(res,409,{error:"Ese equipo ya tiene 2 jugadores"});swap.team=oldTeam}player.team=team;lobby(room);return json(res,200,{ok:true})}
 if(req.method==="POST"&&p==="/api/multi/start"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(!room)return json(res,404,{error:"Sala no encontrada"});if(room.hostId!==b.playerId)return json(res,403,{error:"Solo el anfitrión puede comenzar"});if(room.mode==="teams"){const c=teamCounts(room);if(room.players.size!==4||c.A!==2||c.B!==2)return json(res,409,{error:"2 vs 2 necesita exactamente 4 jugadores: 2 en cada equipo"})}else{if(room.players.size<2)return json(res,409,{error:"Se necesitan al menos 2 jugadores"});if(room.players.size>4)return json(res,409,{error:"Máximo 4 jugadores"})}startMatch(room);return json(res,200,{ok:true})}
 if(req.method==="POST"&&p==="/api/multi/answer"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(!room)return json(res,404,{error:"Sala no encontrada"});const out=answer(room,String(b.playerId||""),Number(b.seq),Number(b.answer));return json(res,out.ok?200:409,out)}
 if(req.method==="POST"&&p==="/api/multi/kick"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(!room)return json(res,404,{error:"Sala no encontrada"});if(room.hostId!==String(b.playerId||""))return json(res,403,{error:"Solo el anfitrión puede expulsar jugadores"});const target=String(b.targetId||"");if(!target||target===room.hostId)return json(res,400,{error:"No puedes expulsar al anfitrión"});if(!room.players.has(target))return json(res,404,{error:"Jugador no encontrado"});kickRoomPlayer(room,target,"El anfitrión te expulsó de la sala");return json(res,200,{ok:true})}
 if(req.method==="POST"&&p==="/api/multi/close"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(!room)return json(res,404,{error:"Sala no encontrada"});if(room.hostId!==String(b.playerId||""))return json(res,403,{error:"Solo el anfitrión puede cerrar la sala"});closeRoom(room,"El anfitrión cerró la sala");return json(res,200,{ok:true})}
 if(req.method==="POST"&&p==="/api/multi/leave"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(room)leaveRoom(room,String(b.playerId||""));return json(res,200,{ok:true})}
 if(req.method==="GET")return staticFile(req,res,p);return json(res,404,{error:"Not found"})
 }catch(e){console.error(e);return json(res,500,{error:"Error interno del servidor"})}});
setInterval(()=>{const now=Date.now();for(const [code,r] of [...rooms]){const online=[...r.streams.values()].reduce((n,set)=>n+(set?.size||0),0);if(r.status==="finished"&&now-(r.finishedAt||r.lastActivity||r.createdAt)>5*60*1000){closeRoom(r,"Sala finalizada y cerrada automáticamente");continue}if(r.status==="lobby"&&online===0&&now-(r.lastActivity||r.createdAt)>10*60*1000){closeRoom(r,"Sala inactiva cerrada automáticamente");continue}if(r.status!=="playing"&&now-r.createdAt>60*60*1000){closeRoom(r,"Sala expirada");continue}}for(const [t,exp] of adminSessions)if(exp<now)adminSessions.delete(t);for(const [h,s] of accountSessions)if(Number(s.expiresAt)<=now)accountSessions.delete(h)},30000);
initStore().finally(()=>server.listen(PORT,"0.0.0.0",()=>{console.log("\n==========================================");console.log("  SEMANTROPIC TRIVIA — ONLINE ALPHA 0.3.0");console.log("  SEASONS + MISSIONS + ONLINE MODES + PROGRESSION");console.log("==========================================");console.log(`Almacenamiento: ${storageMode}`);console.log(`Admin configurado: ${ADMIN_KEY?'sí':'no'}`);console.log(`PC anfitrión: http://localhost:${PORT}`);const nets=os.networkInterfaces();for(const list of Object.values(nets))for(const n of(list||[]))if(n.family==="IPv4"&&!n.internal)console.log(`Red local:    http://${n.address}:${PORT}`);console.log("\n")}));
