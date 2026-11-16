import test from 'node:test';
import assert from 'node:assert/strict';
import {downloadAttachment} from '../src/data/downloadAttachment.js';
test('foto fictícia usa a RPC autenticada e devolve os bytes reais',async()=>{
 let called;const client={async rpc(name,parameters){called={name,parameters};return {data:{mime_type:'image/png',base64:'AQID\nBA=='},error:null};}};
 const result=await downloadAttachment(client,{bucket:'siep-development-photos',objectPath:'development/photo.png'});
 assert.deepEqual(called,{name:'siep_read_development_photo',parameters:{p_path:'development/photo.png'}});
 assert.equal(result.type,'image/png');assert.deepEqual([...new Uint8Array(await result.arrayBuffer())],[1,2,3,4]);
});
test('foto normal e documento mantêm download pelo Storage',async()=>{
 const calls=[],blob=new Blob(['imagem']);const client={storage:{from(bucket){return {async download(path){calls.push({bucket,path});return {data:blob,error:null};}};}}};
 assert.equal(await downloadAttachment(client,{bucket:'siep-person-photos',objectPath:'private.png'}),blob);
 await downloadAttachment(client,{objectPath:'document.pdf'});
 assert.deepEqual(calls,[{bucket:'siep-person-photos',path:'private.png'},{bucket:'siep-documents',path:'document.pdf'}]);
});
test('falha de autorização ou tipo inesperado não é tratada como foto disponível',async()=>{
 await assert.rejects(downloadAttachment({rpc:async()=>({error:{code:'42501'}})},{bucket:'siep-development-photos',objectPath:'x'}),{code:'42501'});
 await assert.rejects(downloadAttachment({rpc:async()=>({data:{mime_type:'text/html',base64:''}})},{bucket:'siep-development-photos',objectPath:'x'}),/indisponível/);
});
