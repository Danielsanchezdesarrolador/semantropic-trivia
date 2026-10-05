const fs=require('fs');
const path=require('path');
const cp=require('child_process');
const ROOT=path.resolve(__dirname,'..');
function ok(cond,msg){if(!cond){console.error('FAIL:',msg);process.exit(1)}console.log('PASS:',msg)}
const required=[
 'index.html','server.js','world_tour_data.js','general_questions.json','package.json','render.yaml',
 'assets/css/01-base.css','assets/css/02-avatar.css','assets/css/03-systems.css','assets/css/04-identity.css','assets/css/05-effects.css',
 'assets/js/00-fx-engine.js','assets/js/01-core.js','assets/js/02-question-engine.js','assets/js/03-profile-cloud.js','assets/js/04-multiplayer.js','assets/js/05-world-tour.js','assets/js/06-economy-bootstrap.js'
];
required.forEach(f=>ok(fs.existsSync(path.join(ROOT,f)),`existe ${f}`));
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
ok(!/<style[>\s]/i.test(html),'index.html no contiene CSS incrustado');
const inline=[...html.matchAll(/<script([^>]*)>/gi)].filter(m=>!m[1].includes('src='));
ok(inline.length===0,'index.html no contiene JavaScript incrustado');
ok(html.includes('semantropic-version" content="0.6.0'),'frontend web fallback conserva versión 0.6.0');
const q=JSON.parse(fs.readFileSync(path.join(ROOT,'general_questions.json'),'utf8'));
ok(Array.isArray(q)&&q.length===1410,'banco general conserva 1.410 preguntas');
for(const f of required.filter(x=>x.endsWith('.js'))){cp.execFileSync(process.execPath,['--check',path.join(ROOT,f)],{stdio:'ignore'});console.log('PASS: sintaxis '+f)}
const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
ok(pkg.version==='0.7.0','backend package.json versión 0.7.0');
console.log('\nQA STRUCTURE PASS');
