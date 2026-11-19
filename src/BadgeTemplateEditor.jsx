import React,{useEffect,useRef,useState} from 'react';
import {X,UserRound,ImagePlus} from 'lucide-react';
import {badgeFields,badgeRoles,allowedFields,requiredFields,defaultBadgeLayout,validateBadgeLayout,sampleBadgeData,customBadgeCss,newBadgeField,credentialTheme} from './badgeTemplates.js';
import {createBadgeGuidePdf,createBadgeGuidePng,downloadBadgeFile} from './badgeGuide.js';
import {BadgeArtwork,badgeArtworkCss} from './BadgeArtwork.jsx';
import BadgeQr,{sampleBadgeId} from './BadgeQr.jsx';
import {readableError} from './data/client.js';
const emptyArtwork={front:{background:null,file:null},reverse:{background:null,file:null}};

function useArtPreview(api,{file,background},setError) {
 const [preview,setPreview]=useState('');
 useEffect(()=>{
  let active=true,url;
  setPreview('');
  const show=blob=>{
   if(active){url=URL.createObjectURL(blob);setPreview(url);}
  };
  if(file)show(file);
  else if(background)api.download(background).then(show).catch(()=>{
   if(active)setError('Não foi possível carregar a arte salva. Recarregue o modelo.');
  });
  return ()=>{active=false;if(url)URL.revokeObjectURL(url);};
 },[api,file,background,setError]);
 return preview;
}

export default function BadgeTemplateEditor({api,event,tenant,institutionWide=false,initialRole='athlete',onClose}) {
 const [role,setRole]=useState(initialRole||'athlete'),[layout,setLayout]=useState(()=>defaultBadgeLayout(initialRole||'athlete')),[version,setVersion]=useState(0),[selected,setSelected]=useState('person_name'),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[unavailable,setUnavailable]=useState(false),[imageInvalid,setImageInvalid]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[reload,setReload]=useState(0);
 const [inherited,setInherited]=useState(false);
 const [artwork,setArtwork]=useState(emptyArtwork),[face,setFace]=useState('front');
 const input=useRef(null),drag=useRef(null),uploaded=useRef({});
 const preview=useArtPreview(api,artwork.front,setError);
 const reversePreview=useArtPreview(api,artwork.reverse,setError);
 const reverse=face==='reverse';
 const activeArt=artwork[face];
 const artLabel=reverse?'Arte do verso':'Arte do crachá';
 useEffect(()=>{
  let active=true;
  const controller=new AbortController();
  setLoading(true);setUnavailable(false);setImageInvalid(false);setError('');setMessage('');
  setArtwork(emptyArtwork);setFace('front');uploaded.current={};
  async function loadModel(){
   if(institutionWide)return {template:await api.defaultBadgeTemplate(tenant,role,controller.signal),inherited:false};
   const template=await api.badgeTemplate(event.id,role,controller.signal);
   if(template||controller.signal.aborted)return {template,inherited:false};
   return {template:await api.defaultBadgeTemplate(tenant,role,controller.signal),inherited:true};
  }
  loadModel().then(({template,inherited})=>{
   if(active){
    setLayout(template?.layout||defaultBadgeLayout(role));
    setVersion(inherited?0:template?.version||0);
    setInherited(inherited);
    setArtwork({
     front:{background:template?.background||null,file:null},
     reverse:{background:template?.reverse_background||null,file:null}
    });
    setSelected('person_name');
   }
  }).catch(e=>{
   if(!active)return;
   setUnavailable(true);
   if(['PGRST202','42883'].includes(e.code)){
    setLayout(defaultBadgeLayout(role));setVersion(0);
    setError('A gravação de modelos ainda não está disponível neste ambiente. Os gabaritos já podem ser baixados.');
   }else setError(readableError(e));
  }).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;controller.abort();};
 },[api,event.id,tenant,institutionWide,role,reload]);
 const credential=layout.theme===credentialTheme;
 const invalid=validateBadgeLayout(role,layout),current=layout.fields.find(f=>f.key===selected),required=requiredFields(role),samples=sampleBadgeData(role);
 function edit(key,value){setLayout(l=>({...l,fields:l.fields.map(f=>f.key===selected?{...f,[key]:value}:f)}));setMessage('');}
 function selectFace(next){
  setFace(next);
  if(imageInvalid){setImageInvalid(false);setError('');}
 }
 function changeArtwork(next){
  setArtwork(art=>({...art,[face]:next}));
  delete uploaded.current[face];
  setImageInvalid(false);setError('');setMessage('');
 }
 async function choose(e){
  const image=e.target.files?.[0];e.target.value='';
  if(!image)return;
  setError('');
  if(!['image/png','image/jpeg'].includes(image.type)||image.size>5242880||!image.size){
   setImageInvalid(true);setError('Escolha arte PNG ou JPEG de até 5 MB.');return;
  }
  setBusy(true);
  try{
   const bitmap=await createImageBitmap(image);
   const large=bitmap.width*bitmap.height>40000000;bitmap.close();
   if(large)throw Error('Imagem muito grande: use até 40 milhões de pixels.');
   changeArtwork({...activeArt,file:image});
  }catch(e){
   setImageInvalid(true);setError(e.message||'Não foi possível ler a arte.');
  }finally{setBusy(false);}
 }
 async function guide(format){
  setBusy(true);setError('');
  try{
   const guideLayout=reverse?{...layout,fields:[]}:layout;
   const blob=await(format==='pdf'?createBadgeGuidePdf(role,guideLayout):createBadgeGuidePng(role,guideLayout));
   downloadBadgeFile(blob,`gabarito-siep-${role}${reverse?'-verso':''}-86x130mm.${format}`);
  }catch(e){setError(readableError(e));}finally{setBusy(false);}
 }
 async function save(){
  if(invalid)return;
  setBusy(true);setError('');setMessage('');
  try{
   const assets={};
   for(const side of ['front','reverse']){
    const {file,background}=artwork[side];
    assets[side]=background?.id||null;
    if(!file)continue;
    if(!uploaded.current[side]){
     const metadata=institutionWide
      ?await api.prepareDefaultBadgeArt(tenant,file)
      :await api.prepareBadgeArt(event.id,file);
     await api.uploadBadgeArt(metadata,file);
     uploaded.current[side]=metadata;
    }
    assets[side]=uploaded.current[side].id;
   }
   const result=institutionWide
    ?await api.saveDefaultBadgeTemplate(tenant,role,version,layout,assets.front,assets.reverse)
    :await api.saveBadgeTemplate(event.id,role,version,layout,assets.front,assets.reverse);
   setVersion(result.version);setInherited(false);
   setArtwork({front:{background:result.background,file:null},reverse:{background:result.reverse_background,file:null}});
   uploaded.current={};
   setMessage(institutionWide?'Modelo padrão salvo. Será usado nos eventos sem modelo próprio.':'Modelo salvo. Será usado nas próximas emissões deste perfil.');
  }catch(e){setError(readableError(e));}finally{setBusy(false);}
 }
 return <div className="modal-backdrop"><div className="modal badge-template-editor" role="dialog" aria-modal="true" aria-label="Configurar arte do crachá"><style>{customBadgeCss+badgeArtworkCss}</style><button className="close" aria-label="Fechar configuração do crachá" disabled={busy} onClick={onClose}><X/></button><h2>{institutionWide?'Modelo padrão da instituição':'Arte e campos do crachá'}</h2><p>{institutionWide?'Todos os eventos sem modelo próprio':event.name} · 86 × 130 mm · {inherited?'Modelo padrão':`Versão ${version||'inicial'}`}</p><p>Envie a arte de fundo e arraste os campos até os espaços reservados. Cada perfil tem seu próprio modelo.</p>
 <div className="badge-template-toolbar"><label>Perfil do modelo<select aria-label="Perfil do modelo" value={role} disabled={busy} onChange={e=>setRole(e.target.value)}>{Object.entries(badgeRoles).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><button className="secondary" disabled={busy||loading||(!reverse&&!!invalid)} onClick={()=>guide('pdf')}>Baixar gabarito PDF</button><button className="secondary" disabled={busy||loading||(!reverse&&!!invalid)} onClick={()=>guide('png')}>Baixar imagem-guia PNG</button></div>
 <p className="form-note">Gabarito em tamanho real: 86 × 130 mm, margem de segurança de 3 mm. PNG: 1016 × 1535 pixels para arte nessa medida. Use como camada de referência no Canva e oculte as marcações antes de exportar a arte final em PNG/JPEG.</p>
 {loading?<p role="status">Carregando modelo…</p>:<>{credential&&<div className="badge-face-controls" role="group" aria-label="Face do crachá">
 <button type="button" className={reverse?'secondary':'primary'} aria-pressed={!reverse} disabled={busy} onClick={()=>selectFace('front')}>Frente</button>
 <button type="button" className={reverse?'primary':'secondary'} aria-pressed={reverse} disabled={busy} onClick={()=>selectFace('reverse')}>Verso</button>
 </div>}<div className="badge-designer-grid">
 <section className="badge-design-preview"><h3>Arte do crachá</h3><div className={'badge-face-preview'+(credential?' badge-face-pair':'')}><div className="event-badge art-badge badge-source-art">
 {preview?<img className="badge-art-background" src={preview} style={{objectFit:layout.fit}} alt="Arte de fundo do modelo"/>:credential?<BadgeArtwork/>:<span><ImagePlus size={28}/>Sem arte enviada</span>}
 </div>{credential&&<BadgeArtwork reverse eventName={event.name} edition={event.edition||event.year} background={reversePreview}/>}</div><div className="badge-art-actions">
 <input ref={input} className="badge-file-input" type="file" aria-label={artLabel} accept="image/png,image/jpeg" onChange={choose} disabled={busy}/>
 <button type="button" className="secondary" disabled={busy} onClick={()=>input.current?.click()}>{reverse?(reversePreview?'Alterar arte do verso':'Enviar arte do verso'):(preview?'Alterar arte':'Enviar arte')}</button>
 {(activeArt.background||activeArt.file)&&<button type="button" className="text-btn" disabled={busy} onClick={()=>changeArtwork(emptyArtwork[face])}>{reverse?'Restaurar verso padrão':'Remover arte'}</button>}
 </div></section>
 <section className="badge-design-preview"><h3>Prévia preenchida</h3><div className={'badge-face-preview'+(credential?' badge-face-pair':'')}><div className={'event-badge art-badge'+(credential?' badge-credential':'')} aria-label="Prévia do modelo de crachá">{preview&&<img className="badge-art-background" src={preview} style={{objectFit:layout.fit}} alt=""/>}{credential&&!preview&&<BadgeArtwork/>}{layout.fields.map(f=><button type="button" key={f.key} data-field={f.key} className={'badge-art-field designer-field'+(selected===f.key?' selected':'')} aria-label={`Posicionar ${badgeFields[f.key]}`} style={{left:f.x+'%',top:f.y+'%',width:f.w+'%',height:f.h+'%',fontSize:`${f.fontSize*100/(86*72/25.4)}cqw`,color:f.color,textAlign:f.align}} disabled={reverse} onClick={()=>setSelected(f.key)} onPointerDown={e=>{if(busy||reverse)return;const box=e.currentTarget.parentElement.getBoundingClientRect();drag.current={key:f.key,x:e.clientX,y:e.clientY,startX:f.x,startY:f.y,w:box.width,h:box.height};setSelected(f.key);e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();}} onPointerMove={e=>{const d=drag.current;if(!d||d.key!==f.key)return;const x=Math.round(Math.max(0,Math.min(100-f.w,d.startX+(e.clientX-d.x)/d.w*100))*100)/100,y=Math.round(Math.max(0,Math.min(100-f.h,d.startY+(e.clientY-d.y)/d.h*100))*100)/100;setLayout(l=>({...l,fields:l.fields.map(field=>field.key===f.key?{...field,x,y}:field)}));}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>{f.key==='photo'?<UserRound className="badge-sample-photo"/>:f.key==='qr_code'?<BadgeQr badgeId={sampleBadgeId}/>:<span>{f.key==='event_name'?event.name:samples[f.key]}</span>}</button>)}</div>{credential&&<BadgeArtwork reverse eventName={event.name} edition={event.edition||event.year} background={reversePreview}/>}</div><small>{reverse?'Envie a arte completa do verso em PNG ou JPEG, até 5 MB, na proporção 86 × 130 mm.':'Arraste os campos na prévia. Os dados são ilustrativos.'}</small></section></div>
 {!reverse&&<fieldset className="form-fields badge-design-settings" disabled={busy}><legend>Ajustes do modelo</legend>{!credential&&<button type="button" className="secondary" onClick={()=>{setLayout(defaultBadgeLayout(role));setSelected('person_name');setMessage('');}}>Usar modelo frente e verso</button>}<label>Ajuste da arte<select aria-label="Ajuste da arte" value={layout.fit} onChange={e=>setLayout({...layout,fit:e.target.value})}><option value="contain">Mostrar arte inteira</option><option value="cover">Preencher o crachá</option></select></label>
 <label>Campo selecionado<select aria-label="Campo do crachá" value={selected} onChange={e=>setSelected(e.target.value)}>{layout.fields.map(f=><option key={f.key} value={f.key}>{badgeFields[f.key]}{required.includes(f.key)?' · obrigatório':''}</option>)}</select></label>
 {current&&<><div className="badge-coordinate-grid">{[['x','Esquerda (mm)',.86],['y','Topo (mm)',1.3],['w','Largura (mm)',.86],['h','Altura (mm)',1.3]].map(([key,label,scale])=><label key={key}>{label}<input aria-label={label} type="number" step="0.1" value={Number((current[key]*scale).toFixed(1))} onChange={e=>edit(key,Math.round(Number(e.target.value)/scale*100)/100)}/></label>)}</div>{!['photo','qr_code'].includes(current.key)&&<><label>Tamanho da fonte (pt)<input aria-label="Tamanho da fonte" type="number" min="6" max="28" value={current.fontSize} onChange={e=>edit('fontSize',Number(e.target.value))}/></label><label>Cor do texto<input aria-label="Cor do texto" type="color" value={current.color} onChange={e=>edit('color',e.target.value)}/></label><label>Alinhamento<select aria-label="Alinhamento do campo" value={current.align} onChange={e=>edit('align',e.target.value)}><option value="left">Esquerda</option><option value="center">Centralizado</option><option value="right">Direita</option></select></label></>}{!required.includes(current.key)&&<button type="button" className="secondary" onClick={()=>{setLayout({...layout,fields:layout.fields.filter(f=>f.key!==selected)});setSelected('person_name');}}>Remover campo</button>}</>}
 <label>Adicionar campo<select aria-label="Adicionar campo ao crachá" value="" onChange={e=>{const key=e.target.value;if(!key)return;setLayout({...layout,fields:[...layout.fields,newBadgeField(key)]});setSelected(key);}}><option value="">Selecione o campo</option>{allowedFields(role).filter(key=>!layout.fields.some(f=>f.key===key)).map(key=><option key={key} value={key}>{badgeFields[key]}</option>)}</select></label>{current?.key==='qr_code'&&<small>O QR Code contém apenas o identificador da emissão. Este campo é opcional.</small>}<small>Obrigatórios: {required.map(key=>badgeFields[key]).join(', ')}. Modalidades e categorias vêm das inscrições aprovadas. O CREF vem do registro profissional.</small></fieldset>}</>}
 {(error||invalid)&&<p className="school-error" role="alert">{error||invalid}</p>}{message&&<p className="school-success" role="status">{message}</p>}<div className="school-form-footer"><button className="secondary" disabled={busy} onClick={()=>setReload(v=>v+1)}>Recarregar modelo salvo</button><button className="primary" disabled={busy||loading||!!invalid||imageInvalid||unavailable} onClick={save}>{busy?'Preparando…':institutionWide?'Salvar modelo padrão':'Salvar modelo'}</button></div>
 </div></div>;
}
