import React,{useState} from 'react';
import {CalendarDays,Users,ClipboardList,ArrowUpRight,School,Check,X} from 'lucide-react';
import Athletes from './Athletes.jsx';
import TechnicalStaff,{readStaff} from './TechnicalStaff.jsx';
import EventTable from './EventTable.jsx';
import RegistrationDraft from './RegistrationDraft.jsx';
import {validateParticipation} from './participationRules.js';
export default function SchoolArea({page,school,events,onNavigate}){
 const [event,setEvent]=useState(null),[error,setError]=useState(''),[drafts,setDrafts]=useState(()=>{try{return JSON.parse(localStorage.getItem('siep-school-drafts'))||[]}catch{return []}});
 const openEvents=events.filter(e=>e.status==='Inscrições abertas');
 let athletes=[];try{athletes=JSON.parse(localStorage.getItem('siep-athletes'))||[]}catch{}
 athletes=athletes.filter(a=>a.schoolId===school?.id&&!a.archived);
 const staff=readStaff().filter(r=>r.schoolId===school?.id&&!r.archived);
 const ownDrafts=drafts.filter(d=>d.schoolId===school?.id);
 const [editingDraft,setEditingDraft]=useState(null);
 const start=(e,draft=null)=>{setEditingDraft(draft);setEvent(e);setError('')};
 const save=draft=>{const next=[...drafts.filter(d=>d.id!==draft.id),draft];try{localStorage.setItem('siep-school-drafts',JSON.stringify(next));setDrafts(next);setEvent(null);onNavigate('Minhas inscrições');return true}catch{return false}};
 if(!school)return <div className="panel empty"><School size={36}/><h2>Nenhuma escola ativa disponível</h2><p>Na área da secretaria, cadastre ou reative uma escola para visualizar este portal.</p></div>;
 return <><div className="area-context"><School size={19}/><div><strong>{school.name}</strong><small>{school.city} · Área da escola</small></div><span className="tag live">Visualização de demonstração</span></div>
 {page==='Visão geral'&&<><section className="stats school-stats">{[[CalendarDays,'Eventos disponíveis',openEvents.length],[Users,'Atletas da escola',athletes.length],[ClipboardList,'Inscrições em rascunho',ownDrafts.length]].map(([Icon,label,count])=><div className="stat" key={label}><div className="stat-top"><span>{label}</span><span className="stat-icon green"><Icon size={18}/></span></div><strong>{count}</strong><small>Dados desta escola no navegador</small></div>)}</section></>}
 {page==='Atletas'&&<Athletes key={school.id} schoolId={school.id}/>}
 {['Visão geral','Eventos disponíveis'].includes(page)&&<EventTable events={openEvents} school onOpen={e=>start(e)}/>}
 {page==='Minhas inscrições'&&<div className="panel"><div className="section-title"><h2>Inscrições da escola</h2><button className="primary" onClick={()=>onNavigate('Eventos disponíveis')}>Escolher evento</button></div><p className="local-note">Rascunhos locais para visualizar o fluxo. Ainda não são enviados para análise da secretaria.</p>{ownDrafts.map(d=><div className="school-row" key={d.id}><ClipboardList size={20}/><div className="school-info"><h3>{d.eventName}</h3><p>{d.modality?`${d.modality} · ${d.categoryName} · ${school.name} · ${d.participation||'Participação'} · `:'Sem categoria definida · '}{d.athleteIds.length} atletas · {(d.staffIds||[]).length} profissionais</p><small>Atualizado em {new Date(d.updatedAt).toLocaleString('pt-BR')}</small></div><span className={'tag '+(validateParticipation(events.find(e=>e.id===d.eventId)||{},drafts,d).length?'warning':'draft')}>{validateParticipation(events.find(e=>e.id===d.eventId)||{},drafts,d).length?'Rascunho com pendências':'Rascunho local'}</span><button className="secondary" onClick={()=>{const e=events.find(e=>e.id===d.eventId);if(e)start(e,d)}}>Continuar</button></div>)}{!ownDrafts.length&&<div className="empty"><ClipboardList size={35}/><h3>Sua escola ainda não tem inscrições</h3><p>Escolha um evento para preparar o primeiro rascunho.</p></div>}</div>}
 {page==='Comissão técnica'&&<TechnicalStaff key={school.id} schoolId={school.id}/>}
 {page==='Dados da escola'&&<div className="panel"><h2>Dados da escola</h2><dl className="school-data">{[['Nome',school.name],['Município',school.city],['Código INEP',school.inep],['Endereço',school.address],['E-mail',school.email],['Telefone',school.phone]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'Não informado'}</dd></div>)}</dl><p className="local-note">Nesta prévia, os dados institucionais são mantidos pela secretaria.</p></div>}
 {page==='Notificações'&&<div className="panel"><h2>Avisos da escola</h2><div className="empty">Nenhuma notificação para esta escola. Os avisos de análise serão conectados quando o envio de inscrições estiver disponível.</div></div>}
 {event&&<RegistrationDraft event={event} school={school} athletes={athletes} staff={staff} draft={editingDraft} drafts={drafts} onSave={save} onClose={()=>setEvent(null)} onAthletes={()=>{setEvent(null);onNavigate('Atletas')}}/>}</>
}
