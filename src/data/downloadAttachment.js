// Fotos normais continuam no Storage. Imagens sintéticas de desenvolvimento
// têm um namespace próprio e são lidas por RPC autenticada.
export async function downloadAttachment(client,attachment) {
 const bucket=attachment.bucket || 'siep-documents';
 if(bucket==='siep-development-photos') {
  const {data,error}=await client.rpc('siep_read_development_photo',{p_path:attachment.objectPath});
  if(error)throw error;
  if(!data || !['image/png','image/jpeg'].includes(data.mime_type))throw Error('Imagem de exemplo indisponível.');
  const bytes=Uint8Array.from(atob(data.base64),character=>character.charCodeAt(0));
  return new Blob([bytes],{type:data.mime_type});
 }
 const {data,error}=await client.storage.from(bucket).download(attachment.objectPath);
 if(error)throw error;
 return data;
}
