import React from 'react';
import {correctionItems, correctionExpired} from './registrationCorrections.js';
export default function SchoolCorrections({history,event,data,onCorrect,onResend,onContinue}) {
  const r=history.r;
  const decision=[...history.decisions].filter(d=>d.to_status==='correction_requested').sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];
  const items=correctionItems(decision?.reason,r,data,event);
  const expired=correctionExpired(r.correction_deadline);
  const people=new Map(data.athletes.filter(p=>p.schoolId===r.school_id).map(p=>[p.personId,p]));
  const roster=data.allocations.filter(a=>a.registration_id===r.id&&a.active!==false).map(a=>people.get(a.person_id)).filter(Boolean);
  const isUpdated=person=>Date.parse(person.eventProfiles?.[r.event_id]?.updatedAt)>Date.parse(decision?.created_at);
  return <section className="school-corrections" aria-label="Correções solicitadas">
    <h3>O que a escola precisa corrigir</h3>
    <p>{r.correction_deadline ? `Prazo: ${new Date(r.correction_deadline).toLocaleString('pt-BR')}` : 'Confira o prazo com a Secretaria.'}</p>
    {expired && <p role="alert" className="school-error">O prazo terminou. Solicite à Secretaria a revisão do prazo antes de reenviar.</p>}
    {!items.length && <p>Não foi possível carregar a orientação. Consulte a Secretaria antes de reenviar.</p>}
    <ul className="correction-items">{items.map(item=><li key={item.id}>
      <p className="review-reason">{item.text}</p>
      {item.target && <><small>{isUpdated(item.target.athlete) ? 'Cadastro atualizado após a solicitação. Confira se atende à orientação.' : 'Revisão solicitada pela Secretaria.'}</small><button className="secondary" onClick={()=>onCorrect(item.target.athlete,item.target.documentId,item.text)}>{item.target.documentId ? 'Corrigir documento' : 'Corrigir cadastro'} · {item.target.athlete.name}</button></>}
    </li>)}</ul>
    <details><summary>Revisar atletas e anexos desta inscrição · {roster.length}</summary><p>Use esta lista quando a orientação for geral. Alterar o cadastro não reenvia a inscrição automaticamente.</p>{roster.map(person=><div className="correction-person" key={person.id}><span><strong>{person.name}</strong><small>{isUpdated(person) ? 'Cadastro atualizado após a solicitação' : 'Confira os dados e documentos'}</small></span><button className="secondary" onClick={()=>onCorrect(person,null,decision?.reason)}>Revisar cadastro</button></div>)}</details>
    <div className="staff-actions"><button className="secondary" onClick={onContinue}>Revisar elenco da inscrição</button><button className="primary" disabled={expired||!decision} onClick={onResend}>Reenviar para análise</button></div>
    <p><small>O reenvio mantém os cadastros e passa pelas validações do evento. A Secretaria fará uma nova análise.</small></p>
  </section>;
}
