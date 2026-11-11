import {categoryAcceptsBirth} from './categoryEligibility.js';
export const baseDataFields=[['cpf','CPF'],['birth','Data de nascimento'],['gender','Sexo/gênero'],['email','E-mail'],['phone','Telefone'],['address','Endereço']];
export function requirementsFor(event){
 if(event.requirements)return event.requirements;
 const fields=event.fields||['Nome completo','CPF','Data de nascimento'];
 return {data:{cpf:fields.includes('CPF')?'required':'optional',birth:fields.includes('Data de nascimento')?'required':'optional',gender:'optional',email:'hidden',phone:'hidden',address:'hidden'},documents:['Foto','Comprovante de matrícula','Autorização do responsável'].filter(name=>fields.includes(name)).map(name=>({id:name,name,required:true,imageOnly:name==='Foto'}))};
}
export function athleteEventPending(athlete,event){
 const profile=athlete.eventProfiles?.[String(event.id)];if(!profile)return ['Cadastro no evento'];
 const requirement=requirementsFor(event),pending=[];
 if(!athlete.name?.trim())pending.push('Nome completo');
 for(const [key,label] of baseDataFields)if(requirement.data[key]==='required'&&!athlete[key])pending.push(label);
 if(!(profile.categoryIds||[]).some(id=>(event.categories||[]).some(c=>c.id===id&&c.enabled!==false)))pending.push('Modalidade e categoria');
 for(const id of profile.categoryIds||[]){const category=(event.categories||[]).find(c=>c.id===id);if(category&&!categoryAcceptsBirth(category,athlete.birth))pending.push(`Ano de nascimento incompatível com ${category.modality} / ${category.name}`);}
 for(const doc of requirement.documents)if(doc.required&&!profile.documents?.[doc.id])pending.push(doc.name);
 return pending;
}
