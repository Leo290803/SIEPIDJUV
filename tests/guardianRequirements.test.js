import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultGuardian,guardianIssues,guardianPolicy,isMinorAt,validateGuardianPolicy} from '../src/guardianRequirements.js';
import {eventFormIssues} from '../src/eventFormIssues.js';
import {athleteEventPending} from '../src/eventRequirements.js';
import {fromEvent,sectionPayload} from '../src/data/eventMapping.js';
import {duplicateEvent} from '../src/duplicateEvent.js';
const guardian={...defaultGuardian(),enabled:true,referenceDate:'2026-11-16'};
const event={id:'e',categories:[{id:'c',name:'Categoria',modality:'Atletismo'}],requirements:{data:{},documents:[],guardian}};
const athlete={name:'Ana',cpf:'52998224725',birth:'2008-11-17',gender:'Feminino'};
const complete={...athlete,guardian_name:'Maria de Oliveira',guardian_cpf:'11144477735',guardian_relationship:'Mãe',guardian_phone:'(95) 99999-8888'};
test('idade usa data de início do evento, com limite exato de 18 anos',()=>{
 assert.equal(isMinorAt('2008-11-17','2026-11-16'),true);
 assert.equal(isMinorAt('2008-11-16','2026-11-16'),false);
 assert.equal(isMinorAt('2008-11-15','2026-11-16'),false);
 assert.equal(isMinorAt('2008-11-17','2026-11-17'),false);
 assert.equal(isMinorAt('2008-02-29','2026-02-27'),true);
 assert.equal(isMinorAt('2008-02-29','2026-02-28'),false);
 assert.equal(isMinorAt('2026-11-17','2026-11-16'),false);
 assert.equal(isMinorAt('2008-02-30','2026-11-16'),false);
});
test('eventos anteriores ficam desativados; inscrição.start não é referência implícita',()=>{
 assert.equal(guardianPolicy({start:'2026-11-16'}).enabled,false);
 assert.equal(guardianPolicy({}).referenceDate,'');
 assert.ok(validateGuardianPolicy({...guardian,referenceDate:''}));
 assert.ok(validateGuardianPolicy({...guardian,referenceDate:'2026-02-30'}));
 assert.ok(validateGuardianPolicy({...guardian,fields:Object.fromEntries(Object.keys(guardian.fields).map(k=>[k,'hidden']))}));
});
test('menor exige os campos configurados; adulto não exige nem valida dados antigos',()=>{
 assert.deepEqual(guardianIssues(athlete,event).map(i=>i.key),['guardian_name','guardian_cpf','guardian_relationship','guardian_phone']);
 assert.deepEqual(guardianIssues(complete,event),[]);
 assert.deepEqual(guardianIssues({...athlete,birth:'2008-11-16',guardian_cpf:'inválido'},event),[]);
 assert.deepEqual(guardianIssues(athlete,{...event,requirements:{...event.requirements,guardian:{...guardian,enabled:false}}}),[]);
});
test('campos opcionais são validados quando preenchidos, e ocultos são ignorados',()=>{
 assert.ok(guardianIssues({...complete,guardian_email:'invalido'},event).some(i=>i.key==='guardian_email'));
 const hidden={...event,requirements:{...event.requirements,guardian:{...guardian,fields:{...guardian.fields,guardian_cpf:'hidden'}}}};
 assert.deepEqual(guardianIssues({...complete,guardian_cpf:'errado'},hidden),[]);
 assert.ok(guardianIssues({...complete,guardian_cpf:athlete.cpf},event).some(i=>i.key==='guardian_cpf'));
 assert.ok(guardianIssues({...complete,guardian_phone:'123'},event).some(i=>i.key==='guardian_phone'));
 assert.ok(guardianIssues({...complete,guardian_relationship:'Pessoa'},event).some(i=>i.key==='guardian_relationship'));
});
test('pendências incluem responsável, categoria e documento com alvo navegável',()=>{
 const scoped={...event,requirements:{...event.requirements,documents:[{id:'d',name:'Matrícula',required:true}]}};
 const issues=eventFormIssues({event:scoped,values:athlete,categoryIds:[],profile:{}});
 assert.ok(issues.some(i=>i.key==='guardian_name'));assert.ok(issues.some(i=>i.key==='categories'));assert.ok(issues.some(i=>i.key==='document:d'));
 assert.ok(issues.filter(i=>i.key.startsWith('guardian_')).every(i=>!i.blockingDraft));
 assert.ok(eventFormIssues({event,values:{...athlete,cpf:''},categoryIds:['c']}).find(i=>i.key==='cpf').blockingDraft);
 assert.deepEqual(eventFormIssues({event,values:complete,categoryIds:['c']}),[]);
});
test('arquivo por categoria não é exigido fora da seleção; remoção volta a gerar pendência',()=>{
 const scoped={...event,requirements:{...event.requirements,documents:[{id:'d',name:'Matrícula',required:true,categoryId:'c'}]}};
 assert.ok(!eventFormIssues({event:scoped,values:complete,categoryIds:[]}).some(i=>i.key==='document:d'));
 assert.ok(!eventFormIssues({event:scoped,values:complete,categoryIds:['c'],profile:{documents:{d:{id:'uploaded'}}}}).some(i=>i.key==='document:d'));
 assert.ok(eventFormIssues({event:scoped,values:complete,categoryIds:['c'],profile:{documents:{d:{id:'uploaded'}}},removed:['d']}).some(i=>i.key==='document:d'));
});
test('cadastro completo é reavaliado quando o evento passa a exigir responsável',()=>{
 const person={...athlete,eventProfiles:{e:{status:'complete',categoryIds:['c'],additionalData:{}}}};
 assert.ok(athleteEventPending(person,event).some(message=>message.includes('responsável')));
 const saved={...person,eventProfiles:{e:{...person.eventProfiles.e,additionalData:complete}}};
 assert.deepEqual(athleteEventPending(saved,event),[]);
});
test('configuração faz ida e volta pelo contrato e a cópia pede nova data',()=>{
 const mapped=fromEvent({id:'e',settings:{guardian,type:'Teste'}},{event_fields:[],document_requirements:[]});
 assert.deepEqual(mapped.requirements.guardian,guardian);
 const payload=sectionPayload(mapped,'requirements');assert.deepEqual(payload.guardian,guardian);
 const copy=duplicateEvent({...event,name:'Evento',year:2026},{name:'Cópia',year:2027},()=>crypto.randomUUID());
 assert.equal(copy.requirements.guardian.enabled,false);assert.equal(copy.requirements.guardian.referenceDate,'');assert.equal(guardian.enabled,true);
});
