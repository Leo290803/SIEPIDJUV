import test from 'node:test';
import assert from 'node:assert/strict';
import {pagePlan} from '../src/data/pagePlan.js';
import {exportPages,MAX_EXPORT_ROWS} from '../src/reports/exportPages.js';
const response=(rows,total=rows.length,snapshot='v1')=>({rows,total,snapshot,summary:{records:total}});
test('cada rota solicita somente a tela e mantém o escopo escolar',()=>{
 assert.equal(pagePlan({page:'Relatórios'}).mode,'light');
 assert.equal(pagePlan({page:'Visão geral'}).mode,'dashboard');
 const plan=pagePlan({page:'Atletas',schoolId:'s',recordId:'p',action:'edit'},{query:'Ana'},50);
 assert.equal(plan.mode,'people');assert.equal(plan.role,'athlete');assert.equal(plan.schoolId,'s');assert.equal(plan.offset,50);assert.equal(plan.limit,25);assert.equal(plan.detailId,'p');
 assert.equal(pagePlan({page:'Minhas inscrições',action:'editRegistration',registrationId:'r'}).edit,true);
});
test('exportação busca lotes sequenciais, usa o mesmo marcador e inclui a última página',async()=>{
 const calls=[],batches=[],progress=[];
 await exportPages({options:{filters:{gender:'Feminino'}},snapshot:'v1',fetchPage:async options=>{
  calls.push(options);return response(Array.from({length:options.offset===0?500:3},(_,i)=>({key:options.offset+i})),503);
 },onBatch:rows=>batches.push(...rows),onProgress:(done,total)=>progress.push([done,total])});
 assert.deepEqual(calls.map(c=>c.offset),[0,500]);assert.ok(calls.every(c=>c.limit===500&&c.snapshot==='v1'&&c.filters.gender==='Feminino'));assert.equal(batches.at(-1).key,502);assert.deepEqual(progress.at(-1),[503,503]);
});
test('mudança entre páginas impede arquivo parcial ou com contagens inconsistentes',async()=>{
 let calls=0;
 await assert.rejects(exportPages({options:{},fetchPage:async()=>response(Array(500).fill({}),600,++calls===1?'v1':'v2'),onBatch:()=>{}}),/mudaram/);
});
test('limite de exportação e página interrompida geram erro em vez de truncar silenciosamente',async()=>{
 await assert.rejects(exportPages({options:{},fetchPage:async()=>response([{}],MAX_EXPORT_ROWS+1),onBatch:()=>assert.fail('Não deveria consumir o lote')}),/dividir a exportação/);
 await assert.rejects(exportPages({options:{},fetchPage:async()=>response([],10),onBatch:()=>{}}),/interrompida/);
});
test('cancelamento impede novas consultas e processamento do lote recebido',async()=>{
 const controller=new AbortController();let calls=0,batches=0;
 await assert.rejects(exportPages({options:{},signal:controller.signal,fetchPage:async()=>{calls++;controller.abort();return response([{}]);},onBatch:()=>batches++}),{name:'AbortError'});
 assert.equal(calls,1);assert.equal(batches,0);
});

test("fila de inscrições usa páginas curtas sem reduzir páginas de pessoas",()=>{
 assert.equal(pagePlan({page:"Inscrições"}).limit,10);
 assert.equal(pagePlan({page:"Minhas inscrições"}).limit,10);
 assert.equal(pagePlan({page:"Atletas"}).limit,25);
});

test('filtro da escola na Secretaria mantém prioridade da escola autorizada na rota',()=>{assert.equal(pagePlan({page:'Inscrições'},{schoolId:'filter'}).schoolId,'filter');assert.equal(pagePlan({page:'Minhas inscrições',schoolId:'authorized'},{schoolId:'other'}).schoolId,'authorized');});
