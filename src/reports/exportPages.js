export const MAX_EXPORT_ROWS=20000;
// Consulta sequencial e cancelável. Mudança do conjunto invalida o arquivo inteiro.
export async function exportPages({fetchPage,options,snapshot,onBatch,onProgress,signal}) {
 let offset=0,total=null,summary;
 do {
  signal?.throwIfAborted();
  const result=await fetchPage({...options,offset,limit:500,snapshot},signal);
  signal?.throwIfAborted();
  if(!snapshot)snapshot=result.snapshot;
  if(result.snapshot!==snapshot || total!==null && total!==result.total) throw Error('Os dados mudaram durante a exportação. Atualize o relatório e tente novamente.');
  total=result.total;summary=result.summary;
  if(total>MAX_EXPORT_ROWS)throw Error(`O resultado tem mais de ${MAX_EXPORT_ROWS.toLocaleString('pt-BR')} linhas. Selecione um evento, escola ou categoria para dividir a exportação.`);
  if(!result.rows.length && offset<total)throw Error('A consulta foi interrompida. Atualize o relatório e tente novamente.');
  onBatch(result.rows);offset+=result.rows.length;onProgress?.(offset,total);
 }while(offset<total);
 return {summary,total,snapshot};
}
