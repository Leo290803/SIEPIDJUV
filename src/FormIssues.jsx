import React from 'react';
import {AlertCircle,CheckCircle2,ArrowDown} from 'lucide-react';
export default function FormIssues({issues,onGo,disabled=false,id}) {
 return <section id={id} tabIndex={-1} className={'form-issues '+(issues.length?'has-issues':'is-ready')} aria-label="Pendências do cadastro">
  <div className="form-issues-heading">{issues.length?<AlertCircle size={21} aria-hidden="true"/>:<CheckCircle2 size={21} aria-hidden="true"/>}<div><strong aria-live="polite">{issues.length?`${issues.length} ${issues.length===1?'pendência para resolver':'pendências para resolver'}`:'Cadastro pronto para concluir'}</strong><p>{issues.length?'Clique no item para ir ao campo. Os dados preenchidos permanecem no formulário.':'Os campos e anexos exigidos estão preenchidos. A conclusão ainda será conferida ao salvar.'}</p></div></div>
  {issues.length>0&&<><ul>{issues.map((issue,index)=><li key={issue.key+':'+index}><button type="button" disabled={disabled} onClick={()=>onGo(issue.key)}>{issue.message}<ArrowDown size={13} aria-hidden="true"/></button></li>)}</ul><button className="secondary" type="button" disabled={disabled} onClick={()=>onGo(issues[0].key)}>Corrigir primeira pendência</button></>}
 </section>;
}
