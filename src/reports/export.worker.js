import {serializeCsv} from './csv.js';
let settings, rows=[];
self.onmessage=async ({data})=>{
 try {
  if(data.action==='start'){settings=data.settings;rows=[];return;}
  if(data.action==='append'){rows.push(...data.rows);return;}
  if(data.action!=='finish')return;
  let blob;
  if(settings.format==='csv') blob=new Blob([serializeCsv(settings.columns,rows)],{type:'text/csv;charset=utf-8;'});
  else {
   const {createReportPdf}=await import('./exportPdf.js');
   const doc=await createReportPdf({...settings,rows});
   blob=new Blob([doc.output('arraybuffer')],{type:'application/pdf'});
  }
  self.postMessage({blob});rows=[];
 }catch(error){self.postMessage({error:error.message || 'Falha ao gerar o arquivo.'});}
};
