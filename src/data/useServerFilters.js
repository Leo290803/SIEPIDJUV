import {useEffect,useRef} from 'react';
// Evita uma consulta por tecla e cancela a espera quando a tela é trocada.
export function useServerFilters(remote, filters) {
 const current=useRef(remote);current.current=remote;
 const key=JSON.stringify(filters);
 useEffect(()=>{
  if(!current.current)return;
  const timer=setTimeout(()=>{
   const target=current.current;
   if(target && JSON.stringify(target.filters)!==key) target.onFilters(JSON.parse(key));
  },350);
  return ()=>clearTimeout(timer);
 },[key]);
}
