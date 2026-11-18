import {registrationStatusLabel} from './data/peopleMapping.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function notificationTitle(n) {
 if(n.kind==='staff_review')return {approved:'Profissional aprovado',correction_requested:'Correção solicitada para profissional',rejected:'Profissional indeferido'}[n.payload?.status] || 'Atualização de profissional';
 if(n.kind==='correction_deadline')return 'Prazo de correção termina em breve';
 if(n.kind==='registration_submitted')return n.payload?.resubmitted ? 'Inscrição corrigida e reenviada' : 'Nova inscrição para análise';
 return {correction_requested:'Correção solicitada pela Secretaria',approved:'Inscrição aprovada',rejected:'Inscrição indeferida',cancelled:'Inscrição cancelada',submitted:'Inscrição enviada para análise'}[n.payload?.status] || registrationStatusLabel[n.payload?.status] || 'Atualização de inscrição';
}
export function notificationPath(n,tenant,area,schoolId) {
 const p=n.payload || {};
 if(n.kind==='staff_review'){
  if(!uuid.test(tenant)||![p.person_id,p.event_id,p.school_id].every(id=>uuid.test(id||'')))return null;
  const base=area==='secretaria'?`/secretaria/${tenant}/inscricoes`:`/escola/${tenant}/escolas/${p.school_id}/inscricoes`;
  return `${base}?tipo=comissao&profissional=${p.person_id}&evento=${p.event_id}&escola=${p.school_id}`;
 }
 if(!uuid.test(tenant)||!uuid.test(p.registration_id||''))return null;
 if(area==='secretaria')return `/secretaria/${tenant}/inscricoes/${p.registration_id}/historico`;
 const school=p.school_id || schoolId;
 return uuid.test(school||'') ? `/escola/${tenant}/escolas/${school}/inscricoes/${p.registration_id}/historico` : null;
}
