import React,{useState} from 'react';
import {baseDataFields,requirementsFor} from './eventRequirements.js';
import {guardianFields,validateGuardianPolicy} from './guardianRequirements.js';
export default function EventRequirements({event,onSave,connected=false}) {
 const initial=requirementsFor(event);
 const [data,setData]=useState(initial.data),[documents,setDocuments]=useState(initial.documents),[guardian,setGuardian]=useState(initial.guardian),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 async function save(e) {
  e.preventDefault();if(saving)return;
  if(documents.some(d=>!d.name.trim())){setError('Informe o nome de cada documento.');return;}
  if(new Set(documents.map(d=>d.name.trim().toLowerCase())).size!==documents.length){setError('Não repita o nome do documento.');return;}
  const guardianError=validateGuardianPolicy(guardian);
  if(guardianError){setError(guardianError);return;}
  setSaving(true);setError('');
  try {if(!await onSave({...event,requirements:{data,guardian,documents:documents.map(d=>({...d,name:d.name.trim()}))}}))setError('Não foi possível salvar.');}
  catch(error){setError(error.message||'Não foi possível salvar.');}
  finally{setSaving(false);}
 }
 const choices=(label,value,onChange)=><select aria-label={label} value={value||'hidden'} onChange={e=>onChange(e.target.value)}><option value="hidden">Não solicitar</option><option value="optional">Opcional</option><option value="required">Obrigatório</option></select>;
 return <form onSubmit={save}><fieldset className="form-fields" disabled={saving}>
  <h3>Cadastro do atleta neste evento</h3><p className="form-note">A escola escolhe o evento uma vez. O formulário usa automaticamente estas exigências. Nome completo, nascimento, CPF e sexo são obrigatórios. Os demais dados e anexos são definidos aqui.</p>
  <div className="table-scroll"><table><thead><tr><th>Dado do atleta</th><th>Exigência</th></tr></thead><tbody>{[['name','Nome completo'],...baseDataFields].map(([key,label])=><tr key={key}><td>{label}</td><td>{['name','cpf','birth','gender'].includes(key)?<span className="tag live">Obrigatório em todos os cadastros</span>:choices(`Exigência de ${label}`,data[key],value=>setData({...data,[key]:value}))}</td></tr>)}</tbody></table></div>
  <section className="guardian-settings" aria-labelledby="guardian-settings-title"><h3 id="guardian-settings-title">Responsável legal do atleta</h3><p className="form-note">Pai, mãe ou tutor. Os dados pertencem ao cadastro do atleta neste evento e não criam uma conta de acesso.</p>
   <label className="checkbox"><input type="checkbox" checked={guardian.enabled} onChange={e=>setGuardian({...guardian,enabled:e.target.checked})}/>Solicitar dados do responsável somente para menores de 18 anos</label>
   {guardian.enabled&&<><label className="guardian-reference">Data de início do evento *<input type="date" min="1900-01-01" max="9999-12-31" aria-label="Data de início do evento para calcular a idade" required value={guardian.referenceDate||''} onChange={e=>setGuardian({...guardian,referenceDate:e.target.value})}/><small>A idade será calculada nesta data, e não no início das inscrições. Quem completar 18 anos até esse dia não preenche os dados do responsável.</small></label>
   <div className="table-scroll"><table><thead><tr><th>Dado do responsável legal</th><th>Exigência para menores</th></tr></thead><tbody>{guardianFields.map(([key,label])=><tr key={key}><td>{label}</td><td>{choices(`Exigência de ${label}`,guardian.fields[key],value=>setGuardian({...guardian,fields:{...guardian.fields,[key]:value}}))}</td></tr>)}</tbody></table></div></>}
  </section>
  <h3>Documentos solicitados</h3><p className="form-note">Somente os documentos desta lista aparecem no formulário. Um anexo é solicitado uma vez por atleta nesta edição, mesmo com várias modalidades. {connected?'Arquivos de até 5 MB:':'Arquivos locais de até 5 MB:'} PDF, PNG ou JPEG; foto aceita PNG ou JPEG.</p>
  {documents.map((d,i)=><div className="proof-editor" key={d.id}><label>Nome do documento<input aria-label={`Documento ${i+1}`} value={d.name} maxLength={100} required onChange={e=>setDocuments(documents.map(row=>row.id===d.id?{...row,name:e.target.value}:row))}/></label><label>Exigência<select aria-label={`Exigência do documento ${i+1}`} value={d.required?'required':'optional'} onChange={e=>setDocuments(documents.map(row=>row.id===d.id?{...row,required:e.target.value==='required'}:row))}><option value="required">Obrigatório</option><option value="optional">Opcional</option></select></label><label className="checkbox"><input type="checkbox" checked={!!d.imageOnly} onChange={e=>setDocuments(documents.map(row=>row.id===d.id?{...row,imageOnly:e.target.checked}:row))}/>Somente imagem</label><button className="secondary" type="button" onClick={()=>setDocuments(documents.filter(row=>row.id!==d.id))}>Não solicitar</button></div>)}
  {!documents.length&&<p className="info-box">Nenhum anexo será solicitado neste evento.</p>}
  <button type="button" className="secondary" onClick={()=>setDocuments([...documents,{id:crypto.randomUUID(),name:'',required:true,imageOnly:false}])}>Adicionar documento</button>
  <p className="local-note">Alterações não apagam arquivos antigos nem os dados já informados. Novas exigências serão verificadas ao revisar o cadastro e ao enviar ou aprovar inscrições.</p>
  {error&&<p className="school-error" role="alert">{error}</p>}<div className="school-form-footer"><button className="primary" type="submit">{saving?'Salvando…':'Salvar formulário e documentos'}</button></div>
 </fieldset></form>;
}
