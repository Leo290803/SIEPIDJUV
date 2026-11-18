import React,{useEffect,useRef,useState} from 'react';
import {Bell,X} from 'lucide-react';
import {notificationTitle,notificationPath} from './notificationModel.js';
export default function NotificationBell({api,tenant,area,schoolId,path,navigate,onViewAll,version}) {
 const [open,setOpen]=useState(false),[feed,setFeed]=useState({unread:0,rows:[]}),[error,setError]=useState(''),[loading,setLoading]=useState(false),[opening,setOpening]=useState('');
 const root=useRef(null),button=useRef(null),currentPath=useRef(path),reload=useRef(()=>{});currentPath.current=path;
 useEffect(()=>{setFeed({unread:0,rows:[]});setOpen(false);setError('');},[tenant,path]);
 useEffect(()=>{
  let active=true,controller=null,inFlight=false;
  async function load(){
   if(inFlight||document.visibilityState==='hidden')return;
   inFlight=true;controller=new AbortController();if(active)setLoading(true);
   try {const result=await api.notifications(tenant,controller.signal);if(active){if(!result || !Array.isArray(result.rows))throw Error("Resposta inválida");setFeed(result);setError('');}}
   catch {if(active)setError('Não foi possível atualizar os avisos. Tente novamente.');}
   finally {inFlight=false;if(active)setLoading(false);}
  }
  reload.current=load;load();const interval=setInterval(load,60000);window.addEventListener('focus',load);document.addEventListener('visibilitychange',load);
  return ()=>{active=false;controller?.abort();clearInterval(interval);window.removeEventListener('focus',load);document.removeEventListener('visibilitychange',load);};
 },[api,tenant,path,version]);
 useEffect(()=>{if(!open)return;const close=e=>{if(e.key==='Escape'){setOpen(false);button.current?.focus();}else if(e.type==='pointerdown'&&!root.current?.contains(e.target))setOpen(false);};document.addEventListener('keydown',close);document.addEventListener('pointerdown',close);return()=>{document.removeEventListener('keydown',close);document.removeEventListener('pointerdown',close);};},[open]);
 async function read(n,go=false){
  const requestedPath=path;setOpening(n.id);setError('');
  try {if(!n.read_at)await api.markRead(n.id);if(currentPath.current!==requestedPath)return;setFeed(current=>({...current,unread:Math.max(0,current.unread-(n.read_at?0:1)),rows:current.rows.map(row=>row.id===n.id?{...row,read_at:new Date().toISOString()}:row)}));if(go){setOpen(false);navigate(notificationPath(n,tenant,area,schoolId));}}
  catch {setError('Não foi possível abrir ou marcar o aviso. Tente novamente.');}
  finally {setOpening('');}
 }
 return <div className="notification-center" ref={root}>
  <button ref={button} className="header-notifications" aria-label="Notificações" aria-expanded={open} aria-controls="notification-popover" title={feed.unread ? `${feed.unread} avisos não lidos` : 'Notificações'} onClick={()=>{if(!open)reload.current();setOpen(!open);}}><Bell size={20} aria-hidden="true"/>{feed.unread>0&&<span className="header-notification-count" aria-label={`${feed.unread} não lidas`}>{feed.unread>99?'99+':feed.unread}</span>}</button>
  {open&&<section id="notification-popover" className="notification-popover" aria-label="Avisos recentes"><header><h2>Notificações</h2><button className="text-btn" aria-label="Fechar notificações" onClick={()=>{setOpen(false);button.current?.focus();}}><X size={18}/></button></header>
   {loading&&<p role="status">Atualizando avisos…</p>}{error&&<p role="alert" className="school-error">{error} <button className="secondary" onClick={()=>reload.current()}>Tentar novamente</button></p>}
   {!loading&&!error&&!feed.rows.length&&<p>Nenhuma notificação recebida.</p>}
   <div className="notification-recent-list">{feed.rows.map(n=><article className={'notification-item'+(!n.read_at?' unread':'')} key={n.id}><strong>{notificationTitle(n)}</strong>{n.payload?.event_name&&<p>{n.payload.event_name} · {n.payload.school_name}</p>}<small>{new Date(n.created_at).toLocaleString('pt-BR')}{n.payload?.deadline&&['correction_requested'].includes(n.payload.status)&&` · Prazo: ${new Date(n.payload.deadline).toLocaleString('pt-BR')}`}</small><div className="staff-actions">{notificationPath(n,tenant,area,schoolId)&&<button disabled={!!opening} className="secondary" onClick={()=>read(n,true)}>Abrir inscrição</button>}{!n.read_at&&<button disabled={!!opening} className="text-btn" onClick={()=>read(n)}>Marcar como lida</button>}{n.read_at&&<small>Lida</small>}</div></article>)}</div>
   <footer><button className="secondary" onClick={()=>{setOpen(false);onViewAll();}}>Ver todas as notificações</button></footer>
  </section>}
 </div>;
}
