import {classification,modalityKey} from './participationRules.js';
export function modalityGroups(event) {
  const groups=(event.modalities||[]).map(m=>({...m,categories:[]}));
  for(const category of event.categories||[]) {
    let group=groups.find(g=>g.id===category.modalityId)||groups.find(g=>modalityKey(g.name)===modalityKey(category.modality));
    if(!group){group={id:`legacy:${modalityKey(category.modality)}`,name:category.modality,classification:classification(category),categories:[]};groups.push(group);}
    group.categories.push(category);
  }
  return groups;
}
