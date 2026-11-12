const base = Deno.env.get('SUPABASE_URL')!;
const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const allowed = !origin || ['https://siepidjuv.vercel.app', 'http://localhost:5173'].includes(origin);
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': allowed && origin ? origin : 'https://siepidjuv.vercel.app', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (!allowed) return reply({ error: 'Origem não autorizada.' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply({ error: 'Método não permitido.' }, 405);
  const authorization = req.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return reply({ error: 'Entre novamente.' }, 401);
  try {
    const userResponse = await fetch(base + '/auth/v1/user', { headers: { apikey: anon, Authorization: authorization } });
    if (!userResponse.ok) return reply({ error: 'Sua sessão expirou. Entre novamente.' }, 401);
    const actor = await userResponse.json();
    const { link_id } = await req.json();
    if (typeof link_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(link_id)) return reply({ error: 'Responsável inválido.' }, 400);
    const contextResponse = await fetch(base + '/rest/v1/rpc/siep_school_access_context', { method: 'POST', headers: { apikey: anon, Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_link_id: link_id }) });
    const context = await contextResponse.json();
    if (!contextResponse.ok) return reply({ error: context.message || 'Sem permissão para este responsável.' }, contextResponse.status === 403 ? 403 : 400);
    let account = context.account_id;
    let initial: string | null = null;
    if (!account) {
      initial = context.birth_date.slice(0, 4) + context.cpf.slice(-4);
      const created = await fetch(base + '/auth/v1/admin/users', { method: 'POST', headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: context.cpf + '@cpf.siep.invalid', password: initial, email_confirm: true, user_metadata: { display_name: context.name }, app_metadata: { siep_initial_password: true } }) });
      if (!created.ok) return reply({ error: 'Não foi possível gerar a conta. Confira o cadastro e tente novamente. Nenhum acesso foi liberado nesta tentativa.' }, 400);
      account = (await created.json()).id;
    }
    const binding = await fetch(base + '/rest/v1/rpc/siep_authorize_school_account', { method: 'POST', headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_link_id: link_id, p_actor_id: actor.id, p_account_id: account, p_cpf: context.cpf }) });
    if (!binding.ok) return reply({ error: 'Não foi possível vincular a conta. Confira o cadastro e tente novamente. Uma conta criada sem vínculo não libera acesso.' }, 400);
    return reply({ created: initial !== null, username: context.cpf, initial_password: initial, school: context.school });
  } catch { return reply({ error: 'Não foi possível concluir. Confira o vínculo antes de tentar novamente.' }, 500); }
});
