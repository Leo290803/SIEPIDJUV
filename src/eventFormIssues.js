import {validCpf,todayDate} from './personData.js';
import {baseDataFields,requirementsFor} from './eventRequirements.js';
import {guardianIssues,validIsoDate} from './guardianRequirements.js';
import {categoryAcceptsBirth} from './categoryEligibility.js';
export function eventFormIssues({event,values,categoryIds,files={},removed=[],profile={},fileErrors={},sportIssues=[]}) {
 const result=[],requirement=requirementsFor(event);
 const add=(key,message,blockingDraft=false)=>result.push({key,message,blockingDraft});
 if(!String(values.name||'').trim())add('name','Informe o nome completo do atleta.',true);
 if(!values.cpf)add('cpf','Informe o CPF do atleta.',true);
 else if(!validCpf(values.cpf))add('cpf','Informe um CPF válido para o atleta.',true);
 if(!values.birth)add('birth','Informe a data de nascimento.',true);
 else if(!validIsoDate(values.birth)||values.birth<'1900-01-01'||values.birth>todayDate())add('birth','Informe uma data de nascimento válida, entre 1900 e hoje.',true);
 if(!['Masculino','Feminino'].includes(values.gender))add('gender','Selecione o sexo do atleta.',true);
 for(const [key,label] of baseDataFields.filter(([key])=>!['cpf','birth','gender'].includes(key))){
  if(requirement.data[key]==='required'&&!String(values[key]||'').trim())add(key,`Preencha ${label.toLocaleLowerCase('pt-BR')}.`);
  else if(key==='email'&&requirement.data[key]!=='hidden'&&values[key]&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[key]))add(key,'Informe um e-mail válido para o atleta.',true);
 }
 const categories=(event.categories||[]).filter(c=>c.enabled!==false);
 if(!categoryIds.some(id=>categories.some(c=>c.id===id)))add('categories',categories.length?'Selecione uma modalidade e categoria.':'A Secretaria precisa configurar categorias para este evento. Você pode salvar um rascunho.');
 else if(categoryIds.some(id=>{const c=categories.find(c=>c.id===id);return !c||!categoryAcceptsBirth(c,values.birth)||c.gender&&c.gender!==values.gender;}))add('categories','Revise as categorias indisponíveis ou incompatíveis com nascimento e sexo.');
 for(const issue of guardianIssues(values,event))add(issue.key,issue.message);
 for(const doc of requirement.documents.filter(d=>!d.categoryId||categoryIds.includes(d.categoryId))){
  if(fileErrors[doc.id])add('document:'+doc.id,fileErrors[doc.id]);
  else if(doc.required&&!files[doc.id]&&(!profile.documents?.[doc.id]||removed.includes(doc.id)))add('document:'+doc.id,`Anexe ${doc.name}.`);
 }
 for(const message of sportIssues)add('categories',message);
 return result;
}
