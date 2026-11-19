import React,{useLayoutEffect,useRef,useState} from "react";
import {customBadgeCss,badgeFieldText,credentialTheme} from "./badgeTemplates.js";
import {BadgeArtwork,badgeArtworkCss} from "./BadgeArtwork.jsx";
import BadgeQr from "./BadgeQr.jsx";
import { createRoot } from "react-dom/client";
import logo from "../Gemini_Generated_Image_wvkarowvkarowvka-removebg-preview.png";
export const badgePrintCss = `
*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#163453;margin:0;background:#eef2f7}button{cursor:pointer;padding:10px 16px;border-radius:6px;border:1px solid #b9cada;background:white;color:#244c75;font:inherit}.print-tools{position:sticky;top:0;background:#fff;padding:18px 24px;border-bottom:1px solid #d6e0eb;display:flex;gap:12px;align-items:center;flex-wrap:wrap}.print-tools p{margin:0;flex:1;font-size:13px}.print-tools .primary{background:#214f80;color:#fff}.badge-pages{padding:20px;display:grid;grid-template-columns:repeat(2,86mm);gap:8mm;justify-content:center}.event-badge{width:86mm;height:130mm;background:#fff;border:1px solid #b8c9db;border-top:5mm solid #163c64;border-radius:3mm;padding:4mm 5mm;display:flex;align-items:center;flex-direction:column;text-align:center;overflow:hidden;break-inside:avoid;page-break-inside:avoid}.badge-brand{width:35mm;height:14mm;position:relative;overflow:hidden;flex-shrink:0}.badge-brand img{position:absolute;width:38mm;height:38mm;left:50%;top:50%;transform:translate(-50%,-50%)}.badge-institution{font-size:8pt;line-height:1.2;margin:1mm 0;color:#506a86}.badge-event{font-size:11pt;line-height:1.25;margin:1mm 0 2mm;font-weight:700;overflow-wrap:anywhere}.badge-event small{display:block;font-size:8pt;font-weight:400;margin-top:1mm}.badge-portrait{width:32mm;height:42mm;object-fit:cover;flex-shrink:0;border:1px solid #d5e0ed;border-radius:1.5mm}.badge-name{font-size:12pt;line-height:1.25;font-weight:700;margin:3mm 0 2mm;overflow-wrap:anywhere}.badge-role{font-size:9pt;font-weight:700;letter-spacing:.3px;color:#fff;background:#215888;padding:1.5mm 3mm;border-radius:1mm}.badge-school{font-size:9pt;line-height:1.3;margin:2mm 0;overflow-wrap:anywhere}.badge-code{margin-top:auto;border-top:1px solid #dce5ef;padding-top:2mm;width:100%;font-size:7pt;color:#617991}.badge-code strong{display:block;letter-spacing:1px;margin-bottom:1mm}.badge-pages .badge-name.long{font-size:9pt}.badge-pages .badge-school.long{font-size:8pt}.badge-event,.badge-name,.badge-school,.badge-institution{width:100%}.event-badge.compact{padding:3mm 5mm}.compact .badge-event{font-size:8pt}.compact .badge-name{font-size:9pt;margin:1.5mm 0 1mm}.compact .badge-school{font-size:7.5pt;margin:1mm 0}.compact .badge-portrait{height:32mm;width:24mm}.compact .badge-brand{height:10mm}
.badge-print-pair{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,86mm);gap:8mm;break-inside:avoid;page-break-inside:avoid;justify-content:start}
@media screen and (max-width:760px){.badge-print-pair{grid-template-columns:86mm}}
@media(max-width:760px){.badge-pages{grid-template-columns:86mm;padding:16px;gap:16px}}
@page{size:A4 portrait;margin:10mm}
@media print{body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.print-tools{display:none}.badge-pages{padding:0;display:grid;grid-template-columns:repeat(2,86mm);justify-content:start;gap:8mm}.event-badge{box-shadow:none;break-inside:avoid;page-break-inside:avoid}}
`;
function fitCustomFields(root) {
 let overflow=false;
 for(const node of root.querySelectorAll('.badge-art-field[data-font-size]')){
  const span=node.firstElementChild;let low=6,high=Number(node.dataset.fontSize),best=6;
  for(let i=0;i<7;i++){const size=(low+high)/2;node.style.fontSize=size+'pt';if(span.scrollHeight<=node.clientHeight+1&&span.scrollWidth<=node.clientWidth+1){best=size;low=size;}else high=size;}
  node.style.fontSize=best+'pt';if(span.scrollHeight>node.clientHeight+1||span.scrollWidth>node.clientWidth+1)overflow=true;
 }
 return overflow;
}
function CustomBadge({badge,photo,background,logoSrc}) {
 const s=badge.snapshot,t=s.badge_template;
 const credential=t.layout.theme===credentialTheme;
 const front=<article className={'event-badge art-badge'+(credential?' badge-credential':'')} data-template-version={t.version}>
  {credential&&!background&&<BadgeArtwork/>}
  {background&&<img className="badge-art-background" src={background} style={{objectFit:t.layout.fit}} alt="Arte personalizada do crachá"/>}
  {t.layout.fields.filter(f=>f.key!=='cref'||s.cref).map(f=><div key={f.key} data-field={f.key} className="badge-art-field" data-font-size={['photo','qr_code'].includes(f.key)?undefined:f.fontSize} style={{left:f.x+'%',top:f.y+'%',width:f.w+'%',height:f.h+'%',fontSize:f.fontSize+'pt',color:f.color,textAlign:f.align}}>{f.key==='photo'?<img className="badge-portrait" src={photo} alt={'Foto de '+s.person_name}/>:f.key==='qr_code'?<BadgeQr badgeId={badge.id}/>:<span>{badgeFieldText(s,badge,f.key)}</span>}</div>)}
 </article>;
 return credential?<div className="badge-print-pair">{front}<BadgeArtwork reverse eventName={s.event_name} edition={s.edition} logoSrc={logoSrc}/></div>:front;
}
function PrintSheet({popup,badges,images,backgrounds,logoSrc}) {
 const root=useRef(null),[overflow,setOverflow]=useState(false);
 useLayoutEffect(()=>{if(root.current)setOverflow(fitCustomFields(root.current));},[badges]);
 return <div ref={root}>
 <div className="print-tools"><p>Prévia dos crachás · 86 × 130 mm · A4. Use a impressão para imprimir ou salvar em PDF.</p>{overflow&&<p role="alert">Há texto que não cabe na área configurada. Aumente a área do campo no modelo e emita uma nova versão.</p>}<button className="primary" disabled={overflow} onClick={()=>{if([...popup.document.images].some(img=>!img.complete||!img.naturalWidth)){popup.alert('Aguarde o carregamento das fotos e artes antes de imprimir.');return;}if(fitCustomFields(root.current)){setOverflow(true);return;}popup.print();}}>Imprimir / Salvar PDF</button><button onClick={()=>popup.close()}>Fechar prévia</button></div>
 <div className="badge-pages">{badges.map((badge,index)=>{const s=badge.snapshot;if(s.badge_template)return <CustomBadge key={badge.id} badge={badge} photo={images[index]} background={backgrounds[index]} logoSrc={logoSrc}/>;return <article className={'event-badge'+((s.event_name.length+s.person_name.length+s.school_name.length)>200?' compact':'')} key={badge.id}>
 <div className="badge-brand"><img src={logoSrc} alt="SIEP"/></div><div className="badge-institution">{s.institution_name}</div><div className="badge-event">{s.event_name}{s.edition&&<small>Edição {s.edition}</small>}</div><img className="badge-portrait" src={images[index]} alt={'Foto de '+s.person_name}/><div className={'badge-name'+(s.person_name.length>65?' long':'')}>{s.person_name}</div><span className="badge-role">{s.role_label}</span><div className={'badge-school'+(s.school_name.length>70?' long':'')}>{s.school_name}</div>{s.cref&&<div className="badge-school">{badgeFieldText(s,badge,'cref')}</div>}<div className="badge-code"><strong>{badge.id.slice(0,8).toUpperCase()} · V{badge.version}</strong>Emissão: {new Date(badge.issued_at).toLocaleDateString('pt-BR')}</div></article>;})}</div></div>;
}
export async function showBadgePrint(popup, badges, download) {
  const urls=[];
  try {
    const images=[],backgrounds=[],cached=new Map();
    async function asset(attachment){const key=attachment.bucket+'/'+attachment.objectPath;if(cached.has(key))return cached.get(key);const blob=await download(attachment);const bitmap=await createImageBitmap(blob);bitmap.close();const url=URL.createObjectURL(blob);urls.push(url);cached.set(key,url);return url;}
    for(const badge of badges){if(popup.closed){urls.forEach(url=>URL.revokeObjectURL(url));return;}const s=badge.snapshot;images.push(await asset({bucket:s.photo_bucket,objectPath:s.photo_path}));backgrounds.push(s.badge_template?.background ? await asset(s.badge_template.background) : null);}
    let logoSrc=null;
    if(badges.some(b=>!b.snapshot.badge_template||b.snapshot.badge_template.layout.theme===credentialTheme)){
    const logoResponse=await fetch(new URL(logo,window.location.href).href);
    if(!logoResponse.ok)throw Error("Não foi possível carregar a marca do crachá. Reabra a prévia.");
    logoSrc=URL.createObjectURL(await logoResponse.blob());urls.push(logoSrc);
    }
    if(popup.closed) { urls.forEach(url=>URL.revokeObjectURL(url)); return; }
    popup.document.title="Crachás · "+(badges[0]?.snapshot.event_name||"SIEP");
    popup.document.body.textContent="";
    const style=popup.document.createElement("style");style.textContent=badgePrintCss+customBadgeCss+badgeArtworkCss;popup.document.head.append(style);
    const root=popup.document.createElement("div");popup.document.body.append(root);
    createRoot(root).render(<PrintSheet popup={popup} badges={badges} images={images} backgrounds={backgrounds} logoSrc={logoSrc}/>);
    popup.addEventListener("beforeunload",()=>urls.forEach(url=>URL.revokeObjectURL(url)),{once:true});
  } catch(error) { urls.forEach(url=>URL.revokeObjectURL(url));if(!popup.closed)popup.close();throw error; }
}
