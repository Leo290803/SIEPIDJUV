import React,{useState} from 'react';
import {CalendarDays,Users,ClipboardList,ArrowUpRight,School,Check,X} from 'lucide-react';
import Athletes from './Athletes.jsx';
import TechnicalStaff,{readStaff} from './TechnicalStaff.jsx';
import EventTable from './EventTable.jsx';
import RegistrationDraft from './RegistrationDraft.jsx';
import {athleteEventPending} from './eventRequirements.js';
import {validateParticipation} from './participationRules.js';
export default function SchoolArea({page,school,events,onNavigate}){
 const [event,setEvent]=useState(null),[error,setError]=useState(''),[drafts,setDrafts]=useState(()=>{try{return JSON.parse(localStorage.getItem('siep-school-drafts'))||[]}catch{return []}});
 const [activeId,setActiveId]=useState(()=>{try{return localStorage.getItem('siep-active-event-'+school?.id)||''}catch{return ''}});
 const activeEvent=events.find(e=>String(e.id)===activeId&&e.status==='Inscrições abertas');
 const selectEvent=e=>{try{localStorage.setItem('siep-active-event-'+school.id,String(e.id))}catch{}setActiveId(String(e.id));setEvent(null);onNavigate('Visão geral')};
 const openEvents=events.filter(e=>e.status==='Inscrições abertas');
 let athletes=[];try{athletes=JSON.parse(localStorage.getItem('siep-athletes'))||[]}catch{}
 athletes=athletes.filter(a=>a.schoolId===school?.id&&!a.archived);
 const staff=readStaff().filter(r=>r.schoolId===school?.id&&!r.archived);
 const ownDrafts=drafts.filter(d=>d.schoolId===school?.id&&d.eventId===activeEvent?.id);
 const [editingDraft,setEditingDraft]=useState(null);
 const start=(e,draft=null)=>{setEditingDraft(draft);setEvent(e);setError('')};
 const save=draft=>{const next=[...drafts.filter(d=>d.id!==draft.id),draft];try{localStorage.setItem('siep-school-drafts',JSON.stringify(next));setDrafts(next);setEvent(null);onNavigate('Minhas inscrições');return true}catch{return false}};
 if(!school)return <div className="panel empty"><School size={36}/><h2>Nenhuma escola ativa disponível</h2><p>Na área da secretaria, cadastre ou reative uma escola para visualizar este portal.</p></div>;
 return <>
 {activeEvent&&<div className="event-context-line"><CalendarDays size={17}/><span>Evento: <strong>{activeEvent.name} · {activeEvent.year}</strong></span>{page!=='Eventos disponíveis'&&<button className="text-btn" onClick={()=>{setEvent(null);onNavigate('Eventos disponíveis')}}>Trocar evento</button>}</div>}
 {page==='Visão geral'&&activeEvent&&<section className="stats school-stats">{[[Users,'Atletas neste evento',athletes.filter(a=>a.eventProfiles?.[String(activeEvent.id)]).length,'Atletas'],[ClipboardList,'Inscrições em rascunho',ownDrafts.length,'Minhas inscrições'],[Users,'Profissionais da escola',staff.length,'Comissão técnica']].map(([Icon,label,count,target])=><button className="stat dashboard-link" onClick={()=>onNavigate(target)} key={label}><div className="stat-top"><span>{label}</span><Icon size={18}/></div><strong>{count}</strong><small>Consultar <ArrowUpRight size={13}/></small></button>)}</section>}
 {page==='Atletas'&&activeEvent&&<Athletes key={school.id+'-'+activeEvent.id} schoolId={school.id} event={activeEvent}/>}
 {(page==='Eventos disponíveis'||(!activeEvent&&['Visão geral','Atletas','Minhas inscrições'].includes(page)))&&<div className="event-picker">{!activeEvent&&<p className="picker-instruction">Escolha um evento para começar. A seleção será mantida nos cadastros e inscrições.</p>}<EventTable events={openEvents} showHeading={page!=='Eventos disponíveis'} school actionLabel="Trabalhar neste evento" onOpen={selectEvent}/></div>}
 {page==='Minhas inscrições'&&activeEvent&&<div className="panel"><div className="section-title"><span className="record-count">{ownDrafts.length} {ownDrafts.length===1?'rascunho':'rascunhos'}</span><button className="primary" onClick={()=>start(activeEvent)}>Nova inscrição neste evento</button></div>{ownDrafts.map(d=><div className="school-row" key={d.id}><ClipboardList size={20}/><div className="school-info"><h3>{d.eventName}</h3><p>{d.modality?`${d.modality} · ${d.categoryName} · ${school.name} · ${d.participation||'Participação'} · `:'Sem categoria definida · '}{d.athleteIds.length} atletas · {(d.staffIds||[]).length} profissionais</p><small>Atualizado em {new Date(d.updatedAt).toLocaleString('pt-BR')}</small></div><span className={'tag '+(validateParticipation(events.find(e=>e.id===d.eventId)||{},drafts,d,{athletes}).length?'warning':'draft')}>{validateParticipation(events.find(e=>e.id===d.eventId)||{},drafts,d,{athletes}).length?'Rascunho com pendências':'Rascunho local'}</span><button className="secondary" onClick={()=>{const e=events.find(e=>e.id===d.eventId);if(e)start(e,d)}}>Continuar</button></div>)}{!ownDrafts.length&&<div className="empty"><ClipboardList size={35}/><h3>Sua escola ainda não tem inscrições</h3><p>Cadastre os atletas e prepare uma inscrição neste evento.</p></div>}</div>}
 {page==='Comissão técnica'&&<TechnicalStaff key={school.id} schoolId={school.id}/>}
 {page==='Dados da escola'&&<div className="panel"><dl className="school-data">{[['Nome',school.name],['Município',school.city],['Código INEP',school.inep],['Endereço',school.address],['E-mail',school.email],['Telefone',school.phone]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'Não informado'}</dd></div>)}</dl><p className="local-note">Nesta prévia, os dados institucionais são mantidos pela secretaria.</p></div>}
 {page==='Notificações'&&<div className="panel"><h2>Avisos da escola</h2><div className="empty">Nenhuma notificação para esta escola. Os avisos de análise serão conectados quando o envio de inscrições estiver disponível.</div></div>}
 {event&&<RegistrationDraft event={event} school={school} athletes={athletes.filter(a=>a.eventProfiles?.[String(event.id)]?.status==='complete'&&!athleteEventPending(a,event).length)} staff={staff} draft={editingDraft} drafts={drafts} onSave={save} onClose={()=>setEvent(null)} onAthletes={()=>{setEvent(null);onNavigate('Atletas')}}/>}</>
}
