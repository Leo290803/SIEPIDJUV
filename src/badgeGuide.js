import {badgeFields,badgeRoles} from './badgeTemplates.js';
export function downloadBadgeFile(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export async function createBadgeGuidePdf(role,layout){
 const {jsPDF}=await import('jspdf');const doc=new jsPDF({orientation:'portrait',unit:'mm',format:[86,130],compress:true});
 doc.setProperties({title:`Gabarito SIEP — ${badgeRoles[role]} — 86 x 130 mm`});doc.setLineWidth(.2);doc.setDrawColor(80,100,120);doc.rect(.25,.25,85.5,129.5);
 doc.setLineDashPattern([1,1],0);doc.setDrawColor(190,80,80);doc.rect(3,3,80,124);doc.setLineDashPattern([],0);
 doc.setFontSize(7);doc.setTextColor(100,100,100);doc.text('86 mm · largura',43,2.5,{align:'center'});doc.text('130 mm',1.8,65,{angle:90});
 for(let x=10;x<86;x+=10){doc.line(x,0,x,1);doc.setFontSize(5);doc.text(String(x),x,4.5,{align:'center'});}
 for(const f of layout.fields){const x=f.x*.86,y=f.y*1.3,w=f.w*.86,h=f.h*1.3;doc.setDrawColor(70,130,190);doc.setFillColor(239,245,251);doc.rect(x,y,w,h,'FD');doc.setTextColor(40,75,110);doc.setFontSize(Math.min(7,f.fontSize));const label=h>=8?`${badgeFields[f.key]}\n${w.toFixed(1)} × ${h.toFixed(1)} mm\nx ${x.toFixed(1)} · y ${y.toFixed(1)} mm`:badgeFields[f.key];doc.text(doc.splitTextToSize(label,Math.max(w-2,2)),x+1,y+Math.min(h/2,3));}
 return new Blob([doc.output('arraybuffer')],{type:'application/pdf'});
}
export async function createBadgeGuidePng(role,layout){
 const canvas=document.createElement('canvas');canvas.width=1016;canvas.height=1535;const c=canvas.getContext('2d'),sx=canvas.width/86,sy=canvas.height/130;c.fillStyle='white';c.fillRect(0,0,canvas.width,canvas.height);c.strokeStyle='#bb5555';c.lineWidth=2;c.setLineDash([10,8]);c.strokeRect(3*sx,3*sy,80*sx,124*sy);c.setLineDash([]);c.fillStyle='#445566';c.font='22px Arial';c.fillText(`SIEP · ${badgeRoles[role]} · 86 × 130 mm`,18,25);
 for(const f of layout.fields){const x=f.x/100*canvas.width,y=f.y/100*canvas.height,w=f.w/100*canvas.width,h=f.h/100*canvas.height;c.fillStyle='#eff5fb';c.fillRect(x,y,w,h);c.strokeStyle='#4682be';c.strokeRect(x,y,w,h);c.fillStyle='#284b6e';c.font='22px Arial';c.fillText(badgeFields[f.key],x+8,y+Math.min(h-3,28));c.font='17px Arial';if(h>50)c.fillText(`${(f.w*.86).toFixed(1)} × ${(f.h*1.3).toFixed(1)} mm`,x+8,y+50);}
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Não foi possível gerar o gabarito.')),'image/png'));
}
