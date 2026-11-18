import test from 'node:test';
import assert from 'node:assert/strict';
import {correctionItems,correctionExpired} from '../src/registrationCorrections.js';
const r={id:'r',school_id:'school',category_id:'category'};
const person={id:'link',personId:'person',schoolId:'school',name:'Ana'};
const data={athletes:[person],allocations:[{registration_id:'r',person_id:'person',active:true}]};
const event={requirements:{documents:[{id:'doc',name:'Matrícula',categoryId:'category'},{id:'other',name:'Outro',categoryId:'other'}]}};
test('orientação identifica somente pessoa e documento exatos do elenco e da categoria',()=>{
 const items=correctionItems('Ana: Atualizar telefone\nAna — Matrícula: Substituir arquivo\nAna — Outro: Conferir\nOrientação geral',r,data,event);
 assert.equal(items[0].target.athlete.id,'link');assert.equal(items[0].target.documentId,null);
 assert.equal(items[1].target.documentId,'doc');assert.equal(items[1].message,'Substituir arquivo');
 assert.equal(items[2].target,null);assert.equal(items[3].text,'Orientação geral');
});
test('homônimos, atleta fora da escola ou removido não recebem atalho inferido',()=>{
 assert.equal(correctionItems('Ana: Corrigir',r,{...data,athletes:[person,{...person,id:'other',personId:'p2'}],allocations:[...data.allocations,{registration_id:'r',person_id:'p2'}]},event)[0].target,null);
 assert.equal(correctionItems('Ana: Corrigir',r,{...data,athletes:[{...person,schoolId:'other'}]},event)[0].target,null);
 assert.equal(correctionItems('Ana: Corrigir',r,{...data,allocations:[{...data.allocations[0],active:false}]},event)[0].target,null);
});
test('prazo inclui o instante limite e não inventa expiração para prazo ausente',()=>{
 const now=Date.parse('2026-11-18T12:00:00Z');
 assert.equal(correctionExpired('2026-11-18T12:00:00Z',now),true);
 assert.equal(correctionExpired('2026-11-18T12:00:01Z',now),false);
 assert.equal(correctionExpired(null,now),false);
 assert.deepEqual(correctionItems(null,r,data,event),[]);
});
