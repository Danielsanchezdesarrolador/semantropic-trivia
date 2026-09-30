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
if(!fs.existsSync(DATA_DIR))fs.mkdirSync(DATA_DIR,{recursive:true});

let rankings={};
try{rankings=JSON.parse(fs.readFileSync(RANK_FILE,"utf8"))}catch(e){rankings={}}
let pool=null,storageMode="file";
const rooms=new Map();
const adminSessions=new Map();
const adminFailures=new Map();

const MIME={".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".css":"text/css; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".svg":"image/svg+xml",".txt":"text/plain; charset=utf-8"};

function normalizeRank(id,r={}){return{id:String(id),name:cleanName(r.name),rating:Number(r.rating??1000),wins:Number(r.wins||0),losses:Number(r.losses||0),games:Number(r.games||0),totalScore:Number(r.totalScore??r.total_score??0),coins:Number(r.coins??200),gems:Number(r.gems||0),keys:Number(r.keys??1),lastWheelSpin:Number(r.lastWheelSpin??r.last_wheel_spin??0),recent:Array.isArray(r.recent)?r.recent:[],revision:Number(r.revision||0),authHash:r.authHash||r.auth_hash||null}}
function saveFile(){const safe={};for(const [id,r] of Object.entries(rankings))safe[id]={...r,recent:(r.recent||[]).slice(-250)};try{fs.writeFileSync(RANK_FILE,JSON.stringify(safe,null,2),"utf8")}catch(e){console.error("file persistence:",e.message)}}
async function initStore(){
 if(!DATABASE_URL){storageMode="file";for(const [id,r] of Object.entries(rankings))rankings[id]=normalizeRank(id,r);return}
 try{
  pool=new Pool({connectionString:DATABASE_URL});
  await pool.query(`CREATE TABLE IF NOT EXISTS players(
   id TEXT PRIMARY KEY,name TEXT NOT NULL,rating INTEGER NOT NULL DEFAULT 1000,wins INTEGER NOT NULL DEFAULT 0,losses INTEGER NOT NULL DEFAULT 0,games INTEGER NOT NULL DEFAULT 0,total_score INTEGER NOT NULL DEFAULT 0,
   coins INTEGER NOT NULL DEFAULT 200,gems INTEGER NOT NULL DEFAULT 0,keys INTEGER NOT NULL DEFAULT 1,last_wheel_spin BIGINT NOT NULL DEFAULT 0,recent JSONB NOT NULL DEFAULT '[]'::jsonb,revision INTEGER NOT NULL DEFAULT 0,auth_hash TEXT,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const {rows}=await pool.query('SELECT id,name,rating,wins,losses,games,total_score,coins,gems,keys,last_wheel_spin,recent,revision,auth_hash FROM players');
  rankings={};for(const row of rows)rankings[row.id]=normalizeRank(row.id,row);storageMode="postgres";
  console.log(`Postgres conectado: ${rows.length} perfiles cargados.`)
 }catch(e){console.error("Postgres no disponible, usando archivo temporal:",e.message);pool=null;storageMode="file";for(const [id,r] of Object.entries(rankings))rankings[id]=normalizeRank(id,r)}
}
async function persistRank(r){
 rankings[r.id]=r;
 if(storageMode!=="postgres"||!pool){saveFile();return}
 await pool.query(`INSERT INTO players(id,name,rating,wins,losses,games,total_score,coins,gems,keys,last_wheel_spin,recent,revision,auth_hash,updated_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,NOW())
 ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,rating=EXCLUDED.rating,wins=EXCLUDED.wins,losses=EXCLUDED.losses,games=EXCLUDED.games,total_score=EXCLUDED.total_score,coins=EXCLUDED.coins,gems=EXCLUDED.gems,keys=EXCLUDED.keys,last_wheel_spin=EXCLUDED.last_wheel_spin,recent=EXCLUDED.recent,revision=EXCLUDED.revision,auth_hash=EXCLUDED.auth_hash,updated_at=NOW()`,
 [r.id,r.name,r.rating,r.wins,r.losses,r.games,r.totalScore,r.coins,r.gems,r.keys,String(r.lastWheelSpin||0),JSON.stringify((r.recent||[]).slice(-250)),r.revision||0,r.authHash||null])
}
function json(res,status,obj){const body=JSON.stringify(obj);res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(body)}
function body(req){return new Promise((resolve,reject)=>{let d="";req.on("data",c=>{d+=c;if(d.length>1e6)req.destroy()});req.on("end",()=>{try{resolve(d?JSON.parse(d):{})}catch(e){reject(e)}});req.on("error",reject)})}
function cleanName(v){return String(v||"Jugador").replace(/[<>]/g,"").trim().slice(0,18)||"Jugador"}
function roomCode(){const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let c="";do{c="";for(let i=0;i<5;i++)c+=chars[Math.floor(Math.random()*chars.length)]}while(rooms.has(c));return c}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
function clamp(n,min,max){n=Number(n);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):min}
function hashToken(v){return crypto.createHash('sha256').update(String(v||'')).digest('hex')}
function secureEqual(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function getRank(id,name){id=String(id);if(!rankings[id])rankings[id]=normalizeRank(id,{name});rankings[id].name=cleanName(name||rankings[id].name);return rankings[id]}
function publicProfile(r){return{id:r.id,name:r.name,rating:r.rating,wins:r.wins,losses:r.losses,games:r.games,totalScore:r.totalScore,coins:r.coins,gems:r.gems,keys:r.keys,lastWheelSpin:r.lastWheelSpin,revision:r.revision||0,storage:storageMode}}
function topRanking(){return Object.values(rankings).sort((a,b)=>b.rating-a.rating||b.wins-a.wins||b.totalScore-a.totalScore).slice(0,50).map(r=>({id:r.id,name:r.name,rating:r.rating,wins:r.wins,losses:r.losses,games:r.games,totalScore:r.totalScore}))}
function verifyProfileToken(r,token){return !!(r&&r.authHash&&token&&secureEqual(r.authHash,hashToken(token)))}
function publicPlayers(room){return[...room.players.values()].map(p=>({id:p.id,name:p.name,score:p.score,lives:p.lives,answered:!!p.answered,eliminated:!!p.eliminated,online:(room.streams.get(p.id)?.size||0)>0}))}
function sendSSE(res,msg){try{res.write(`data: ${JSON.stringify(msg)}\n\n`)}catch(e){}}
function broadcast(room,msg){for(const set of room.streams.values())for(const res of set)sendSSE(res,msg)}
function lobby(room){room.lastActivity=Date.now();broadcast(room,{type:"lobby",code:room.code,mode:room.mode,hostId:room.hostId,players:publicPlayers(room)})}
function publicRooms(){return[...rooms.values()].map(r=>({code:r.code,mode:r.mode,status:r.status,hostId:r.hostId,hostName:r.players.get(r.hostId)?.name||"",createdAt:r.createdAt,lastActivity:r.lastActivity||r.createdAt,round:r.round||0,players:publicPlayers(r)})).sort((a,b)=>b.createdAt-a.createdAt)}
function closeRoom(room,message="La sala fue cerrada"){
 if(!room)return;
 clearTimeout(room.timer);broadcast(room,{type:"roomClosed",message});
 for(const set of room.streams.values())for(const res of set)try{res.end()}catch(e){}
 room.streams.clear();rooms.delete(room.code)
}
function kickRoomPlayer(room,targetId,message="Fuiste expulsado de la sala"){
 const target=room.players.get(targetId);if(!target)return false;
 const sets=room.streams.get(targetId);if(sets)for(const res of sets){sendSSE(res,{type:"kicked",message});try{res.end()}catch(e){}}
 room.streams.delete(targetId);room.players.delete(targetId);room.lastActivity=Date.now();
 if(room.players.size===0){closeRoom(room,"Sala vacía");return true}
 if(room.hostId===targetId)room.hostId=room.players.keys().next().value;
 if(room.status==="lobby")lobby(room);else broadcast(room,{type:"players",players:publicPlayers(room)});
 return true
}
function createRoom(playerId,name,mode){const code=roomCode(),p={id:playerId,name:cleanName(name),score:0,lives:3,answered:null,eliminated:false};const r={code,mode,hostId:playerId,status:"lobby",players:new Map([[playerId,p]]),streams:new Map(),createdAt:Date.now(),lastActivity:Date.now(),round:0,maxRounds:mode==="ranked"?10:mode==="competition"?12:15,current:null,timer:null,finishing:false,questions:[],used:[]};rooms.set(code,r);return r}
function roomQuestionSet(room,count){const recent=new Set();for(const p of room.players.values()){const r=getRank(p.id,p.name);for(const q of(r.recent||[]).slice(-180))recent.add(q)}let pool=QUESTIONS.filter(q=>!recent.has(q.id));if(pool.length<count*2)pool=[...QUESTIONS];const by={};for(const q of shuffle(pool))(by[q.category]??=[]).push(q);const cats=shuffle(Object.keys(by)),out=[];let idx=0,guard=0;while(out.length<count&&guard++<10000){const c=cats[idx++%cats.length],arr=by[c];if(arr?.length)out.push(arr.pop())}if(out.length<count){const used=new Set(out.map(q=>q.id));out.push(...shuffle(pool.filter(q=>!used.has(q.id))).slice(0,count-out.length))}return out}
function prepareQuestion(q){const opts=q.answers.map((text,i)=>({text,correct:i===q.correct})),mixed=shuffle(opts);return{id:q.id,category:q.category,difficulty:q.difficulty,question:q.question,answers:mixed.map(x=>x.text),correct:mixed.findIndex(x=>x.correct)}}
function startMatch(room){room.status="playing";room.round=0;room.used=[];room.questions=roomQuestionSet(room,room.maxRounds);for(const p of room.players.values()){p.score=0;p.lives=3;p.answered=null;p.eliminated=false}nextQuestion(room)}
function nextQuestion(room){if(room.status!=="playing")return;room.round++;if(room.round>room.maxRounds)return finishMatch(room);const raw=room.questions[room.round-1];if(!raw)return finishMatch(room);const q=prepareQuestion(raw),endsAt=Date.now()+15000;room.current={...q,seq:room.round,endsAt};room.finishing=false;room.used.push(q.id);for(const p of room.players.values())p.answered=null;broadcast(room,{type:"question",seq:room.round,round:room.round,totalRounds:room.maxRounds,mode:room.mode,category:q.category,question:q.question,answers:q.answers,endsAt,players:publicPlayers(room)});clearTimeout(room.timer);room.timer=setTimeout(()=>finishRound(room),15100)}
function activePlayers(room){return[...room.players.values()].filter(p=>!p.eliminated)}
function allAnswered(room){const active=activePlayers(room);return active.length>0&&active.every(p=>p.answered)}
function answer(room,playerId,seq,index){room.lastActivity=Date.now();if(room.status!=="playing"||!room.current||room.current.seq!==seq)return{ok:false,error:"La pregunta ya cambió."};const p=room.players.get(playerId);if(!p||p.eliminated)return{ok:false,error:"Jugador no activo."};if(p.answered)return{ok:false,error:"Ya respondiste."};const correct=index===room.current.correct,remaining=Math.max(0,room.current.endsAt-Date.now()),points=correct?100+Math.floor(50*(remaining/15000)):0;p.score+=points;if(room.mode==="battle"&&!correct){p.lives--;if(p.lives<=0)p.eliminated=true}p.answered={index,correct,points};broadcast(room,{type:"players",players:publicPlayers(room)});if(allAnswered(room))setTimeout(()=>finishRound(room),450);return{ok:true}}
function finishRound(room){if(room.status!=="playing"||!room.current||room.finishing)return;room.finishing=true;clearTimeout(room.timer);for(const p of activePlayers(room)){if(!p.answered){p.answered={index:null,correct:false,points:0};if(room.mode==="battle"){p.lives--;if(p.lives<=0)p.eliminated=true}}}const q=room.current;broadcast(room,{type:"reveal",correctIndex:q.correct,players:publicPlayers(room)});const alive=activePlayers(room),shouldEnd=(room.mode==="battle"&&alive.length<=1&&room.players.size>=2)||room.round>=room.maxRounds;room.current=null;setTimeout(()=>shouldEnd?finishMatch(room):nextQuestion(room),1500)}
function rankingDeltas(n){if(n<=2)return[20,-12];if(n===3)return[25,5,-10];return[30,10,-5,-15]}
async function finishMatch(room){if(room.status!=="playing")return;room.status="finished";room.finishedAt=Date.now();room.lastActivity=Date.now();clearTimeout(room.timer);let results=[...room.players.values()];results.sort((a,b)=>{if(room.mode==="battle"){if(a.eliminated!==b.eliminated)return a.eliminated?1:-1;if(a.lives!==b.lives)return b.lives-a.lives}return b.score-a.score});const deltas=rankingDeltas(results.length);for(let i=0;i<results.length;i++){const p=results[i],r=getRank(p.id,p.name);r.games++;r.totalScore+=p.score;if(i===0)r.wins++;else r.losses++;let delta=0;if(room.mode==="ranked"){delta=deltas[i]||0;r.rating=Math.max(100,r.rating+delta)}r.recent=[...(r.recent||[]),...room.used].slice(-250);r.revision=(r.revision||0)+1;p.finalRating=r.rating;p.delta=delta;await persistRank(r)}broadcast(room,{type:"matchEnd",results:results.map((p,i)=>({id:p.id,name:p.name,place:i+1,score:p.score,lives:p.lives,rating:p.finalRating,delta:p.delta})),ranking:topRanking()})}
function leaveRoom(room,id){const wasHost=room.hostId===id;room.players.delete(id);const sets=room.streams.get(id);if(sets)for(const res of sets)try{res.end()}catch(e){}room.streams.delete(id);room.lastActivity=Date.now();if(room.players.size===0){closeRoom(room,"Sala vacía");return}if(wasHost)room.hostId=room.players.keys().next().value;if(room.status==="lobby")lobby(room);else broadcast(room,{type:"players",players:publicPlayers(room)})}
function staticFile(req,res,pathname){let rel=pathname==="/"?"index.html":decodeURIComponent(pathname).replace(/^\/+/,"");const file=path.normalize(path.join(ROOT,rel));if(!file.startsWith(ROOT))return json(res,403,{error:"Forbidden"});fs.stat(file,(err,st)=>{if(err||!st.isFile())return json(res,404,{error:"Not found"});const ext=path.extname(file).toLowerCase();res.writeHead(200,{"Content-Type":MIME[ext]||"application/octet-stream","Cache-Control":ext===".html"?"no-store":"public, max-age=3600"});fs.createReadStream(file).pipe(res)})}
function bearer(req){return String(req.headers.authorization||'').replace(/^Bearer\s+/i,'')}
function validAdmin(req){const t=bearer(req),s=adminSessions.get(t);if(!s||s<Date.now()){if(t)adminSessions.delete(t);return false}return true}
function clientIp(req){return String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim()}
function adminLoginAllowed(req){const ip=clientIp(req),v=adminFailures.get(ip);if(!v||Date.now()-v.start>15*60*1000){adminFailures.delete(ip);return true}return v.count<5}
function adminFail(req){const ip=clientIp(req),v=adminFailures.get(ip);if(!v||Date.now()-v.start>15*60*1000)adminFailures.set(ip,{count:1,start:Date.now()});else v.count++}

const server=http.createServer(async(req,res)=>{const u=new URL(req.url,`http://${req.headers.host||"localhost"}`),p=u.pathname;try{
 if(req.method==="GET"&&p==="/api/status")return json(res,200,{ok:true,rooms:rooms.size,players:[...rooms.values()].reduce((a,r)=>a+r.players.size,0),questions:QUESTIONS.length,storage:storageMode,profiles:Object.keys(rankings).length,adminConfigured:!!ADMIN_KEY});
 if(req.method==="GET"&&p==="/api/ranking")return json(res,200,{ranking:topRanking(),storage:storageMode});
 if(req.method==="POST"&&p==="/api/profile/bootstrap"){
  const b=await body(req),id=String(b.playerId||'');if(!id)return json(res,400,{error:'Jugador inválido'});const r=getRank(id,b.name);let token=String(b.token||'');
  if(r.authHash){if(!verifyProfileToken(r,token))return json(res,401,{error:'Este perfil pertenece a otro navegador.'})}else{token=crypto.randomBytes(24).toString('base64url');r.authHash=hashToken(token);r.coins=clamp(b.coins??r.coins,0,100000000);r.gems=clamp(b.gems??r.gems,0,1000000);r.keys=clamp(b.keys??r.keys,0,1000000);r.lastWheelSpin=Math.max(0,Number(b.lastRewardSpin??r.lastWheelSpin??0));r.revision=(r.revision||0)+1;await persistRank(r)}
  r.name=cleanName(b.name||r.name);await persistRank(r);return json(res,200,{profile:publicProfile(r),token:r.authHash&&String(b.token||'')?undefined:token})
 }
 if(req.method==="POST"&&p==="/api/profile/sync"){
  const b=await body(req),r=rankings[String(b.playerId||'')];if(!r||!verifyProfileToken(r,b.token))return json(res,401,{error:'Perfil no autorizado'});if(Number(b.expectedRevision)!==Number(r.revision||0))return json(res,409,{error:'El perfil cambió en el servidor',profile:publicProfile(r)});
  r.name=cleanName(b.name||r.name);r.coins=clamp(b.coins,0,100000000);r.gems=clamp(b.gems,0,1000000);r.keys=clamp(b.keys,0,1000000);r.lastWheelSpin=Math.max(0,Number(b.lastRewardSpin||0));r.revision++;await persistRank(r);return json(res,200,{profile:publicProfile(r)})
 }
 if(req.method==="POST"&&p==="/api/admin/login"){
  if(!ADMIN_KEY)return json(res,503,{error:'ADMIN_KEY no está configurada en Render'});if(!adminLoginAllowed(req))return json(res,429,{error:'Demasiados intentos. Prueba más tarde.'});const b=await body(req);if(!secureEqual(String(b.key||''),ADMIN_KEY)){adminFail(req);return json(res,403,{error:'Clave incorrecta'})}const token=crypto.randomBytes(32).toString('base64url');adminSessions.set(token,Date.now()+8*60*60*1000);return json(res,200,{token,expiresHours:8})
 }
 if(p.startsWith('/api/admin/')&&!validAdmin(req))return json(res,401,{error:'Sesión de administrador inválida o vencida'});
 if(req.method==="GET"&&p==="/api/admin/players"){const players=Object.values(rankings).sort((a,b)=>b.rating-a.rating).map(publicProfile);return json(res,200,{players,summary:{players:players.length,games:players.reduce((a,x)=>a+x.games,0),rooms:rooms.size,storage:storageMode}})}
 if(req.method==="GET"&&p==="/api/admin/rooms")return json(res,200,{rooms:publicRooms()});
 if(req.method==="POST"&&p==="/api/admin/room/close"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(!room)return json(res,404,{error:"Sala no encontrada"});closeRoom(room,"Sala cerrada por el propietario");return json(res,200,{ok:true})}
 if(req.method==="POST"&&p==="/api/admin/room/kick"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(!room)return json(res,404,{error:"Sala no encontrada"});const target=String(b.targetId||"");if(!room.players.has(target))return json(res,404,{error:"Jugador no encontrado en la sala"});kickRoomPlayer(room,target,"Fuiste expulsado por el administrador");return json(res,200,{ok:true})}
 if(req.method==="POST"&&p==="/api/admin/player/grant"){const b=await body(req),r=rankings[String(b.playerId||'')];if(!r)return json(res,404,{error:'Jugador no encontrado'});r.coins=Math.max(0,r.coins+clamp(b.coins,-1000000,1000000));r.gems=Math.max(0,r.gems+clamp(b.gems,-100000,100000));r.keys=Math.max(0,r.keys+clamp(b.keys,-100000,100000));r.revision++;await persistRank(r);return json(res,200,{profile:publicProfile(r)})}
 if(req.method==="POST"&&p==="/api/admin/player/rating"){const b=await body(req),r=rankings[String(b.playerId||'')];if(!r)return json(res,404,{error:'Jugador no encontrado'});r.rating=clamp(b.rating,100,5000);r.revision++;await persistRank(r);return json(res,200,{profile:publicProfile(r)})}
 if(req.method==="POST"&&p==="/api/admin/player/reset-wheel"){const b=await body(req);if(b.all){for(const r of Object.values(rankings)){r.lastWheelSpin=0;r.revision++;await persistRank(r)}return json(res,200,{ok:true,count:Object.keys(rankings).length})}const r=rankings[String(b.playerId||'')];if(!r)return json(res,404,{error:'Jugador no encontrado'});r.lastWheelSpin=0;r.revision++;await persistRank(r);return json(res,200,{profile:publicProfile(r)})}
 if(req.method==="POST"&&p==="/api/admin/player/reset-stats"){const b=await body(req),r=rankings[String(b.playerId||'')];if(!r)return json(res,404,{error:'Jugador no encontrado'});r.rating=1000;r.wins=0;r.losses=0;r.games=0;r.totalScore=0;r.recent=[];r.revision++;await persistRank(r);return json(res,200,{profile:publicProfile(r)})}
 if(req.method==="GET"&&p==="/api/multi/stream"){const code=(u.searchParams.get("code")||"").toUpperCase(),id=u.searchParams.get("playerId")||"",room=rooms.get(code);if(!room||!room.players.has(id))return json(res,404,{error:"Sala o jugador no encontrado"});res.writeHead(200,{"Content-Type":"text/event-stream","Cache-Control":"no-cache","Connection":"keep-alive","X-Accel-Buffering":"no"});res.write(": connected\n\n");if(!room.streams.has(id))room.streams.set(id,new Set());room.streams.get(id).add(res);const hb=setInterval(()=>{try{res.write(": ping\n\n")}catch(e){}},20000);req.on("close",()=>{clearInterval(hb);room.streams.get(id)?.delete(res);if(room.status==="lobby")lobby(room)});if(room.status==="lobby")sendSSE(res,{type:"lobby",code:room.code,mode:room.mode,hostId:room.hostId,players:publicPlayers(room)});return}
 if(req.method==="POST"&&p==="/api/multi/create"){const b=await body(req),mode=["battle","ranked","competition"].includes(b.mode)?b.mode:"competition",id=String(b.playerId||'');if(!id)return json(res,400,{error:"Jugador inválido"});const r=getRank(id,b.name);if(r.authHash&&!verifyProfileToken(r,b.profileToken))return json(res,401,{error:'Perfil online no verificado'});const room=createRoom(id,b.name,mode);await persistRank(r);return json(res,200,{code:room.code,mode,hostId:room.hostId})}
 if(req.method==="POST"&&p==="/api/multi/join"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(!room)return json(res,404,{error:"La sala no existe"});if(room.status!=="lobby")return json(res,409,{error:"La partida ya comenzó"});if(room.players.size>=4&&!room.players.has(b.playerId))return json(res,409,{error:"La sala ya tiene 4 jugadores"});const id=String(b.playerId||"");if(!id)return json(res,400,{error:"Jugador inválido"});const r=getRank(id,b.name);if(r.authHash&&!verifyProfileToken(r,b.profileToken))return json(res,401,{error:'Perfil online no verificado'});room.players.set(id,{id,name:cleanName(b.name),score:0,lives:3,answered:null,eliminated:false});await persistRank(r);lobby(room);return json(res,200,{ok:true,mode:room.mode,hostId:room.hostId})}
 if(req.method==="POST"&&p==="/api/multi/start"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(!room)return json(res,404,{error:"Sala no encontrada"});if(room.hostId!==b.playerId)return json(res,403,{error:"Solo el anfitrión puede comenzar"});if(room.players.size<2)return json(res,409,{error:"Se necesitan al menos 2 jugadores"});if(room.players.size>4)return json(res,409,{error:"Máximo 4 jugadores"});startMatch(room);return json(res,200,{ok:true})}
 if(req.method==="POST"&&p==="/api/multi/answer"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(!room)return json(res,404,{error:"Sala no encontrada"});const out=answer(room,String(b.playerId||""),Number(b.seq),Number(b.answer));return json(res,out.ok?200:409,out)}
 if(req.method==="POST"&&p==="/api/multi/kick"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(!room)return json(res,404,{error:"Sala no encontrada"});if(room.hostId!==String(b.playerId||""))return json(res,403,{error:"Solo el anfitrión puede expulsar jugadores"});const target=String(b.targetId||"");if(!target||target===room.hostId)return json(res,400,{error:"No puedes expulsar al anfitrión"});if(!room.players.has(target))return json(res,404,{error:"Jugador no encontrado"});kickRoomPlayer(room,target,"El anfitrión te expulsó de la sala");return json(res,200,{ok:true})}
 if(req.method==="POST"&&p==="/api/multi/close"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(!room)return json(res,404,{error:"Sala no encontrada"});if(room.hostId!==String(b.playerId||""))return json(res,403,{error:"Solo el anfitrión puede cerrar la sala"});closeRoom(room,"El anfitrión cerró la sala");return json(res,200,{ok:true})}
 if(req.method==="POST"&&p==="/api/multi/leave"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(room)leaveRoom(room,String(b.playerId||""));return json(res,200,{ok:true})}
 if(req.method==="GET")return staticFile(req,res,p);return json(res,404,{error:"Not found"})
 }catch(e){console.error(e);return json(res,500,{error:"Error interno del servidor"})}});
setInterval(()=>{
 const now=Date.now();
 for(const [code,r] of [...rooms]){
  const online=[...r.streams.values()].reduce((n,set)=>n+(set?.size||0),0);
  if(r.status==="finished"&&now-(r.finishedAt||r.lastActivity||r.createdAt)>5*60*1000){closeRoom(r,"Sala finalizada y cerrada automáticamente");continue}
  if(r.status==="lobby"&&online===0&&now-(r.lastActivity||r.createdAt)>10*60*1000){closeRoom(r,"Sala inactiva cerrada automáticamente");continue}
  if(r.status!=="playing"&&now-r.createdAt>60*60*1000){closeRoom(r,"Sala expirada");continue}
 }
 for(const [t,exp] of adminSessions)if(exp<now)adminSessions.delete(t)
},30000);
initStore().finally(()=>server.listen(PORT,"0.0.0.0",()=>{console.log("\n==========================================");console.log("  SEMANTROPIC TRIVIA — ONLINE ALPHA 0.2.6");console.log("==========================================");console.log(`Almacenamiento: ${storageMode}`);console.log(`Admin configurado: ${ADMIN_KEY?'sí':'no'}`);console.log(`PC anfitrión: http://localhost:${PORT}`);const nets=os.networkInterfaces();for(const list of Object.values(nets))for(const n of(list||[]))if(n.family==="IPv4"&&!n.internal)console.log(`Red local:    http://${n.address}:${PORT}`);console.log("\n") }));
