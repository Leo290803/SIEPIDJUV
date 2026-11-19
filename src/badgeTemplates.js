export const badgeFields={photo:'Foto',person_name:'Nome',school_name:'Escola',role_label:'Perfil',event_name:'Evento',edition:'Edição',modalities:'Modalidades',categories:'Categorias',proofs:'Provas',functions:'Função',code:'Código e versão',qr_code:'QR Code',cref:'CREF'};
export const badgeRoles={athlete:'Atleta',staff:'Comissão técnica',responsible:'Responsável escolar'};
export function allowedFields(role){return Object.keys(badgeFields).filter(key=>role==='athlete'?!['functions','cref'].includes(key):role==='staff'?key!=='proofs':!['modalities','categories','proofs','cref'].includes(key));}
export function requiredFields(role){return ['photo','person_name','school_name',role==='athlete'?'modalities':role==='staff'?'functions':'role_label'];}
const field=(key,x,y,w,h,fontSize=11)=>({key,x,y,w,h,fontSize,color:'#163453',align:'center'});
export const credentialTheme = 'credential-v1';
export function defaultBadgeLayout(role){
 return {width:86,height:130,fit:'contain',theme:credentialTheme,fields:[
  field('event_name',45,5,49,15,12),
  field('photo',33,18,34,22.49),
  field('person_name',7,43,86,6,12),
  field('school_name',7,49.6,86,4.9,9),
  ...(role==='responsible'?[]:[
   field(role==='athlete'?'modalities':'functions',7,55,86,4.2,9),
   field(role==='athlete'?'categories':'cref',7,59.7,86,4.1,9)
  ]),
  field('qr_code',37,64,26,17.2),
  field('code',37,82,26,3,7),
  field('role_label',0,87,100,6,13)
 ]};
}
export function newBadgeField(key){
 return key==='qr_code'?field(key,72,40,22,14.55):field(key,5,5,90,8,10);
}
export function validateBadgeLayout(role,layout){
 if(!badgeRoles[role]||layout?.width!==86||layout?.height!==130||(layout.theme!==undefined&&layout.theme!==credentialTheme)||!['contain','cover'].includes(layout?.fit)||!Array.isArray(layout?.fields)||layout.fields.length>12)return 'Modelo de crachá inválido.';
 const keys=new Set();for(const f of layout.fields){if(!allowedFields(role).includes(f.key)||keys.has(f.key))return 'Campo repetido ou incompatível com o perfil.';keys.add(f.key);if(![f.x,f.y,f.w,f.h,f.fontSize].every(Number.isFinite)||f.x<0||f.y<0||f.w<2||f.h<2||f.x+f.w>100.001||f.y+f.h>100.001||f.fontSize<6||f.fontSize>28||!/^#[0-9a-f]{6}$/i.test(f.color)||!['left','center','right'].includes(f.align))return 'Ajuste as medidas, fonte e cor: todos os campos devem caber no crachá.';}
 if(layout.fields.some(f=>f.key==='qr_code'&&(Math.round(f.w*8.6)<150||Math.round(f.h*13)<150)))return 'O QR Code precisa de pelo menos 15 mm de largura e altura.';
 return requiredFields(role).every(key=>keys.has(key))?'':'Mantenha os campos obrigatórios deste perfil.';
}
export function sampleBadgeData(role){return {person_name:role==='athlete'?'Nome completo do atleta':'Nome completo do profissional',school_name:'Escola Estadual de Exemplo',event_name:'Jogos Escolares de Roraima',edition:'2026',role_label:badgeRoles[role],modalities:'Atletismo / Futsal',categories:'12 a 14 anos',proofs:'100 metros',functions:role==='staff'?'Técnico / Auxiliar técnico':'Responsável escolar',code:'ABC12345 · V1',cref:'CREF 000000-G/RR'};}
export function badgeFieldText(snapshot,badge,key){if(key==='cref'){const value=String(snapshot.cref||'').trim();return value&&!/^cref\b/i.test(value)?'CREF '+value:value;}return key==='code'?`${badge.id.slice(0,8).toUpperCase()} · V${badge.version}`:String(snapshot[key]||'');}
export const customBadgeCss=`.event-badge.art-badge{position:relative;display:block;padding:0;border:0;border-radius:0;background:white;width:86mm;height:130mm;overflow:hidden}.badge-art-background{position:absolute;inset:0;width:100%;height:100%;object-position:center;pointer-events:none}.badge-art-field{position:absolute;box-sizing:border-box;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.12;overflow:hidden;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center}.badge-art-field img{width:100%;height:100%;object-fit:cover}.badge-art-field .badge-qr{width:100%;height:100%;display:block}.badge-art-field span{width:100%}.art-badge .badge-portrait{border:0;border-radius:0}`;
