import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
async function handler(name, fetcher) {
  let serve;
  const code=transformSync(readFileSync(new URL(`../supabase/functions/${name}/index.ts`,import.meta.url),'utf8'),{loader:'ts',format:'esm'}).code;
  vm.runInNewContext(code,{Deno:{env:{get:key=>({SUPABASE_URL:'https://test.invalid',SUPABASE_ANON_KEY:'fake-anon',SUPABASE_SERVICE_ROLE_KEY:'fake-service'}[key])},serve:callback=>serve=callback},fetch:fetcher,Request,Response,JSON});
  return body=>serve(new Request('https://test.invalid',{method:'POST',headers:{authorization:'Bearer fake-session','content-type':'application/json'},body:JSON.stringify(body)}));
}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
test('Secretaria gera usuário CPF e senha ano+últimos quatro, sem enviar e-mail',async()=>{
  const calls=[];
  const run=await handler('provision-school-access',async(url,options)=>{calls.push({url,options});if(url.endsWith('/auth/v1/user'))return json({id:'staff'});if(url.endsWith('/siep_school_access_context'))return json({cpf:'04182530217',birth_date:'2003-08-29',name:'Teste',school:'Escola correta',account_id:null});if(url.endsWith('/admin/users')){const body=JSON.parse(options.body);assert.equal(body.password,'20030217');assert.equal(body.email,'04182530217@cpf.siep.invalid');assert.equal(body.email_confirm,true);assert.equal(body.app_metadata,undefined);return json({id:'account'});}if(url.endsWith('/siep_authorize_school_account')){assert.equal(JSON.parse(options.body).p_actor_id,'staff');return json(null);}throw Error('HTTP inesperado');});
  const result=await run({link_id:'11111111-1111-4111-8111-111111111111'});assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');const data=await result.json();assert.equal(data.username,'04182530217');assert.equal(data.initial_password,'20030217');assert.equal(data.school,'Escola correta');assert.equal(calls.some(c=>c.url.includes('/invite')||c.url.includes('/recover')),false);
});
test('Gerar acesso novamente preserva senha de conta existente',async()=>{
  const run=await handler('provision-school-access',async url=>{if(url.endsWith('/auth/v1/user'))return json({id:'staff'});if(url.endsWith('/siep_school_access_context'))return json({cpf:'04182530217',birth_date:'2003-08-29',school:'Escola',account_id:'existing'});if(url.endsWith('/siep_authorize_school_account'))return json(null);throw Error('Conta existente não deve ser recriada');});const response=await run({link_id:'11111111-1111-4111-8111-111111111111'});assert.equal(response.status,200);const data=await response.json();assert.equal(data.created,false);assert.equal(data.initial_password,null);
});
test('Falha de permissão não cria conta nem senha',async()=>{let calls=0;const run=await handler('provision-school-access',async url=>{calls++;if(url.endsWith('/auth/v1/user'))return json({id:'school'});return json({message:'Sem permissão'},403);});assert.equal((await run({link_id:'11111111-1111-4111-8111-111111111111'})).status,403);assert.equal(calls,2);});
test('Login por CPF usa senha no Auth e retorna apenas tokens',async()=>{
 const run=await handler('cpf-login',async(url,options)=>{if(url.endsWith('/siep_cpf_login_account')){assert.equal(JSON.parse(options.body).p_cpf,'04182530217');return json('private@cpf.siep.invalid');}assert.equal(JSON.parse(options.body).password,'20030217');return json({access_token:'session',refresh_token:'refresh',user:{email:'private@cpf.siep.invalid'}});});const r=await run({cpf:'041.825.302-17',password:'20030217'});assert.deepEqual(await r.json(),{access_token:'session',refresh_token:'refresh'});
});
test('CPF inexistente ou bloqueado não revela dados nem aceita tokens',async()=>{const run=await handler('cpf-login',async url=>url.endsWith('/siep_cpf_login_account')?json(null):json({access_token:'unused',refresh_token:'unused'}));const r=await run({cpf:'04182530217',password:'teste'});assert.equal(r.status,400);assert.equal((await r.json()).access_token,undefined);});
