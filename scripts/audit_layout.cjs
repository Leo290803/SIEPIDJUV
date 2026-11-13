// Inspeção visual com os fixtures do teste conectado. Nunca grava no Supabase real.
const fs = require('node:fs');
module.exports = async function audit({page, tenant, schoolId, eventId, registrationId, area}) {
 const stage=process.env.SIEP_LAYOUT_AUDIT || 'manual',root='/tmp/siep-layout-audit/'+stage;
 fs.mkdirSync(root,{recursive:true});
 const saved={url:page.url(),viewport:page.viewportSize()};
 const base=area==='secretaria'?`/secretaria/${tenant}`:`/escola/${tenant}/escolas/${schoolId}`;
 const slugs=area==='secretaria'?['painel','eventos','escolas','responsaveis','atletas','comissao-tecnica','inscricoes','relatorios','crachas','notificacoes','instituicao','usuarios','competicoes','inscricoes-publicas']:['painel','eventos','atletas','comissao-tecnica','inscricoes','notificacoes','dados'];
 const routes=slugs.map(slug=>[slug,base+'/'+slug]);
 routes.push(['atleta-novo',base+'/atletas/novo'],['profissional-novo',base+'/comissao-tecnica/novo']);
 if(area==='secretaria'){
  routes.push(['responsavel-novo',base+'/responsaveis/novo'],['evento-novo',base+'/eventos/novo'],['evento-editar',base+`/eventos/${eventId}/editar`],['evento-duplicar',base+`/eventos/${eventId}/duplicar`]);
  for(const tab of ['visao-geral','modalidades','regras','formulario','funcoes'])routes.push(['evento-'+tab,base+`/eventos/${eventId}/${tab}`]);
 }
 if(stage==='details'){
  routes.splice(0,routes.length,...(area==='secretaria'?[['evento-modalidades',base+`/eventos/${eventId}/modalidades`],['evento-regras',base+`/eventos/${eventId}/regras`]]:[['atletas',base+'/atletas'],['comissao-tecnica',base+'/comissao-tecnica'],['inscricao-nova',base+'/inscricoes/nova']]));
  if(registrationId) routes.push(['inscricao-editar',base+`/inscricoes/${registrationId}/editar`],['inscricao-historico',base+`/inscricoes/${registrationId}/historico`]);
 }
 const records=[];
 async function capture(name,width,footer=false){
  const modal=page.locator('.modal').last();
  const hasModal=await modal.count()>0;
  if(hasModal&&!footer) await modal.evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:`${root}/${area}-${width}-${name}.png`,fullPage:true});
  const metrics=await page.evaluate((footer)=>{
   const visible=el=>el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0;
   const fields=[...document.querySelectorAll('input:not([type=hidden]),select,textarea,button.primary,button.secondary')].filter(visible);
   const clipped=fields.filter(el=>{if(el.closest('.table-scroll,.event-tabs'))return false;const r=el.getBoundingClientRect(),m=el.closest('.modal')?.getBoundingClientRect();return r.left< -1||r.right>innerWidth+1||(m&&(r.left<m.left-1||r.right>m.right+1));}).map(el=>({tag:el.tagName,text:el.getAttribute('name')||el.getAttribute('aria-label')||el.textContent?.trim().slice(0,60)}));
   const panel=document.querySelector('[role=tabpanel]:not([hidden])');
   const workspace=document.querySelector('.manager-content');
   const rowMisalignment=[...document.querySelectorAll('.form-row')].filter(visible).filter(row=>{
     const labels=[...row.children].filter(el=>el.tagName==='LABEL'&&visible(el));
     if(labels.length!==2||Math.abs(labels[0].getBoundingClientRect().left-labels[1].getBoundingClientRect().left)<8)return false;
     const controls=labels.map(label=>label.querySelector(':scope > input,:scope > select')).filter(Boolean);
     return controls.length===2&&Math.abs(controls[0].getBoundingClientRect().bottom-controls[1].getBoundingClientRect().bottom)>2;
   }).map(row=>row.textContent.trim().slice(0,100));
   const modal=document.querySelector('.modal');
   const footerClipped=footer&&modal?[...modal.querySelectorAll('.school-form-footer button,button[type=submit]')].filter(visible).some(el=>{const r=el.getBoundingClientRect(),m=modal.getBoundingClientRect();return r.top<m.top-1||r.bottom>m.bottom+1;}):false;
   return {overflow:document.documentElement.scrollWidth>innerWidth+1,clipped,footerClipped,rowMisalignment,panelRatio:panel&&workspace?Math.round(panel.getBoundingClientRect().width/workspace.getBoundingClientRect().width*100):null};
  },footer);
  records.push({name,width,...metrics});
  if(hasModal&&!footer&&await modal.evaluate(el=>el.scrollHeight>el.clientHeight+2)){
    await modal.evaluate(el=>el.scrollTop=el.scrollHeight);
    await capture(name+'-rodape',width,true);
  }
 }
 for(const width of [1440,1024,390]){
  await page.setViewportSize({width,height:width===390?844:1000});
  for(const [name,path] of routes){
   await page.goto('http://localhost:5173'+path);
   await page.locator('.main main').waitFor();
   await page.locator('main > [role=status]').waitFor({state:'hidden'});
   await capture(name,width);
   if(name==='escolas'){
    await page.getByRole('button',{name:'Cadastrar escola',exact:true}).click();await capture('escola-nova',width);
   }
   if(name==='evento-modalidades'){
    await page.getByRole('button',{name:'Nova modalidade',exact:true}).click();await capture('modalidade-nova',width);
    if(stage==='details'){
     await page.getByRole('button',{name:'Fechar modalidade',exact:true}).click();
     await page.getByRole('button',{name:'Configurar Futsal',exact:true}).click();await capture('categorias',width);
     await page.getByRole('button',{name:'Nova categoria',exact:true}).click();await capture('categoria-nova',width);
     await page.getByRole('button',{name:'Adicionar prova',exact:true}).click();await capture('prova-nova',width);
    }
   }
   if(stage==='details' && name==='evento-regras'){
    await page.getByRole('button',{name:/^Adicionar /}).first().click();await capture('regra-configurar',width);
   }
   if(stage==='details' && ['atletas','comissao-tecnica'].includes(name)){
    await page.getByRole('button',{name:/^Editar /}).first().click();await capture(name+'-editar',width);
   }
   if(stage==='details' && name==='inscricao-nova'){
    await page.getByRole('dialog').locator('select').first().selectOption({index:1});await capture('inscricao-elenco',width);
   }
   if(name==='evento-formulario'){
    await page.getByRole('button',{name:'Adicionar documento',exact:true}).click();await capture('documento-novo',width);
   }
  }
 }
 fs.writeFileSync(`${root}/${area}.json`,JSON.stringify(records,null,2));
 if(stage!=='before') {
  const issues=records.filter(r=>r.overflow||r.clipped.length||r.footerClipped||r.rowMisalignment.length||r.panelRatio!==null&&(r.panelRatio<85||r.panelRatio>100));
  if(issues.length) throw Error('Falhas de layout: '+JSON.stringify(issues));
 }
 console.log(`LAYOUT ${stage} ${area}: ${records.length} capturas; ${records.filter(r=>r.overflow||r.clipped.length).length} telas com transbordamento; abas: ${records.filter(r=>r.panelRatio!==null).map(r=>r.name+':'+r.width+'='+r.panelRatio+'%').join(', ')}`);
 await page.setViewportSize(saved.viewport);await page.goto(saved.url);await page.locator('.main main').waitFor();
};
