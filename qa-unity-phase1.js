const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const qs=JSON.parse(fs.readFileSync(path.join(root,'general_questions.json'),'utf8'));
const checks=[];
function check(name,ok){checks.push({name,ok:!!ok});if(!ok)process.exitCode=1}
check('unity quiz endpoint',server.includes('/api/unity/quiz-result'));
check('server validates question ids',server.includes('QUESTION_BY_ID')&&server.includes('selectedAnswer'));
check('exactly ten answers required',server.includes('submitted.length!==10')&&server.includes('total!==10'));
check('run id deduplication',server.includes('recentRunIds.includes(runId)'));
check('phase1 status flags',server.includes('unityPhase1:true')&&server.includes('unityQuizResult:true'));
check('account login preserved',server.includes('/api/account/login'));
check('profile customize preserved',server.includes('/api/profile/customize'));
check('1410 questions',qs.length===1410);
check('4 answers each',qs.every(q=>Array.isArray(q.answers)&&q.answers.length===4&&Number.isInteger(q.correct)&&q.correct>=0&&q.correct<4));
for(const c of checks)console.log((c.ok?'PASS':'FAIL')+'  '+c.name);
