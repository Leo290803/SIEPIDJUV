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
  const invalid = () => reply({ error: 'CPF ou senha inválidos, ou limite de tentativas atingido. Tente novamente mais tarde.' }, 400);
  try {
    const body = await req.json();
    const cpf = typeof body.cpf === 'string' ? body.cpf.replace(/[^0-9]/g, '') : '';
    if (!/^\d{11}$/.test(cpf) || typeof body.password !== 'string' || !body.password || body.password.length > 128) return invalid();
    const lookup = await fetch(base + '/rest/v1/rpc/siep_cpf_login_account', { method: 'POST', headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_cpf: cpf }) });
    const email = lookup.ok ? await lookup.json() : null;
    // Também autentica desconhecidos para reduzir diferenças de tempo/resposta.
    const result = await fetch(base + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email || 'unavailable@cpf.siep.invalid', password: body.password }) });
    if (!result.ok || !email) return invalid();
    const session = await result.json();
    return reply({ access_token: session.access_token, refresh_token: session.refresh_token });
  } catch { return invalid(); }
});
