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
 ["online_perfect",r=>r.onlineStats.perfectGames>=1]
];

function cleanName(v){return String(v||"Jugador").replace(/[<>]/g,"").trim().slice(0,18)||"Jugador"}
function cleanBio(v){return String(v||"").replace(/[<>]/g,"").replace(/\s+/g," ").trim().slice(0,90)}
function cleanId(v,fallback=""){const s=String(v||"");return /^[a-z0-9_:-]{0,48}$/i.test(s)?s:fallback}
function cleanGender(v){return ["male","female","neutral","animal"].includes(v)?v:"neutral"}
function cleanAchievements(v){return [...new Set((Array.isArray(v)?v:[]).map(x=>cleanId(x,"")).filter(Boolean))].slice(0,120)}
function clamp(n,min,max){n=Number(n);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):min}
function normalizeOnlineStats(s={}){return{
 battleGames:Number(s.battleGames||0),rankedGames:Number(s.rankedGames||0),competitionGames:Number(s.competitionGames||0),teamGames:Number(s.teamGames||0),
 battleWins:Number(s.battleWins||0),rankedWins:Number(s.rankedWins||0),competitionWins:Number(s.competitionWins||0),teamWins:Number(s.teamWins||0),
 correct:Number(s.correct||0),answers:Number(s.answers||0),perfectGames:Number(s.perfectGames||0),bestScore:Number(s.bestScore||0)
}}
function normalizeRank(id,r={}){return{
 id:String(id),name:cleanName(r.name),rating:Number(r.rating??1000),wins:Number(r.wins||0),losses:Number(r.losses||0),games:Number(r.games||0),totalScore:Number(r.totalScore??r.total_score??0),
 coins:Number(r.coins??200),gems:Number(r.gems||0),keys:Number(r.keys??1),lastWheelSpin:Number(r.lastWheelSpin??r.last_wheel_spin??0),recent:Array.isArray(r.recent)?r.recent:[],revision:Number(r.revision||0),authHash:r.authHash||r.auth_hash||null,
 avatarId:cleanId(r.avatarId??r.avatar_id,"starter_m")||"starter_m",gender:cleanGender(r.gender||"neutral"),frameId:cleanId(r.frameId??r.frame_id,"none")||"none",
 featuredAchievement:cleanId(r.featuredAchievement??r.featured_achievement,""),bio:cleanBio(r.bio),achievements:cleanAchievements(r.achievements),onlineStats:normalizeOnlineStats(r.onlineStats??r.online_stats??{})
}}
function saveFile(){const safe={};for(const [id,r] of Object.entries(rankings))safe[id]={...r,recent:(r.recent||[]).slice(-250)};try{fs.writeFileSync(RANK_FILE,JSON.stringify(safe,null,2),"utf8")}catch(e){console.error("file persistence:",e.message)}}
async function initStore(){
 if(!DATABASE_URL){storageMode="file";for(const [id,r] of Object.entries(rankings))rankings[id]=normalizeRank(id,r);return}
 try{
  pool=new Pool({connectionString:DATABASE_URL});
  await pool.query(`CREATE TABLE IF NOT EXISTS players(
   id TEXT PRIMARY KEY,name TEXT NOT NULL,rating INTEGER NOT NULL DEFAULT 1000,wins INTEGER NOT NULL DEFAULT 0,losses INTEGER NOT NULL DEFAULT 0,games INTEGER NOT NULL DEFAULT 0,total_score INTEGER NOT NULL DEFAULT 0,
   coins INTEGER NOT NULL DEFAULT 200,gems INTEGER NOT NULL DEFAULT 0,keys INTEGER NOT NULL DEFAULT 1,last_wheel_spin BIGINT NOT NULL DEFAULT 0,recent JSONB NOT NULL DEFAULT '[]'::jsonb,revision INTEGER NOT NULL DEFAULT 0,auth_hash TEXT,
   avatar_id TEXT NOT NULL DEFAULT 'starter_m',gender TEXT NOT NULL DEFAULT 'neutral',frame_id TEXT NOT NULL DEFAULT 'none',featured_achievement TEXT NOT NULL DEFAULT '',bio TEXT NOT NULL DEFAULT '',achievements JSONB NOT NULL DEFAULT '[]'::jsonb,online_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const migrations=[
   `ALTER TABLE players ADD COLUMN IF NOT EXISTS avatar_id TEXT NOT NULL DEFAULT 'starter_m'`,
   `ALTER TABLE players ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT 'neutral'`,
   `ALTER TABLE players ADD COLUMN IF NOT EXISTS frame_id TEXT NOT NULL DEFAULT 'none'`,
   `ALTER TABLE players ADD COLUMN IF NOT EXISTS featured_achievement TEXT NOT NULL DEFAULT ''`,
   `ALTER TABLE players ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT ''`,
   `ALTER TABLE players ADD COLUMN IF NOT EXISTS achievements JSONB NOT NULL DEFAULT '[]'::jsonb`,
   `ALTER TABLE players ADD COLUMN IF NOT EXISTS online_stats JSONB NOT NULL DEFAULT '{}'::jsonb`
  ];
  for(const sql of migrations)await pool.query(sql);
  const {rows}=await pool.query('SELECT id,name,rating,wins,losses,games,total_score,coins,gems,keys,last_wheel_spin,recent,revision,auth_hash,avatar_id,gender,frame_id,featured_achievement,bio,achievements,online_stats FROM players');
  rankings={};for(const row of rows)rankings[row.id]=normalizeRank(row.id,row);storageMode="postgres";
  console.log(`Postgres conectado: ${rows.length} perfiles cargados.`)
 }catch(e){console.error("Postgres no disponible, usando archivo temporal:",e.message);pool=null;storageMode="file";for(const [id,r] of Object.entries(rankings))rankings[id]=normalizeRank(id,r)}
}
async function persistRank(r){
 rankings[r.id]=r;
 if(storageMode!=="postgres"||!pool){saveFile();return}
 await pool.query(`INSERT INTO players(id,name,rating,wins,losses,games,total_score,coins,gems,keys,last_wheel_spin,recent,revision,auth_hash,avatar_id,gender,frame_id,featured_achievement,bio,achievements,online_stats,updated_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21::jsonb,NOW())
 ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,rating=EXCLUDED.rating,wins=EXCLUDED.wins,losses=EXCLUDED.losses,games=EXCLUDED.games,total_score=EXCLUDED.total_score,coins=EXCLUDED.coins,gems=EXCLUDED.gems,keys=EXCLUDED.keys,last_wheel_spin=EXCLUDED.last_wheel_spin,recent=EXCLUDED.recent,revision=EXCLUDED.revision,auth_hash=EXCLUDED.auth_hash,avatar_id=EXCLUDED.avatar_id,gender=EXCLUDED.gender,frame_id=EXCLUDED.frame_id,featured_achievement=EXCLUDED.featured_achievement,bio=EXCLUDED.bio,achievements=EXCLUDED.achievements,online_stats=EXCLUDED.online_stats,updated_at=NOW()`,
 [r.id,r.name,r.rating,r.wins,r.losses,r.games,r.totalScore,r.coins,r.gems,r.keys,String(r.lastWheelSpin||0),JSON.stringify((r.recent||[]).slice(-250)),r.revision||0,r.authHash||null,r.avatarId,r.gender,r.frameId,r.featuredAchievement||"",r.bio||"",JSON.stringify(r.achievements||[]),JSON.stringify(r.onlineStats||{})])
}
function json(res,status,obj){const body=JSON.stringify(obj);res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(body)}
function body(req){return new Promise((resolve,reject)=>{let d="";req.on("data",c=>{d+=c;if(d.length>1e6)req.destroy()});req.on("end",()=>{try{resolve(d?JSON.parse(d):{})}catch(e){reject(e)}});req.on("error",reject)})}
function roomCode(){const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let c="";do{c="";for(let i=0;i<5;i++)c+=chars[Math.floor(Math.random()*chars.length)]}while(rooms.has(c));return c}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
function hashToken(v){return crypto.createHash('sha256').update(String(v||'')).digest('hex')}
function secureEqual(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function getRank(id,name){id=String(id);if(!rankings[id])rankings[id]=normalizeRank(id,{name});rankings[id].name=cleanName(name||rankings[id].name);return rankings[id]}
function publicView(r){return{id:r.id,name:r.name,rating:r.rating,wins:r.wins,losses:r.losses,games:r.games,totalScore:r.totalScore,avatarId:r.avatarId,gender:r.gender,frameId:r.frameId,featuredAchievement:r.featuredAchievement||"",bio:r.bio||"",achievements:r.achievements||[],achievementCount:(r.achievements||[]).length,onlineStats:r.onlineStats||{}}}
function publicProfile(r){return{...publicView(r),coins:r.coins,gems:r.gems,keys:r.keys,lastWheelSpin:r.lastWheelSpin,revision:r.revision||0,storage:storageMode}}
function topRanking(){return Object.values(rankings).sort((a,b)=>b.rating-a.rating||b.wins-a.wins||b.totalScore-a.totalScore).slice(0,50).map(publicView)}
function verifyProfileToken(r,token){return !!(r&&r.authHash&&token&&secureEqual(r.authHash,hashToken(token)))}
function profileSummary(id){const r=rankings[id];return r?{avatarId:r.avatarId,gender:r.gender,frameId:r.frameId,featuredAchievement:r.featuredAchievement||"",achievementCount:(r.achievements||[]).length}:{avatarId:"starter_m",gender:"neutral",frameId:"none",featuredAchievement:"",achievementCount:0}}
function publicPlayers(room){return[...room.players.values()].map(p=>({id:p.id,name:p.name,score:p.score,lives:p.lives,answered:!!p.answered,eliminated:!!p.eliminated,online:(room.streams.get(p.id)?.size||0)>0,team:p.team||null,...profileSummary(p.id)}))}
function applyClientProfileFields(r,b,{initial=false}={}){
 if(initial){
  if((!r.avatarId||r.avatarId==="starter_m")&&b.avatarId)r.avatarId=cleanId(b.avatarId,"starter_m")||"starter_m";
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
function createRoom(playerId,name,mode){const code=roomCode(),p={id:playerId,name:cleanName(name),score:0,lives:3,answered:null,eliminated:false,team:mode==="teams"?"A":null,correctCount:0,answerCount:0};const maxRounds=mode==="ranked"?10:(mode==="competition"||mode==="teams")?12:15;const r={code,mode,hostId:playerId,status:"lobby",players:new Map([[playerId,p]]),streams:new Map(),createdAt:Date.now(),lastActivity:Date.now(),round:0,maxRounds,current:null,timer:null,finishing:false,questions:[],used:[]};rooms.set(code,r);return r}
function roomQuestionSet(room,count){const recent=new Set();for(const p of room.players.values()){const r=getRank(p.id,p.name);for(const q of(r.recent||[]).slice(-180))recent.add(q)}let pool=QUESTIONS.filter(q=>!recent.has(q.id));if(pool.length<count*2)pool=[...QUESTIONS];const by={};for(const q of shuffle(pool))(by[q.category]??=[]).push(q);const cats=shuffle(Object.keys(by)),out=[];let idx=0,guard=0;while(out.length<count&&guard++<10000){const c=cats[idx++%cats.length],arr=by[c];if(arr?.length)out.push(arr.pop())}if(out.length<count){const used=new Set(out.map(q=>q.id));out.push(...shuffle(pool.filter(q=>!used.has(q.id))).slice(0,count-out.length))}return out}
function prepareQuestion(q){const opts=q.answers.map((text,i)=>({text,correct:i===q.correct})),mixed=shuffle(opts);return{id:q.id,category:q.category,difficulty:q.difficulty,question:q.question,answers:mixed.map(x=>x.text),correct:mixed.findIndex(x=>x.correct)}}
function startMatch(room){room.status="playing";room.round=0;room.used=[];room.questions=roomQuestionSet(room,room.maxRounds);for(const p of room.players.values()){p.score=0;p.lives=3;p.answered=null;p.eliminated=false;p.correctCount=0;p.answerCount=0}nextQuestion(room)}
function nextQuestion(room){if(room.status!=="playing")return;room.round++;if(room.round>room.maxRounds)return finishMatch(room);const raw=room.questions[room.round-1];if(!raw)return finishMatch(room);const q=prepareQuestion(raw),endsAt=Date.now()+15000;room.current={...q,seq:room.round,endsAt};room.finishing=false;room.used.push(q.id);for(const p of room.players.values())p.answered=null;broadcast(room,{type:"question",seq:room.round,round:room.round,totalRounds:room.maxRounds,mode:room.mode,category:q.category,question:q.question,answers:q.answers,endsAt,players:publicPlayers(room)});clearTimeout(room.timer);room.timer=setTimeout(()=>finishRound(room),15100)}
function activePlayers(room){return[...room.players.values()].filter(p=>!p.eliminated)}
function allAnswered(room){const active=activePlayers(room);return active.length>0&&active.every(p=>p.answered)}
function answer(room,playerId,seq,index){room.lastActivity=Date.now();if(room.status!=="playing"||!room.current||room.current.seq!==seq)return{ok:false,error:"La pregunta ya cambió."};const p=room.players.get(playerId);if(!p||p.eliminated)return{ok:false,error:"Jugador no activo."};if(p.answered)return{ok:false,error:"Ya respondiste."};const correct=index===room.current.correct,remaining=Math.max(0,room.current.endsAt-Date.now()),points=correct?100+Math.floor(50*(remaining/15000)):0;p.score+=points;p.answerCount++;if(correct)p.correctCount++;if(room.mode==="battle"&&!correct){p.lives--;if(p.lives<=0)p.eliminated=true}p.answered={index,correct,points};broadcast(room,{type:"players",players:publicPlayers(room)});if(allAnswered(room))setTimeout(()=>finishRound(room),450);return{ok:true}}
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
  const modeKey=room.mode==="teams"?"team":room.mode;if(modeKey==="battle")s.battleGames++;else if(modeKey==="ranked")s.rankedGames++;else if(modeKey==="competition")s.competitionGames++;else if(modeKey==="team")s.teamGames++;
  let won=false,lost=false;if(room.mode==="teams"){won=!!teamData.winner&&p.team===teamData.winner;lost=!!teamData.winner&&p.team!==teamData.winner}else{won=i===0;lost=i!==0}
  if(won){r.wins++;if(modeKey==="battle")s.battleWins++;else if(modeKey==="ranked")s.rankedWins++;else if(modeKey==="competition")s.competitionWins++;else if(modeKey==="team")s.teamWins++}else if(lost)r.losses++;
  if((p.answerCount||0)>=5&&(p.correctCount||0)===(p.answerCount||0))s.perfectGames++;
  let delta=0;if(room.mode==="ranked"){delta=deltas[i]||0;r.rating=Math.max(100,r.rating+delta)}
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

const server=http.createServer(async(req,res)=>{const u=new URL(req.url,`http://${req.headers.host||"localhost"}`),p=u.pathname;try{
 if(req.method==="GET"&&p==="/api/status")return json(res,200,{ok:true,rooms:rooms.size,players:[...rooms.values()].reduce((a,r)=>a+r.players.size,0),questions:QUESTIONS.length,storage:storageMode,profiles:Object.keys(rankings).length,adminConfigured:!!ADMIN_KEY});
 if(req.method==="GET"&&p==="/api/ranking")return json(res,200,{ranking:topRanking(),storage:storageMode});
 if(req.method==="GET"&&p==="/api/profile/public"){const id=String(u.searchParams.get("id")||"");const r=rankings[id];if(!r)return json(res,404,{error:"Perfil no encontrado"});return json(res,200,{profile:publicView(r)})}
 if(req.method==="POST"&&p==="/api/profile/bootstrap"){
  const b=await body(req),id=String(b.playerId||'');if(!id)return json(res,400,{error:'Jugador inválido'});const r=getRank(id,b.name);let token=String(b.token||''),issuedToken=null;
  if(r.authHash){if(!verifyProfileToken(r,token)){const recoverable=Number(r.games||0)===0&&Number(r.wins||0)===0&&Number(r.losses||0)===0&&Number(r.totalScore||0)===0;if(!recoverable)return json(res,401,{error:'Este perfil pertenece a otro navegador.'});issuedToken=crypto.randomBytes(24).toString('base64url');token=issuedToken;r.authHash=hashToken(issuedToken);r.revision=Math.max(1,Number(r.revision||0));await persistRank(r)}}else{issuedToken=crypto.randomBytes(24).toString('base64url');token=issuedToken;r.authHash=hashToken(issuedToken);r.coins=clamp(b.coins??r.coins,0,100000000);r.gems=clamp(b.gems??r.gems,0,1000000);r.keys=clamp(b.keys??r.keys,0,1000000);r.lastWheelSpin=Math.max(0,Number(b.lastRewardSpin??r.lastWheelSpin??0));r.revision=(r.revision||0)+1;applyClientProfileFields(r,b,{initial:true});await persistRank(r)}
  applyClientProfileFields(r,b,{initial:true});unlockOnlineAchievements(r);await persistRank(r);return json(res,200,{profile:publicProfile(r),token:issuedToken||undefined})
 }
 if(req.method==="POST"&&p==="/api/profile/sync"){
  const b=await body(req),r=rankings[String(b.playerId||'')];if(!r||!verifyProfileToken(r,b.token))return json(res,401,{error:'Perfil no autorizado'});if(Number(b.expectedRevision)!==Number(r.revision||0))return json(res,409,{error:'El perfil cambió en el servidor',profile:publicProfile(r)});
  r.coins=clamp(b.coins,0,100000000);r.gems=clamp(b.gems,0,1000000);r.keys=clamp(b.keys,0,1000000);r.lastWheelSpin=Math.max(0,Number(b.lastRewardSpin||0));applyClientProfileFields(r,b);unlockOnlineAchievements(r);r.revision++;await persistRank(r);return json(res,200,{profile:publicProfile(r)})
 }
 if(req.method==="POST"&&p==="/api/profile/customize"){
  const b=await body(req),r=rankings[String(b.playerId||'')];if(!r||!verifyProfileToken(r,b.token))return json(res,401,{error:'Perfil no autorizado'});applyClientProfileFields(r,b);r.revision++;await persistRank(r);return json(res,200,{profile:publicProfile(r)})
 }
 if(req.method==="POST"&&p==="/api/admin/login"){if(!ADMIN_KEY)return json(res,503,{error:'ADMIN_KEY no está configurada en Render'});if(!adminLoginAllowed(req))return json(res,429,{error:'Demasiados intentos. Prueba más tarde.'});const b=await body(req);if(!secureEqual(String(b.key||''),ADMIN_KEY)){adminFail(req);return json(res,403,{error:'Clave incorrecta'})}const token=crypto.randomBytes(32).toString('base64url');adminSessions.set(token,Date.now()+8*60*60*1000);return json(res,200,{token,expiresHours:8})}
 if(p.startsWith('/api/admin/')&&!validAdmin(req))return json(res,401,{error:'Sesión de administrador inválida o vencida'});
 if(req.method==="GET"&&p==="/api/admin/players"){const players=Object.values(rankings).sort((a,b)=>b.rating-a.rating).map(publicProfile);return json(res,200,{players,summary:{players:players.length,games:players.reduce((a,x)=>a+x.games,0),rooms:rooms.size,storage:storageMode}})}
 if(req.method==="GET"&&p==="/api/admin/rooms")return json(res,200,{rooms:publicRooms()});
 if(req.method==="POST"&&p==="/api/admin/room/close"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(!room)return json(res,404,{error:"Sala no encontrada"});closeRoom(room,"Sala cerrada por el propietario");return json(res,200,{ok:true})}
 if(req.method==="POST"&&p==="/api/admin/room/kick"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(!room)return json(res,404,{error:"Sala no encontrada"});const target=String(b.targetId||"");if(!room.players.has(target))return json(res,404,{error:"Jugador no encontrado en la sala"});kickRoomPlayer(room,target,"Fuiste expulsado por el administrador");return json(res,200,{ok:true})}
 if(req.method==="POST"&&p==="/api/admin/player/grant"){const b=await body(req),r=rankings[String(b.playerId||'')];if(!r)return json(res,404,{error:'Jugador no encontrado'});r.coins=Math.max(0,r.coins+clamp(b.coins,-1000000,1000000));r.gems=Math.max(0,r.gems+clamp(b.gems,-100000,100000));r.keys=Math.max(0,r.keys+clamp(b.keys,-100000,100000));r.revision++;await persistRank(r);return json(res,200,{profile:publicProfile(r)})}
 if(req.method==="POST"&&p==="/api/admin/player/rating"){const b=await body(req),r=rankings[String(b.playerId||'')];if(!r)return json(res,404,{error:'Jugador no encontrado'});r.rating=clamp(b.rating,100,5000);unlockOnlineAchievements(r);r.revision++;await persistRank(r);return json(res,200,{profile:publicProfile(r)})}
 if(req.method==="POST"&&p==="/api/admin/player/reset-wheel"){const b=await body(req);if(b.all){for(const r of Object.values(rankings)){r.lastWheelSpin=0;r.revision++;await persistRank(r)}return json(res,200,{ok:true,count:Object.keys(rankings).length})}const r=rankings[String(b.playerId||'')];if(!r)return json(res,404,{error:'Jugador no encontrado'});r.lastWheelSpin=0;r.revision++;await persistRank(r);return json(res,200,{profile:publicProfile(r)})}
 if(req.method==="POST"&&p==="/api/admin/player/reset-stats"){const b=await body(req),r=rankings[String(b.playerId||'')];if(!r)return json(res,404,{error:'Jugador no encontrado'});r.rating=1000;r.wins=0;r.losses=0;r.games=0;r.totalScore=0;r.recent=[];r.onlineStats=normalizeOnlineStats({});r.achievements=(r.achievements||[]).filter(x=>!x.startsWith('online_'));if(r.featuredAchievement?.startsWith('online_'))r.featuredAchievement="";r.revision++;await persistRank(r);return json(res,200,{profile:publicProfile(r)})}
 if(req.method==="POST"&&p==="/api/admin/player/reset-auth"){const b=await body(req),r=rankings[String(b.playerId||'')];if(!r)return json(res,404,{error:'Jugador no encontrado'});r.authHash='';r.revision++;await persistRank(r);return json(res,200,{ok:true,profile:publicProfile(r)})}
 if(req.method==="GET"&&p==="/api/multi/stream"){const code=(u.searchParams.get("code")||"").toUpperCase(),id=u.searchParams.get("playerId")||"",room=rooms.get(code);if(!room||!room.players.has(id))return json(res,404,{error:"Sala o jugador no encontrado"});res.writeHead(200,{"Content-Type":"text/event-stream","Cache-Control":"no-cache","Connection":"keep-alive","X-Accel-Buffering":"no"});res.write(": connected\n\n");if(!room.streams.has(id))room.streams.set(id,new Set());room.streams.get(id).add(res);const hb=setInterval(()=>{try{res.write(": ping\n\n")}catch(e){}},20000);req.on("close",()=>{clearInterval(hb);room.streams.get(id)?.delete(res);if(room.status==="lobby")lobby(room)});if(room.status==="lobby")sendSSE(res,{type:"lobby",code:room.code,mode:room.mode,hostId:room.hostId,players:publicPlayers(room)});return}
 if(req.method==="POST"&&p==="/api/multi/create"){const b=await body(req),mode=["battle","ranked","competition","teams"].includes(b.mode)?b.mode:"competition",id=String(b.playerId||'');if(!id)return json(res,400,{error:"Jugador inválido"});const r=getRank(id,b.name);if(r.authHash&&!verifyProfileToken(r,b.profileToken))return json(res,401,{error:'Perfil online no verificado'});const room=createRoom(id,b.name,mode);await persistRank(r);return json(res,200,{code:room.code,mode,hostId:room.hostId})}
 if(req.method==="POST"&&p==="/api/multi/join"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(!room)return json(res,404,{error:"La sala no existe"});if(room.status!=="lobby")return json(res,409,{error:"La partida ya comenzó"});if(room.players.size>=4&&!room.players.has(b.playerId))return json(res,409,{error:"La sala ya tiene 4 jugadores"});const id=String(b.playerId||"");if(!id)return json(res,400,{error:"Jugador inválido"});const r=getRank(id,b.name);if(r.authHash&&!verifyProfileToken(r,b.profileToken))return json(res,401,{error:'Perfil online no verificado'});room.players.set(id,{id,name:cleanName(b.name),score:0,lives:3,answered:null,eliminated:false,team:room.mode==="teams"?nextTeam(room):null,correctCount:0,answerCount:0});await persistRank(r);lobby(room);return json(res,200,{ok:true,mode:room.mode,hostId:room.hostId})}
 if(req.method==="POST"&&p==="/api/multi/team"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase()),id=String(b.playerId||""),team=String(b.team||"").toUpperCase();if(!room)return json(res,404,{error:"Sala no encontrada"});if(room.mode!=="teams"||room.status!=="lobby")return json(res,409,{error:"No puedes cambiar equipo ahora"});if(!["A","B"].includes(team))return json(res,400,{error:"Equipo inválido"});const player=room.players.get(id);if(!player)return json(res,404,{error:"Jugador no encontrado"});const counts=teamCounts(room);if(player.team!==team&&counts[team]>=2){const oldTeam=player.team,swap=[...room.players.values()].find(x=>x.id!==id&&x.team===team);if(!oldTeam||!swap)return json(res,409,{error:"Ese equipo ya tiene 2 jugadores"});swap.team=oldTeam}player.team=team;lobby(room);return json(res,200,{ok:true})}
 if(req.method==="POST"&&p==="/api/multi/start"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(!room)return json(res,404,{error:"Sala no encontrada"});if(room.hostId!==b.playerId)return json(res,403,{error:"Solo el anfitrión puede comenzar"});if(room.mode==="teams"){const c=teamCounts(room);if(room.players.size!==4||c.A!==2||c.B!==2)return json(res,409,{error:"2 vs 2 necesita exactamente 4 jugadores: 2 en cada equipo"})}else{if(room.players.size<2)return json(res,409,{error:"Se necesitan al menos 2 jugadores"});if(room.players.size>4)return json(res,409,{error:"Máximo 4 jugadores"})}startMatch(room);return json(res,200,{ok:true})}
 if(req.method==="POST"&&p==="/api/multi/answer"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(!room)return json(res,404,{error:"Sala no encontrada"});const out=answer(room,String(b.playerId||""),Number(b.seq),Number(b.answer));return json(res,out.ok?200:409,out)}
 if(req.method==="POST"&&p==="/api/multi/kick"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(!room)return json(res,404,{error:"Sala no encontrada"});if(room.hostId!==String(b.playerId||""))return json(res,403,{error:"Solo el anfitrión puede expulsar jugadores"});const target=String(b.targetId||"");if(!target||target===room.hostId)return json(res,400,{error:"No puedes expulsar al anfitrión"});if(!room.players.has(target))return json(res,404,{error:"Jugador no encontrado"});kickRoomPlayer(room,target,"El anfitrión te expulsó de la sala");return json(res,200,{ok:true})}
 if(req.method==="POST"&&p==="/api/multi/close"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(!room)return json(res,404,{error:"Sala no encontrada"});if(room.hostId!==String(b.playerId||""))return json(res,403,{error:"Solo el anfitrión puede cerrar la sala"});closeRoom(room,"El anfitrión cerró la sala");return json(res,200,{ok:true})}
 if(req.method==="POST"&&p==="/api/multi/leave"){const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(room)leaveRoom(room,String(b.playerId||""));return json(res,200,{ok:true})}
 if(req.method==="GET")return staticFile(req,res,p);return json(res,404,{error:"Not found"})
 }catch(e){console.error(e);return json(res,500,{error:"Error interno del servidor"})}});
setInterval(()=>{const now=Date.now();for(const [code,r] of [...rooms]){const online=[...r.streams.values()].reduce((n,set)=>n+(set?.size||0),0);if(r.status==="finished"&&now-(r.finishedAt||r.lastActivity||r.createdAt)>5*60*1000){closeRoom(r,"Sala finalizada y cerrada automáticamente");continue}if(r.status==="lobby"&&online===0&&now-(r.lastActivity||r.createdAt)>10*60*1000){closeRoom(r,"Sala inactiva cerrada automáticamente");continue}if(r.status!=="playing"&&now-r.createdAt>60*60*1000){closeRoom(r,"Sala expirada");continue}}for(const [t,exp] of adminSessions)if(exp<now)adminSessions.delete(t)},30000);
initStore().finally(()=>server.listen(PORT,"0.0.0.0",()=>{console.log("\n==========================================");console.log("  SEMANTROPIC TRIVIA — ONLINE ALPHA 0.2.6");console.log("  SOCIAL PROFILES + 2v2 TEAM MODE");console.log("==========================================");console.log(`Almacenamiento: ${storageMode}`);console.log(`Admin configurado: ${ADMIN_KEY?'sí':'no'}`);console.log(`PC anfitrión: http://localhost:${PORT}`);const nets=os.networkInterfaces();for(const list of Object.values(nets))for(const n of(list||[]))if(n.family==="IPv4"&&!n.internal)console.log(`Red local:    http://${n.address}:${PORT}`);console.log("\n")}));
