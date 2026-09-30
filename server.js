const http=require("http");
const fs=require("fs");
const path=require("path");
const os=require("os");
const crypto=require("crypto");

const ROOT=__dirname;
const PORT=Number(process.env.PORT||8787);
const QUESTIONS=JSON.parse(fs.readFileSync(path.join(ROOT,"general_questions.json"),"utf8"));
const DATA_DIR=path.join(ROOT,"data");
const RANK_FILE=path.join(DATA_DIR,"rankings.json");
if(!fs.existsSync(DATA_DIR))fs.mkdirSync(DATA_DIR,{recursive:true});

let rankings={};
try{rankings=JSON.parse(fs.readFileSync(RANK_FILE,"utf8"))}catch(e){rankings={}}
const rooms=new Map();

const MIME={".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".css":"text/css; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".svg":"image/svg+xml",".txt":"text/plain; charset=utf-8"};

function saveRankings(){
 const safe={};
 for(const [id,r] of Object.entries(rankings))safe[id]={...r,recent:(r.recent||[]).slice(-250)};
 fs.writeFileSync(RANK_FILE,JSON.stringify(safe,null,2),"utf8")
}
function json(res,status,obj){const body=JSON.stringify(obj);res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(body)}
function body(req){return new Promise((resolve,reject)=>{let d="";req.on("data",c=>{d+=c;if(d.length>1e6)req.destroy()});req.on("end",()=>{try{resolve(d?JSON.parse(d):{})}catch(e){reject(e)}});req.on("error",reject)})}
function cleanName(v){return String(v||"Jugador").replace(/[<>]/g,"").trim().slice(0,18)||"Jugador"}
function roomCode(){const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let c="";do{c="";for(let i=0;i<5;i++)c+=chars[Math.floor(Math.random()*chars.length)]}while(rooms.has(c));return c}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
function getRank(id,name){
 if(!rankings[id])rankings[id]={id,name:cleanName(name),rating:1000,wins:0,games:0,totalScore:0,recent:[]};
 rankings[id].name=cleanName(name||rankings[id].name);return rankings[id]
}
function topRanking(){return Object.values(rankings).sort((a,b)=>b.rating-a.rating||b.wins-a.wins||b.totalScore-a.totalScore).slice(0,50).map(r=>({name:r.name,rating:r.rating,wins:r.wins,games:r.games,totalScore:r.totalScore}))}
function publicPlayers(room){return [...room.players.values()].map(p=>({id:p.id,name:p.name,score:p.score,lives:p.lives,answered:!!p.answered,eliminated:!!p.eliminated,online:(room.streams.get(p.id)?.size||0)>0}))}
function sendSSE(res,msg){try{res.write(`data: ${JSON.stringify(msg)}\n\n`)}catch(e){}}
function broadcast(room,msg){for(const set of room.streams.values())for(const res of set)sendSSE(res,msg)}
function lobby(room){broadcast(room,{type:"lobby",code:room.code,mode:room.mode,hostId:room.hostId,players:publicPlayers(room)})}
function createRoom(playerId,name,mode){
 const code=roomCode(),p={id:playerId,name:cleanName(name),score:0,lives:3,answered:null,eliminated:false};
 const r={code,mode,hostId:playerId,status:"lobby",players:new Map([[playerId,p]]),streams:new Map(),createdAt:Date.now(),round:0,maxRounds:mode==="ranked"?10:mode==="competition"?12:15,current:null,timer:null,finishing:false,questions:[],used:[]};
 rooms.set(code,r);return r
}
function roomQuestionSet(room,count){
 const recent=new Set();
 for(const p of room.players.values()){const r=getRank(p.id,p.name);for(const q of (r.recent||[]).slice(-180))recent.add(q)}
 let pool=QUESTIONS.filter(q=>!recent.has(q.id));
 if(pool.length<count*2)pool=[...QUESTIONS];
 const by={};for(const q of shuffle(pool)){(by[q.category]??=[]).push(q)}
 const cats=shuffle(Object.keys(by)),out=[];let idx=0,guard=0;
 while(out.length<count&&guard++<10000){
  const c=cats[idx++%cats.length],arr=by[c];if(arr?.length)out.push(arr.pop())
 }
 if(out.length<count){const used=new Set(out.map(q=>q.id));out.push(...shuffle(pool.filter(q=>!used.has(q.id))).slice(0,count-out.length))}
 return out
}
function prepareQuestion(q){
 const opts=q.answers.map((text,i)=>({text,correct:i===q.correct}));const mixed=shuffle(opts);
 return {id:q.id,category:q.category,difficulty:q.difficulty,question:q.question,answers:mixed.map(x=>x.text),correct:mixed.findIndex(x=>x.correct)}
}
function startMatch(room){
 room.status="playing";room.round=0;room.used=[];room.questions=roomQuestionSet(room,room.maxRounds);
 for(const p of room.players.values()){p.score=0;p.lives=3;p.answered=null;p.eliminated=false}
 nextQuestion(room)
}
function nextQuestion(room){
 if(room.status!=="playing")return;
 room.round++;
 if(room.round>room.maxRounds)return finishMatch(room);
 const raw=room.questions[room.round-1];if(!raw)return finishMatch(room);
 const q=prepareQuestion(raw),endsAt=Date.now()+15000;
 room.current={...q,seq:room.round,endsAt};room.finishing=false;room.used.push(q.id);
 for(const p of room.players.values())p.answered=null;
 broadcast(room,{type:"question",seq:room.round,round:room.round,totalRounds:room.maxRounds,mode:room.mode,category:q.category,question:q.question,answers:q.answers,endsAt,players:publicPlayers(room)});
 clearTimeout(room.timer);room.timer=setTimeout(()=>finishRound(room),15100)
}
function activePlayers(room){return [...room.players.values()].filter(p=>!p.eliminated)}
function allAnswered(room){const active=activePlayers(room);return active.length>0&&active.every(p=>p.answered)}
function answer(room,playerId,seq,index){
 if(room.status!=="playing"||!room.current||room.current.seq!==seq)return {ok:false,error:"La pregunta ya cambió."};
 const p=room.players.get(playerId);if(!p||p.eliminated)return {ok:false,error:"Jugador no activo."};
 if(p.answered)return {ok:false,error:"Ya respondiste."};
 const correct=index===room.current.correct,remaining=Math.max(0,room.current.endsAt-Date.now());
 const points=correct?100+Math.floor(50*(remaining/15000)):0;
 p.score+=points;if(room.mode==="battle"&&!correct){p.lives--;if(p.lives<=0)p.eliminated=true}
 p.answered={index,correct,points};broadcast(room,{type:"players",players:publicPlayers(room)});
 if(allAnswered(room))setTimeout(()=>finishRound(room),450);
 return {ok:true}
}
function finishRound(room){
 if(room.status!=="playing"||!room.current||room.finishing)return;room.finishing=true;clearTimeout(room.timer);
 for(const p of activePlayers(room)){
  if(!p.answered){p.answered={index:null,correct:false,points:0};if(room.mode==="battle"){p.lives--;if(p.lives<=0)p.eliminated=true}}
 }
 const q=room.current;
 broadcast(room,{type:"reveal",correctIndex:q.correct,players:publicPlayers(room)});
 const alive=activePlayers(room);
 const shouldEnd=(room.mode==="battle"&&alive.length<=1&&room.players.size>=2)||room.round>=room.maxRounds;
 room.current=null;
 setTimeout(()=>shouldEnd?finishMatch(room):nextQuestion(room),1500)
}
function rankingDeltas(n){
 if(n<=2)return [20,-12];
 if(n===3)return [25,5,-10];
 return [30,10,-5,-15]
}
function finishMatch(room){
 if(room.status!=="playing")return;room.status="finished";clearTimeout(room.timer);
 let results=[...room.players.values()];
 results.sort((a,b)=>{
  if(room.mode==="battle"){if(a.eliminated!==b.eliminated)return a.eliminated?1:-1;if(a.lives!==b.lives)return b.lives-a.lives}
  return b.score-a.score
 });
 const deltas=rankingDeltas(results.length);
 results.forEach((p,i)=>{
  const r=getRank(p.id,p.name);r.games++;r.totalScore+=p.score;if(i===0)r.wins++;
  let delta=0;if(room.mode==="ranked"){delta=deltas[i]||0;r.rating=Math.max(100,r.rating+delta)}
  r.recent=[...(r.recent||[]),...room.used].slice(-250);p.finalRating=r.rating;p.delta=delta
 });
 saveRankings();
 broadcast(room,{type:"matchEnd",results:results.map((p,i)=>({id:p.id,name:p.name,place:i+1,score:p.score,lives:p.lives,rating:p.finalRating,delta:p.delta})),ranking:topRanking()})
}
function leaveRoom(room,id){
 const wasHost=room.hostId===id;room.players.delete(id);
 const sets=room.streams.get(id);if(sets)for(const res of sets)try{res.end()}catch(e){}
 room.streams.delete(id);
 if(room.players.size===0){clearTimeout(room.timer);rooms.delete(room.code);return}
 if(wasHost)room.hostId=room.players.keys().next().value;
 if(room.status==="lobby")lobby(room)
}
function staticFile(req,res,pathname){
 let rel=pathname==="/"?"index.html":decodeURIComponent(pathname).replace(/^\/+/,"");
 const file=path.normalize(path.join(ROOT,rel));if(!file.startsWith(ROOT))return json(res,403,{error:"Forbidden"});
 fs.stat(file,(err,st)=>{if(err||!st.isFile())return json(res,404,{error:"Not found"});const ext=path.extname(file).toLowerCase();res.writeHead(200,{"Content-Type":MIME[ext]||"application/octet-stream","Cache-Control":ext===".html"?"no-store":"public, max-age=3600"});fs.createReadStream(file).pipe(res)})
}
const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,`http://${req.headers.host||"localhost"}`),p=u.pathname;
 try{
  if(req.method==="GET"&&p==="/api/status")return json(res,200,{ok:true,rooms:rooms.size,players:[...rooms.values()].reduce((a,r)=>a+r.players.size,0),questions:QUESTIONS.length});
  if(req.method==="GET"&&p==="/api/ranking")return json(res,200,{ranking:topRanking()});
  if(req.method==="GET"&&p==="/api/multi/stream"){
   const code=(u.searchParams.get("code")||"").toUpperCase(),id=u.searchParams.get("playerId")||"",room=rooms.get(code);
   if(!room||!room.players.has(id))return json(res,404,{error:"Sala o jugador no encontrado"});
   res.writeHead(200,{"Content-Type":"text/event-stream","Cache-Control":"no-cache","Connection":"keep-alive","X-Accel-Buffering":"no"});res.write(": connected\n\n");
   if(!room.streams.has(id))room.streams.set(id,new Set());room.streams.get(id).add(res);
   const hb=setInterval(()=>{try{res.write(": ping\n\n")}catch(e){}},20000);
   req.on("close",()=>{clearInterval(hb);room.streams.get(id)?.delete(res);if(room.status==="lobby")lobby(room)});
   if(room.status==="lobby")sendSSE(res,{type:"lobby",code:room.code,mode:room.mode,hostId:room.hostId,players:publicPlayers(room)});
   return
  }
  if(req.method==="POST"&&p==="/api/multi/create"){
   const b=await body(req),mode=["battle","ranked","competition"].includes(b.mode)?b.mode:"competition";if(!b.playerId)return json(res,400,{error:"Jugador inválido"});
   const room=createRoom(String(b.playerId),b.name,mode);getRank(String(b.playerId),b.name);saveRankings();return json(res,200,{code:room.code,mode,hostId:room.hostId})
  }
  if(req.method==="POST"&&p==="/api/multi/join"){
   const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(!room)return json(res,404,{error:"La sala no existe"});if(room.status!=="lobby")return json(res,409,{error:"La partida ya comenzó"});if(room.players.size>=4&&!room.players.has(b.playerId))return json(res,409,{error:"La sala ya tiene 4 jugadores"});
   const id=String(b.playerId||"");if(!id)return json(res,400,{error:"Jugador inválido"});room.players.set(id,{id,name:cleanName(b.name),score:0,lives:3,answered:null,eliminated:false});getRank(id,b.name);saveRankings();lobby(room);return json(res,200,{ok:true,mode:room.mode,hostId:room.hostId})
  }
  if(req.method==="POST"&&p==="/api/multi/start"){
   const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(!room)return json(res,404,{error:"Sala no encontrada"});if(room.hostId!==b.playerId)return json(res,403,{error:"Solo el anfitrión puede comenzar"});if(room.players.size<2)return json(res,409,{error:"Se necesitan al menos 2 jugadores"});if(room.players.size>4)return json(res,409,{error:"Máximo 4 jugadores"});startMatch(room);return json(res,200,{ok:true})
  }
  if(req.method==="POST"&&p==="/api/multi/answer"){
   const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(!room)return json(res,404,{error:"Sala no encontrada"});const out=answer(room,String(b.playerId||""),Number(b.seq),Number(b.answer));return json(res,out.ok?200:409,out)
  }
  if(req.method==="POST"&&p==="/api/multi/leave"){
   const b=await body(req),room=rooms.get(String(b.code||"").toUpperCase());if(room)leaveRoom(room,String(b.playerId||""));return json(res,200,{ok:true})
  }
  if(req.method==="GET")return staticFile(req,res,p);
  return json(res,404,{error:"Not found"})
 }catch(e){console.error(e);return json(res,500,{error:"Error interno del servidor"})}
});
setInterval(()=>{const now=Date.now();for(const [code,r] of rooms){if(now-r.createdAt>2*60*60*1000&&r.status!=="playing"){broadcast(r,{type:"roomClosed"});clearTimeout(r.timer);rooms.delete(code)}}},60000);
server.listen(PORT,"0.0.0.0",()=>{
 console.log("\n==========================================");
 console.log("  SEMANTROPIC TRIVIA — ONLINE ALPHA 0.2.4");
 console.log("==========================================");
 console.log(`PC anfitrión: http://localhost:${PORT}`);
 const nets=os.networkInterfaces();
 for(const list of Object.values(nets))for(const n of (list||[]))if(n.family==="IPv4"&&!n.internal)console.log(`Red local:    http://${n.address}:${PORT}`);
 console.log("\nComparte la dirección 'Red local' con tus compañeros.");
 console.log("Mantén esta ventana abierta mientras juegan.\n")
});
