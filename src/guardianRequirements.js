import {validCpf} from './personData.js';
export const guardianFields=[['guardian_name','Nome completo do responsável'],['guardian_cpf','CPF do responsável'],['guardian_relationship','Parentesco'],['guardian_phone','Telefone do responsável'],['guardian_email','E-mail do responsável']];
export const guardianRelationships=['Mãe','Pai','Tutor(a) legal','Outro responsável legal'];
export const defaultGuardian=()=>({enabled:false,referenceDate:'',fields:{guardian_name:'required',guardian_cpf:'required',guardian_relationship:'required',guardian_phone:'required',guardian_email:'optional'}});
export function guardianPolicy(event) {
 const defaults=defaultGuardian(),value=event.requirements?.guardian || event._settings?.guardian || {};
 return {...defaults,...value,enabled:value.enabled===true,fields:{...defaults.fields,...value.fields}};
}
export function validIsoDate(value) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;
 const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function isMinorAt(birth,reference) {
 if(!validIsoDate(birth)||!validIsoDate(reference)||birth>reference)return false;
 const [year,month,day]=birth.split('-').map(Number),adultYear=year+18;
 const lastDay=new Date(Date.UTC(adultYear,month,0)).getUTCDate();
 const adultDate=`${adultYear}-${String(month).padStart(2,'0')}-${String(Math.min(day,lastDay)).padStart(2,'0')}`;
 return reference<adultDate;
}
export function validateGuardianPolicy(policy) {
 if(policy.referenceDate&&(!validIsoDate(policy.referenceDate)||policy.referenceDate<'1900-01-01'))return 'Informe uma data de início do evento válida.';
 if(policy.enabled&&!policy.referenceDate)return 'Informe a data de início do evento para calcular a idade.';
 if(policy.enabled&&!guardianFields.some(([key])=>policy.fields[key]!=='hidden'))return 'Selecione ao menos um dado do responsável para solicitar.';
 return '';
}
export function guardianIssues(values,event) {
 const policy=guardianPolicy(event),issues=[];
 if(!policy.enabled)return issues;
 const add=(key,message)=>issues.push({key,message});
 if(validateGuardianPolicy(policy)){add('guardian_config','A Secretaria precisa configurar a data de início e os dados do responsável legal.');return issues;}
 if(!validIsoDate(values.birth))return issues;
 if(values.birth>policy.referenceDate){add('birth','O nascimento deve ser anterior ou igual ao início do evento.');return issues;}
 if(!isMinorAt(values.birth,policy.referenceDate))return issues;
 for(const [key,label] of guardianFields){
  const mode=policy.fields[key],value=String(values[key]||'').trim();
  if(mode==='hidden')continue;
  if(mode==='required'&&!value){add(key,`Preencha ${label.toLocaleLowerCase('pt-BR')}.`);continue;}
  if(!value)continue;
  if(typeof values[key]!=='string'){add(key,`Revise ${label.toLocaleLowerCase('pt-BR')}.`);continue;}
  if(key==='guardian_name'&&(value.length<2||value.length>150))add(key,'Informe o nome completo do responsável, com 2 a 150 caracteres.');
  if(key==='guardian_cpf'&&(!validCpf(value)||value.replace(/\D/g,'')===String(values.cpf||'').replace(/\D/g,'')))add(key,'Informe um CPF válido do responsável, diferente do CPF do atleta.');
  if(key==='guardian_relationship'&&!guardianRelationships.includes(value))add(key,'Selecione o parentesco do responsável.');
  if(key==='guardian_phone'&&!/^\d{10,15}$/.test(value.replace(/\D/g,'')))add(key,'Informe o telefone do responsável com DDD (10 a 15 dígitos).');
  if(key==='guardian_email'&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)||value.length>200))add(key,'Informe um e-mail válido do responsável.');
 }
 return issues;
}
