'use strict';
const fs=require('node:fs');const path=require('node:path');
class FileStore{
 constructor(file){this.file=file;this.chain=Promise.resolve();fs.mkdirSync(path.dirname(file),{recursive:true});}
 transaction(player,operation){const work=this.chain.then(async()=>{const all=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{};const value=all[player]||{runs:{},starts:{},records:{}};const result=await operation(value);all[player]=value;const temp=this.file+'.tmp';const descriptor=fs.openSync(temp,'w');try{fs.writeFileSync(descriptor,JSON.stringify(all));fs.fsyncSync(descriptor);}finally{fs.closeSync(descriptor);}fs.renameSync(temp,this.file);return result;});this.chain=work.catch(()=>{});return work;}
}
class PgStore{
 constructor(pool){this.pool=pool;}
 async transaction(player,operation){const client=await this.pool.connect();const key='survival019:'+player;try{await client.query('BEGIN');await client.query("INSERT INTO game_settings(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO NOTHING",[key,JSON.stringify({runs:{},starts:{},records:{}})]);const row=await client.query('SELECT value FROM game_settings WHERE key=$1 FOR UPDATE',[key]);const value=row.rows[0].value;const result=await operation(value);await client.query('UPDATE game_settings SET value=$2::jsonb,updated_at=NOW() WHERE key=$1',[key,JSON.stringify(value)]);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
}
module.exports={FileStore,PgStore};