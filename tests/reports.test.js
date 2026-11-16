import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReport,groupRows,filterOptions,DEFAULT_FILTERS,describeFilters,sortRows} from '../src/reports/model.js';
import {serializeCsv} from '../src/reports/csv.js';
import {createReportPdf} from '../src/reports/exportPdf.js';
const person=(id,name,gender,schoolId,extra={})=>({id:`link-${id}`,personId:id,name,gender,schoolId,status:'Aprovado',birth:'2012-02-03',cpf:'12345678900',...extra});
const source={schools:[{id:'s1',name:'Escola Árvore',city:'Boa Vista'},{id:'s2',name:'Escola Norte',city:'Pacaraima'},{id:'s3',name:'Sem inscrições',city:'Boa Vista'}],events:[{id:'e1',name:'Jogos escolares',year:2026,status:'Inscrições abertas',modalities:[{id:'m1',name:'Atletismo'}],categories:[{id:'c1',name:'Sub-14',modality:'Atletismo',modalityId:'m1',proofs:[{id:'p1',name:'100 m'}]},{id:'c2',name:'Sub-16',modality:'Atletismo',modalityId:'m1',proofs:[]}]},{id:'e2',name:'Outro evento',year:2026,status:'Rascunho',modalities:[],categories:[]}],data:{athletes:[person('a','Ana','Feminino','s1',{photo:{id:'foto'}}),person('b','Bruno','Masculino','s1'),person('c','Carla','Feminino','s2'),person('d','Arquivado','Masculino','s2',{archived:true,status:'Encerrado'})],staff:[person('t','Técnico','Masculino','s1')],responsibles:[person('r','Diretora','Feminino','s1'),person('r2','Responsável sem evento','Masculino','s3')],registrations:[{id:'r1',school_id:'s1',event_id:'e1',category_id:'c1',proof_id:'p1',status:'approved',created_at:'2026-11-16T02:00:00Z'},{id:'r2',school_id:'s1',event_id:'e1',category_id:'c2',status:'submitted',created_at:'2026-11-16T15:00:00Z'},{id:'r3',school_id:'s2',event_id:'e1',category_id:'c1',proof_id:'p1',status:'cancelled',created_at:'2026-11-17T15:00:00Z'}],allocations:[{id:'x1',registration_id:'r1',person_id:'a',active:true},{id:'x2',registration_id:'r1',person_id:'b',active:true},{id:'x3',registration_id:'r2',person_id:'a',active:true},{id:'x4',registration_id:'r3',person_id:'c',active:false}],registrationStaff:[{registration_id:'r1',person_id:'t'}]}};
const report=f=>buildReport(source,f);
test('combina escola, sexo, categoria, prova e situação sem contar atleta repetido como outra pessoa',()=>{
 const all=report();assert.equal(all.rows.length,4);assert.equal(all.summary.people,3);
 const f=report({schoolId:'s1',gender:'Feminino',categoryId:'c1',proofId:'p1',status:'approved'});
 assert.deepEqual(f.rows.map(r=>r.cells.name),['Ana']);assert.equal(f.summary.registrations,1);
 const groups=groupRows(report({schoolId:'s1'}).rows,'gender');assert.equal(groups.find(r=>r.key==='Feminino').cells.records,2);assert.equal(groups.find(r=>r.key==='Feminino').cells.people,1);
});
test('inscrição mista informa atletas encontrados e tamanho original do elenco',()=>{
 const r=report({type:'registrations',gender:'Feminino',schoolId:'s1',status:'approved'});assert.equal(r.rows[0].cells.athletes,1);assert.equal(r.rows[0].cells.totalAthletes,2);assert.equal(r.rows[0].cells.athleteNames,'Ana');
});
test('sexo da comissão e do responsável não herda sexo do elenco',()=>{
 assert.equal(report({type:'staffEntries',gender:'Masculino',eventId:'e1'}).rows[0].cells.name,'Técnico');assert.equal(report({type:'staffEntries',gender:'Feminino'}).rows.length,0);
 assert.deepEqual(report({type:'responsibles',gender:'Feminino',eventId:'e1'}).rows.map(r=>r.cells.name),['Diretora']);
 assert.equal(report({type:'responsibles',eventId:'e1',schoolId:'s3'}).rows.length,0);
});
test('cadastros sem inscrição aparecem no cadastro; evento exige relação real',()=>{
 assert.equal(report({type:'athletes'}).rows.length,3);assert.equal(report({type:'athletes',includeArchived:true}).rows.length,4);
 assert.equal(report({type:'staff',categoryId:'c2'}).rows.length,0);assert.equal(report({type:'staff',categoryId:'c1'}).rows.length,1);
 assert.equal(report({type:'schools'}).rows.length,3);assert.equal(report({type:'schools',eventId:'e1'}).rows.length,2);
 assert.equal(report({type:'events'}).rows.length,2);assert.equal(report({type:'events',schoolId:'s1'}).rows.length,1);
});
test('data da inscrição usa dia de Manaus e valida intervalos',()=>{
 assert.equal(report({from:'2026-11-15',to:'2026-11-15'}).rows.length,2);
 assert.equal(report({from:'2026-11-16',to:'2026-11-16'}).rows.length,1);
 assert.ok(report({from:'2026-11-17',to:'2026-11-15'}).error);assert.ok(report({yearFrom:'2020',yearTo:'2010'}).error);
 assert.equal(report({photo:'with',yearFrom:'2012',yearTo:'2012'}).summary.people,1);
});
test('opções dependem do evento e categoria; pesquisa ignora acentos',()=>{
 assert.equal(filterOptions(source.events,source.schools,{eventId:'e2'}).categories.length,0);
 assert.equal(filterOptions(source.events,source.schools,{eventId:'e1',categoryId:'c2'}).proofs.length,0);
 assert.equal(report({query:'arvore'}).rows.length,3);
 const labels=describeFilters(source.events,source.schools,{...DEFAULT_FILTERS,schoolId:'s1',gender:'Feminino',categoryId:'c1'});assert.ok(labels.includes('Escola: Escola Árvore'));assert.ok(labels.some(l=>l.includes('Sub-14')));
 const original=report().rows;sortRows(original,'name','desc');assert.equal(original[0].cells.name,'Ana');
});
test('CSV preserva acentos, aspas, zeros do CPF e neutraliza fórmulas',()=>{
 const csv=serializeCsv([{key:'x',label:'Nome'}],[{cells:{x:'=HYPERLINK("x")'}},{cells:{x:'Árvore; "Sul"'}},{cells:{x:'04182530217'}}]);
 assert.ok(csv.startsWith('\ufeff'));assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'));assert.ok(csv.includes('"Árvore; ""Sul"""'));assert.ok(csv.includes('04182530217'));
});
test('PDF real com filtros e paginação exporta todas as linhas e omite CPF por padrão',async()=>{
 const r=report({gender:'Feminino'}),columns=r.columns.filter(c=>c.visible);assert.ok(!columns.some(c=>c.key==='cpf'));
 const rows=Array.from({length:120},(_,i)=>({...r.rows[0],key:String(i),cells:{...r.rows[0].cells,name:`Ana ${i}`}}));
 const doc=await createReportPdf({title:'Atletas nas inscrições',institution:'IDJUV',columns,rows,filters:['Sexo: Feminino','Escola: Escola Árvore'],summary:{...r.summary,records:120}});
 assert.ok(doc.getNumberOfPages()>1);assert.ok(doc.output().startsWith('%PDF'));assert.ok(doc.output().includes('Ana 119'));
 await assert.rejects(createReportPdf({columns:[],rows:[]}),/resultados/);
});

test('ordenação de datas é cronológica em vez de ordenar o dia impresso',()=>{
 const rows=[{key:'a',cells:{birth:'01/12/2012'}},{key:'b',cells:{birth:'30/01/2012'}}];
 assert.deepEqual(sortRows(rows,'birth').map(r=>r.key),['b','a']);
});
