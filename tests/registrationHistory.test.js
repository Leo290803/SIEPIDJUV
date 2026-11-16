import test from 'node:test';
import assert from 'node:assert/strict';
import {portalRepository} from '../src/data/portalRepository.js';
function clientFor(tables,errorTable) {
 const calls=[];
 return {calls,from(table){
  const query={table,filters:{},select(){return this;},eq(key,value){this.filters[key]=value;return this;},order(key){this.orderKey=key;return this;},range(start,end){this.start=start;this.end=end;return this;},async abortSignal(signal){
    calls.push({table,filters:{...this.filters},start:this.start,end:this.end,orderKey:this.orderKey});
    signal.throwIfAborted();
    if(table===errorTable)return {data:null,error:{code:'42501',message:'Acesso negado'}};
    const rows=tables[table].filter(row=>Object.entries(this.filters).every(([key,value])=>row[key]===value)).sort((a,b)=>a.id.localeCompare(b.id));
    return {data:rows.slice(this.start,this.end+1),error:null};
  }};
  return query;
 }};
}
test('detalhes consultam versões e decisões somente da instituição e inscrição escolhidas',async()=>{
 const make=(id,tenant='tenant',registration='chosen')=>({id,institution_id:tenant,registration_id:registration});
 const client=clientFor({registration_versions:[make('v1'),make('v2','other'),make('v3','tenant','other')],registration_decisions:[make('d1'),make('d2','other')]});
 const result=await portalRepository(client).history('tenant','chosen');
 assert.deepEqual(result.versions.map(row=>row.id),['v1']);assert.deepEqual(result.decisions.map(row=>row.id),['d1']);
 assert.equal(client.calls.length,2);assert.ok(client.calls.every(c=>c.filters.institution_id==='tenant'&&c.filters.registration_id==='chosen'));
});
test('histórico com mais de 500 revisões não perde páginas',async()=>{
 const rows=Array.from({length:1001},(_,index)=>({id:String(index).padStart(5,'0'),institution_id:'tenant',registration_id:'chosen'}));
 const client=clientFor({registration_versions:rows,registration_decisions:[]});
 const result=await portalRepository(client).history('tenant','chosen');
 assert.equal(result.versions.length,1001);assert.equal(result.versions.at(-1).id,'01000');
 assert.deepEqual(client.calls.filter(c=>c.table==='registration_versions').map(c=>c.start),[0,500,1000]);
 assert.ok(client.calls.every(c=>c.end-c.start===499&&c.orderKey==='id'));
});
test('histórico vazio abre sem erro; falha de permissão é propagada',async()=>{
 assert.deepEqual(await portalRepository(clientFor({registration_versions:[],registration_decisions:[]})).history('tenant','chosen'),{versions:[],decisions:[]});
 await assert.rejects(portalRepository(clientFor({registration_versions:[],registration_decisions:[]},'registration_versions')).history('tenant','chosen'),{code:'42501'});
});
test('consulta sem inscrição ou cancelada não devolve histórico',async()=>{
 const client=clientFor({registration_versions:[],registration_decisions:[]});
 await assert.rejects(portalRepository(client).history('tenant',''),/Selecione uma inscrição/);assert.equal(client.calls.length,0);
 const controller=new AbortController();controller.abort();
 await assert.rejects(portalRepository(client).history('tenant','chosen',controller.signal),{name:'AbortError'});
});
