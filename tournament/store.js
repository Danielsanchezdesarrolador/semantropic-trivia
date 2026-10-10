'use strict';
class TournamentPgStore {
 constructor(pool){this.pool=pool;}
 async transaction(playerId, fn){
  const client=await this.pool.connect();const key='tournament020:'+playerId;
  try{
   await client.query('BEGIN');
   await client.query("INSERT INTO game_settings(key,value) VALUES ($1,$2::jsonb) ON CONFLICT(key) DO NOTHING",[key,JSON.stringify({runs:{},starts:{},record:{bestRound:0,championships:0,plays:0}})]);
   const data=await client.query('SELECT value FROM game_settings WHERE key=$1 FOR UPDATE',[key]);
   const doc=data.rows[0].value;const result=await fn(doc);
   await client.query('UPDATE game_settings SET value=$2::jsonb,updated_at=NOW() WHERE key=$1',[key,JSON.stringify(doc)]);
   await client.query('COMMIT');return result;
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }
}
module.exports={TournamentPgStore};
