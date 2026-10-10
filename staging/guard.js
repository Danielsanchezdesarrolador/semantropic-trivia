'use strict';
const target=require('./target.json');
function validate(env){
 if(env.SEMANTROPIC_ENV!=='staging')return null;
 if(env.SURVIVAL019_TEST==='1'||env.SURVIVAL019_TEST_PG_URL)throw Error('Staging refuses test storage overrides');
 if(env.SURVIVAL019_ENABLED!=='1')throw Error('Staging feature flag required');
 let db;try{db=new URL(env.DATABASE_URL);}catch{throw Error('Staging requires PostgreSQL');}
 const local=env.STAGING_LOCAL==='1';
 if(!['postgres:','postgresql:'].includes(db.protocol)||!(local?['127.0.0.1']:target.hosts).includes(db.hostname)||db.pathname!=='/survival019_staging'||(local&&db.port!=='55439'))throw Error('Staging database target rejected');
 if(!local&&db.searchParams.get('sslmode')!=='require')throw Error('PostgreSQL TLS required');
 const origins=String(env.SURVIVAL019_ORIGINS||'').split(',').filter(Boolean);
 if(!origins.length)throw Error('Explicit staging origins required');
 for(const origin of origins){let u;try{u=new URL(origin);}catch{throw Error('Invalid staging origin');}
 if(u.origin!==origin||u.hostname==='semantropic-trivia.onrender.com'||(!local&&u.protocol!=='https:')||(local&&!['127.0.0.1','localhost'].includes(u.hostname)))throw Error('Staging origin rejected');}
 return {local};
}
module.exports={validate};
