// Chamado pelo teste conectado com SIEP_SCALE_BROWSER=1. Somente API simulada.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
module.exports=async function({page,tables,tenant,queryCalls}){
 const origin=process.env.SIEP_TEST_ORIGIN||'http://localhost:5173';
 const sizes=Object.fromEntries(Object.entries(tables).map(([key,rows])=>[key,rows.length]));
 const school=tables.schools[0],event=tables.events[0],category=tables.event_categories[0];
 try {
  for(let i=0;i<10000;i++){
   const id=randomUUID(),part=randomUUID(),registration=randomUUID();
   tables.people.push({id,institution_id:tenant,full_name:`Volume atleta ${String(i).padStart(5,'0')}`,birth_date:'2012-01-01',cpf:String(10000000000+i),gender:i%2?'Masculino':'Feminino',contact:{},archived:false});
   tables.school_people.push({id:randomUUID(),institution_id:tenant,school_id:school.id,person_id:id,role:'athlete',status:'approved',archived:false});
   tables.event_participations.push({id:part,institution_id:tenant,event_id:event.id,school_id:school.id,person_id:id,status:'complete',additional_data:{}});
   tables.registrations.push({id:registration,institution_id:tenant,event_id:event.id,school_id:school.id,category_id:category.id,status:'approved'});
   tables.registration_athletes.push({id:randomUUID(),institution_id:tenant,registration_id:registration,event_id:event.id,school_id:school.id,person_id:id,participation_id:part,active:true,slot_number:1});
  }
  await page.getByRole('button',{name:'Atletas',exact:true}).click();
  await page.getByText('10001 atletas',{exact:true}).waitFor();
  assert.equal(await page.locator('article.school-row').count(),25,'Lista montou mais de uma página no DOM');
  await page.getByRole('button',{name:'Próxima',exact:true}).click();
  await page.getByText('26 a 50 de 10001',{exact:true}).waitFor();
  assert.equal(await page.locator('article.school-row').count(),25);
  const count=queryCalls.length;
  for(const text of ['V','Volume','Volume atleta 099','Volume atleta 09999'])await page.getByLabel('Buscar atletas',{exact:true}).fill(text);
  await page.getByText('1 atleta',{exact:true}).waitFor();
  await page.getByText('Volume atleta 09999',{exact:true}).waitFor();
  assert.ok(queryCalls.slice(count).filter(c=>c.table==='siep_portal_page').length<=2,'Disparou uma consulta por tecla');
  await page.goto(`${origin}/secretaria/${tenant}/relatorios`);
  const table=page.getByRole('table',{name:'Resultado do relatório'});
  await table.getByText('Atleta conectado',{exact:true}).waitFor();
  assert.equal(await table.locator('tbody tr').count(),25);
  await page.getByRole('button',{name:'Próxima',exact:true}).click();
  await page.getByText('Exibindo 26 a 50 de 10001',{exact:true}).waitFor();
  // A interface precisa continuar respondendo enquanto o worker gera um PDF grande.
  await page.evaluate(()=>{window.scaleTicks=0;window.scaleTimer=setInterval(()=>window.scaleTicks++,10);});
  const download=page.waitForEvent('download',{timeout:120000});
  await page.getByRole('button',{name:'Exportar PDF',exact:true}).click();
  await page.getByRole('button',{name:'Cancelar exportação',exact:true}).waitFor();
  const file=await download;await file.saveAs('/tmp/siep-scale-10001.pdf');
  const ticks=await page.evaluate(()=>{clearInterval(window.scaleTimer);return window.scaleTicks;});
  assert.ok(ticks>10,'A interface deixou de responder durante o PDF');
  // Cancelar um segundo arquivo encerra consultas adicionais e não produz download.
  await page.getByRole('button',{name:'Exportar CSV',exact:true}).click();
  await page.getByRole('button',{name:'Cancelar exportação',exact:true}).click();
  await page.getByRole('button',{name:'Cancelar exportação',exact:true}).waitFor({state:'detached'});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'/tmp/siep-scale-reports-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  console.log('PASS: 10001 pessoas simuladas, listas com 25 linhas, busca com atraso, paginação remota, PDF completo em worker com interface responsiva e cancelamento.');
 }finally{
  for(const [key,size] of Object.entries(sizes))tables[key].splice(size);
  await page.goto(`${origin}/secretaria/${tenant}/relatorios`);
  await page.getByRole('table',{name:'Resultado do relatório'}).getByText('Atleta conectado',{exact:true}).waitFor();
 }
};
