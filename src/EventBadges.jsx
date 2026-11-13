import React, { useEffect, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { readableError } from "./data/client.js";
import { showBadgePrint } from "./BadgePrint.jsx";
const keyOf = row => [row.school_id,row.person_id,row.role].join(":");
export default function EventBadges({events,schools,api,tenant}) {
 const [eventId,setEventId]=useState(""),[schoolId,setSchoolId]=useState(""),[role,setRole]=useState(""),[query,setQuery]=useState(""),[rows,setRows]=useState([]),[history,setHistory]=useState([]),[selected,setSelected]=useState([]),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[refresh,setRefresh]=useState(0);
 const event=events.find(e=>e.id===eventId);
 useEffect(()=>{
  let active=true;
  setRows([]);setHistory([]);setSelected([]);setError("");setMessage("");
  if(!eventId)return;
  setLoading(true);
  Promise.all([api.badgeCandidates(eventId,schoolId||null,role||null),api.badgeHistory(tenant,eventId,schoolId||null)])
   .then(([rows,history])=>{if(active){setRows(rows);setHistory(history);}})
   .catch(error=>{if(active)setError(readableError(error));})
   .finally(()=>{if(active)setLoading(false);});
  return ()=>{active=false;};
 },[api,tenant,eventId,schoolId,role,refresh]);
 const normalized=query.toLocaleLowerCase("pt-BR");
 const visible=rows.filter(r=>[r.person_name,r.school_name,r.role_label].join(" ").toLocaleLowerCase("pt-BR").includes(normalized));
 const chosen=rows.filter(r=>selected.includes(keyOf(r)));
 const available=visible.filter(r=>r.photo_id);
 const filteredHistory=history.filter(b=>!role||b.role===role);
 const selectAll=()=>setSelected(available.slice(0,50).map(keyOf));
 function openPreview() {
  const popup=window.open("","_blank","popup,width=900,height=800");
  if(!popup)throw Error("Permita abrir a prévia em outra janela para imprimir os crachás.");
  popup.opener=null;popup.document.title="Preparando crachás";popup.document.body.textContent="Preparando fotos e crachás…";
  return popup;
 }
 async function emit() {
  setError("");setMessage("");let popup;
  try {
   popup=openPreview();setBusy(true);
   const badges=await api.issueBadges(eventId,chosen.map(({person_id,school_id,role})=>({person_id,school_id,role})));
   await showBadgePrint(popup,badges,api.download);
   setHistory(await api.badgeHistory(tenant,eventId,schoolId||null));setSelected([]);
   setMessage(`${badges.length} crachá(s) emitido(s). A prévia de impressão foi aberta. Uma nova emissão preserva as versões anteriores.`);
  }catch(error){if(popup&&!popup.closed)popup.close();setError("Não foi possível preparar a impressão. "+readableError(error)+" Se a emissão já foi salva, use Reimprimir no histórico.");setHistory(await api.badgeHistory(tenant,eventId,schoolId||null).catch(()=>history));}
  finally{setBusy(false);}
 }
 async function reprint(badge) {
  setError("");let popup;
  try{popup=openPreview();setBusy(true);await showBadgePrint(popup,[badge],api.download);}
  catch(error){if(popup&&!popup.closed)popup.close();setError(readableError(error));}
  finally{setBusy(false);}
 }
 return <section className="panel event-badges">
  <h2>Crachás do evento</h2><p className="panel-desc">Atletas e comissão técnica de inscrições aprovadas e responsáveis autorizados das escolas participantes. A foto de identificação é obrigatória para emitir.</p>
  <div className="badge-filters">
   <label>Evento<select aria-label="Evento dos crachás" value={eventId} disabled={busy} onChange={e=>setEventId(e.target.value)}><option value="">Selecione o evento</option>{events.map(e=><option key={e.id} value={e.id}>{e.name} · {e.year}{e.status==='Arquivado'?' · Arquivado':''}</option>)}</select></label>
   <label>Escola<select aria-label="Escola dos crachás" value={schoolId} disabled={busy} onChange={e=>setSchoolId(e.target.value)}><option value="">Todas as escolas</option>{schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   <label>Perfil<select aria-label="Perfil dos crachás" value={role} disabled={busy} onChange={e=>setRole(e.target.value)}><option value="">Todos</option><option value="athlete">Atletas</option><option value="staff">Comissão técnica</option><option value="responsible">Responsáveis</option></select></label>
  </div>
  {error&&<p role="alert" className="school-error">{error}</p>}{message&&<p role="status" className="school-success">{message}</p>}
  {!eventId?<div className="empty">Selecione o evento para consultar os crachás disponíveis.</div>:<>
   <div className="badge-toolbar"><label>Pesquisar pessoa ou escola<input aria-label="Pesquisar crachá" type="search" value={query} onChange={e=>setQuery(e.target.value)} /></label><button type="button" className="secondary" disabled={busy||loading} onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={15}/>Atualizar lista</button></div>
   {loading?<p role="status">Consultando participantes e emissões…</p>:<>
    <div className="badge-selection-actions"><span>{chosen.length} selecionado(s) · máximo de 50 por lote</span><div className="staff-actions"><button className="secondary" disabled={busy||!available.length||event?.status==='Arquivado'} onClick={selectAll}>Selecionar com foto</button><button className="text-btn" disabled={busy||!selected.length} onClick={()=>setSelected([])}>Limpar seleção</button></div></div>
    <div className="table-scroll"><table><thead><tr><th>Selecionar</th><th>Pessoa</th><th>Escola</th><th>Perfil</th><th>Foto</th></tr></thead><tbody>{visible.map(r=><tr key={keyOf(r)}><td><input type="checkbox" aria-label={`Selecionar ${r.person_name} · ${r.role_label}`} checked={selected.includes(keyOf(r))} disabled={busy||!r.photo_id||event?.status==='Arquivado'||(!selected.includes(keyOf(r))&&selected.length>=50)} onChange={e=>setSelected(e.target.checked?[...selected,keyOf(r)]:selected.filter(k=>k!==keyOf(r)))} /></td><td><strong>{r.person_name}</strong></td><td>{r.school_name}</td><td>{r.role_label}</td><td><span className={'tag '+(r.photo_id?'live':'warning')}>{r.photo_id?'Com foto':'Completar foto'}</span></td></tr>)}{!visible.length&&<tr><td colSpan={5} className="table-empty">Nenhum participante aprovado encontrado para estes filtros.</td></tr>}</tbody></table></div>
    {rows.some(r=>!r.photo_id)&&<p className="form-note">Cadastros sem foto aparecem para conferência. Complete a foto antes de emitir o crachá.</p>}
    <div className="school-form-footer"><button className="primary" disabled={busy||loading||!chosen.length||event?.status==='Arquivado'} onClick={emit}><Printer size={16}/>{busy?'Preparando…':'Emitir e abrir impressão'}</button></div>
   </>}
   <section className="badge-history"><h3>Histórico de emissões</h3><p className="form-note">A reimpressão mantém os dados e a foto da emissão original. Até 100 emissões recentes por consulta.</p><div className="table-scroll"><table><thead><tr><th>Pessoa</th><th>Escola</th><th>Perfil</th><th>Versão</th><th>Emissão</th><th>Ação</th></tr></thead><tbody>{filteredHistory.map(b=><tr key={b.id}><td>{b.snapshot.person_name}</td><td>{b.snapshot.school_name}</td><td>{b.snapshot.role_label}</td><td>{b.version}{!b.is_current?' · anterior':''}</td><td>{new Date(b.issued_at).toLocaleString('pt-BR')}</td><td><button className="secondary" disabled={busy} onClick={()=>reprint(b)}>Reimprimir</button></td></tr>)}{!filteredHistory.length&&<tr><td colSpan={6} className="table-empty">Nenhum crachá emitido para este evento e escola.</td></tr>}</tbody></table></div></section>
  </>}
 </section>;
}
