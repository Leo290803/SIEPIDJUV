import {modalityGroups} from './modalityGroups.js';
export function duplicateEvent(source,{name,year,start='',end=''},createId=()=>crypto.randomUUID()) {
  if(!name?.trim()||!String(year||'').trim())throw Error('Informe o nome e a edição da cópia.');
  if(end&&(!start||end<start))throw Error('Informe o início e um fim de inscrições igual ou posterior ao início.');
  const groups=modalityGroups(source),modalityIds=new Map(),categoryIds=new Map(),proofIds=new Map(),documentIds=new Map();
  const remap=(map,id)=>{if(!map.has(id))map.set(id,createId());return map.get(id)};
  const copy={id:createId(),name:name.trim(),year:String(year).trim(),type:source.type||'Outro evento',status:'Rascunho',date:start?`${start} — ${end||'a definir'}`:'Datas a definir',schools:0,count:0};
  // Only configuration is copied. Registrations, athlete profiles and uploaded files live elsewhere.
  for(const key of ['description','location','color','icon','fields','staffFunctions'])if(source[key]!==undefined)copy[key]=structuredClone(source[key]);
  copy.modalities=groups.map(g=>({id:remap(modalityIds,g.id),name:g.name,classification:g.classification}));
  copy.categories=groups.flatMap(g=>g.categories.map(category=>({...structuredClone(category),id:remap(categoryIds,category.id),modalityId:remap(modalityIds,g.id),modality:g.name,classification:g.classification,proofs:(category.proofs||[]).map(proof=>({...structuredClone(proof),id:remap(proofIds,proof.id)}))})));
  copy.validationRules=(source.validationRules||[]).map(rule=>{const copied={...structuredClone(rule),id:createId()};if(rule.categoryId)copied.categoryId=remap(categoryIds,rule.categoryId);if(rule.proofId)copied.proofId=remap(proofIds,rule.proofId);return copied});
  if(source.requirements)copy.requirements={...structuredClone(source.requirements),documents:(source.requirements.documents||[]).map(document=>({...structuredClone(document),id:remap(documentIds,document.id)}))};
  return copy;
}
