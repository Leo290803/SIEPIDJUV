import React from "react";
import { createRoot } from "react-dom/client";
import logo from "../Gemini_Generated_Image_wvkarowvkarowvka-removebg-preview.png";
export const badgePrintCss = `
*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#163453;margin:0;background:#eef2f7}button{cursor:pointer;padding:10px 16px;border-radius:6px;border:1px solid #b9cada;background:white;color:#244c75;font:inherit}.print-tools{position:sticky;top:0;background:#fff;padding:18px 24px;border-bottom:1px solid #d6e0eb;display:flex;gap:12px;align-items:center;flex-wrap:wrap}.print-tools p{margin:0;flex:1;font-size:13px}.print-tools .primary{background:#214f80;color:#fff}.badge-pages{padding:20px;display:grid;grid-template-columns:repeat(2,86mm);gap:8mm;justify-content:center}.event-badge{width:86mm;height:130mm;background:#fff;border:1px solid #b8c9db;border-top:5mm solid #163c64;border-radius:3mm;padding:4mm 5mm;display:flex;align-items:center;flex-direction:column;text-align:center;overflow:hidden;break-inside:avoid;page-break-inside:avoid}.badge-brand{width:35mm;height:14mm;position:relative;overflow:hidden;flex-shrink:0}.badge-brand img{position:absolute;width:38mm;height:38mm;left:50%;top:50%;transform:translate(-50%,-50%)}.badge-institution{font-size:8pt;line-height:1.2;margin:1mm 0;color:#506a86}.badge-event{font-size:11pt;line-height:1.25;margin:1mm 0 2mm;font-weight:700;overflow-wrap:anywhere}.badge-event small{display:block;font-size:8pt;font-weight:400;margin-top:1mm}.badge-portrait{width:32mm;height:42mm;object-fit:cover;flex-shrink:0;border:1px solid #d5e0ed;border-radius:1.5mm}.badge-name{font-size:12pt;line-height:1.25;font-weight:700;margin:3mm 0 2mm;overflow-wrap:anywhere}.badge-role{font-size:9pt;font-weight:700;letter-spacing:.3px;color:#fff;background:#215888;padding:1.5mm 3mm;border-radius:1mm}.badge-school{font-size:9pt;line-height:1.3;margin:2mm 0;overflow-wrap:anywhere}.badge-code{margin-top:auto;border-top:1px solid #dce5ef;padding-top:2mm;width:100%;font-size:7pt;color:#617991}.badge-code strong{display:block;letter-spacing:1px;margin-bottom:1mm}.badge-pages .badge-name.long{font-size:9pt}.badge-pages .badge-school.long{font-size:8pt}.badge-event,.badge-name,.badge-school,.badge-institution{width:100%}.event-badge.compact{padding:3mm 5mm}.compact .badge-event{font-size:8pt}.compact .badge-name{font-size:9pt;margin:1.5mm 0 1mm}.compact .badge-school{font-size:7.5pt;margin:1mm 0}.compact .badge-portrait{height:32mm;width:24mm}.compact .badge-brand{height:10mm}
@media(max-width:760px){.badge-pages{grid-template-columns:86mm;padding:16px;gap:16px}}
@page{size:A4 portrait;margin:10mm}
@media print{body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.print-tools{display:none}.badge-pages{padding:0;display:grid;grid-template-columns:repeat(2,86mm);justify-content:start;gap:8mm}.event-badge{box-shadow:none;break-inside:avoid;page-break-inside:avoid}}
`;
export async function showBadgePrint(popup, badges, download) {
  const urls=[];
  try {
    const images = [], cached = new Map();
    for (const badge of badges) {
      if(popup.closed) { urls.forEach(url=>URL.revokeObjectURL(url)); return; }
      const snapshot=badge.snapshot, key=snapshot.photo_bucket+"/"+snapshot.photo_path;
      if(cached.has(key)){ images.push(cached.get(key)); continue; }
      const blob=await download({bucket:snapshot.photo_bucket,objectPath:snapshot.photo_path});
      const bitmap=await createImageBitmap(blob);bitmap.close();
      const url=URL.createObjectURL(blob);urls.push(url);cached.set(key,url);images.push(url);
    }
    const logoResponse=await fetch(new URL(logo,window.location.href).href);
    if(!logoResponse.ok)throw Error("Não foi possível carregar a marca do crachá. Reabra a prévia.");
    const logoSrc=URL.createObjectURL(await logoResponse.blob());urls.push(logoSrc);
    if(popup.closed) { urls.forEach(url=>URL.revokeObjectURL(url)); return; }
    popup.document.title="Crachás · "+(badges[0]?.snapshot.event_name||"SIEP");
    popup.document.body.textContent="";
    const style=popup.document.createElement("style");style.textContent=badgePrintCss;popup.document.head.append(style);
    const root=popup.document.createElement("div");popup.document.body.append(root);
    createRoot(root).render(<>
      <div className="print-tools"><p>Prévia dos crachás · A4 · 4 por página. Use a impressão para imprimir ou salvar em PDF.</p><button className="primary" onClick={() => { if([...popup.document.images].some(img=>!img.complete||!img.naturalWidth)) { popup.alert("Aguarde o carregamento das fotos antes de imprimir.");return; } popup.print(); }}>Imprimir / Salvar PDF</button><button onClick={()=>popup.close()}>Fechar prévia</button></div>
      <div className="badge-pages">{badges.map((badge,index)=>{
        const s=badge.snapshot;
        return <article className={"event-badge"+((s.event_name.length+s.person_name.length+s.school_name.length)>200?" compact":"")} key={badge.id}>
          <div className="badge-brand"><img src={logoSrc} alt="SIEP" /></div>
          <div className="badge-institution">{s.institution_name}</div>
          <div className="badge-event">{s.event_name}{s.edition&&<small>Edição {s.edition}</small>}</div>
          <img className="badge-portrait" src={images[index]} alt={"Foto de "+s.person_name} />
          <div className={"badge-name"+(s.person_name.length>65?" long":"")}>{s.person_name}</div>
          <span className="badge-role">{s.role_label}</span>
          <div className={"badge-school"+(s.school_name.length>70?" long":"")}>{s.school_name}</div>
          <div className="badge-code"><strong>{badge.id.slice(0,8).toUpperCase()} · V{badge.version}</strong>Emissão: {new Date(badge.issued_at).toLocaleDateString("pt-BR")}</div>
        </article>;
      })}</div>
    </>);
    popup.addEventListener("beforeunload",()=>urls.forEach(url=>URL.revokeObjectURL(url)),{once:true});
  } catch(error) { urls.forEach(url=>URL.revokeObjectURL(url));if(!popup.closed)popup.close();throw error; }
}
