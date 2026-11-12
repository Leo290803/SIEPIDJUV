// Navegador real + API simulada: não cria contas nem envia e-mails.
const assert = require("node:assert/strict");
const fs = require("node:fs");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({
    chromium,
  } = require("/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
}
(async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "admin-test@example.invalid",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const tenant = "22222222-2222-4222-8222-222222222222";
  let isAdmin = true,
    failSchool = true,
    resetRedirect = "",
    authCalls = 0;
  const tables = {
    institutions: [
      {
        id: tenant,
        name: "IDJUV teste",
        slug: "idjuv",
        branding: { subtitle: "Teste de integração" },
      },
    ],
    institution_memberships: [
      {
        id: "membership",
        institution_id: tenant,
        user_id: user.id,
        role: "admin",
        status: "approved",
      },
    ],
    schools: [],
    events: [],
    event_modalities: [],
    event_categories: [],
    event_proofs: [],
    event_rules: [],
    event_fields: [],
    document_requirements: [],
    event_staff_roles: [],
    school_link_requests: [],
    school_people: [],
  };
  const response = (route, data, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "content-range",
        "content-range": "0-0/*",
      },
      body: JSON.stringify(data),
    });
  await context.route(
    "https://oshzcmmbhxvmchjgxztp.supabase.co/**",
    async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        body = req.postDataJSON(),
        method = req.method();
      if (method === "OPTIONS")
        return route.fulfill({
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "*",
          },
        });
      if (url.pathname.startsWith("/auth/")) {
        authCalls++;
        if (url.pathname.endsWith("/token")) {
          const token =
            btoa(JSON.stringify({ alg: "HS256" })) +
            "." +
            btoa(
              JSON.stringify({
                sub: user.id,
                exp: Math.floor(Date.now() / 1000) + 3600,
                role: "authenticated",
              }),
            ) +
            ".test";
          return response(route, {
            access_token: token,
            refresh_token: "test-refresh",
            token_type: "bearer",
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user,
          });
        }
        if (url.pathname.endsWith("/recover")) {
          resetRedirect = url.searchParams.get("redirect_to");
          return response(route, {});
        }
        if (url.pathname.endsWith("/signup"))
          return response(route, {
            id: user.id,
            email: user.email,
            identities: [],
          });
        if (url.pathname.endsWith("/logout"))
          return route.fulfill({ status: 204 });
        if (url.pathname.endsWith("/user")) return response(route, user);
      }
      const table = url.pathname.split("/").at(-1);
      if (table === "siep_save_event_configuration") {
        const ev = tables.events.find((e) => e.id === body.p_event_id);
        if (body.p_expected_version !== ev.configuration_version)
          return response(route, { code: "40001", message: "stale" }, 409);
        const names = {
          modalities: "event_modalities",
          categories: "event_categories",
          proofs: "event_proofs",
          rules: "event_rules",
          fields: "event_fields",
          documents: "document_requirements",
          roles: "event_staff_roles",
        };
        for (const [key, rows] of Object.entries(body.p_payload))
          tables[names[key]] = rows.map((r) => ({
            ...r,
            event_id: ev.id,
            institution_id: tenant,
          }));
        ev.configuration_version++;
        return response(route, ev.configuration_version);
      }
      if (!(table in tables))
        return response(
          route,
          { code: "unexpected", message: "Unexpected request " + url.pathname },
          400,
        );
      if (method === "GET")
        return response(
          route,
          table === "institution_memberships" && !isAdmin ? [] : tables[table],
        );
      if (table === "schools" && method === "POST" && failSchool) {
        failSchool = false;
        return response(route, { code: "23505", message: "duplicate" }, 409);
      }
      if (method === "POST") {
        const row = {
          ...body,
          configuration_version: 1,
          created_at: new Date().toISOString(),
        };
        tables[table].push(row);
        return response(route, row, 201);
      }
      if (method === "PATCH") {
        const id = url.searchParams.get("id")?.replace("eq.", "");
        const row = tables[table].find((r) => r.id === id);
        Object.assign(row, body);
        return response(route, row);
      }
      return response(route, { message: "Unexpected method" }, 400);
    },
  );
  await page.addInitScript(() => {
    if (!localStorage.getItem("siep-events"))
      localStorage.setItem(
        "siep-events",
        JSON.stringify([
          {
            id: 42,
            name: "Evento local preservado",
            year: "2026",
            type: "Outro evento",
            status: "Rascunho",
            schools: 0,
            count: 0,
          },
        ]),
      );
  });
  await page.goto("http://localhost:5173");
  await page.getByRole("heading", { name: "Acessar o SIEP" }).waitFor();
  assert.equal(authCalls, 0);
  await page.getByRole("button", { name: "Abrir demonstração local" }).click();
  await page.getByText("Evento local preservado", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Sair da demonstração e acessar minha conta" })
    .click();
  await page.getByRole("button", { name: "Esqueci minha senha" }).click();
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByRole("button", { name: "Enviar instruções" }).click();
  await page
    .getByText(
      "Se houver uma conta para este endereço, você receberá as instruções de recuperação.",
    )
    .waitFor();
  assert.equal(resetRedirect, "http://localhost:5173/?recovery=1");
  await page.getByRole("button", { name: "Voltar ao acesso" }).click();
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-de-teste-longa");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page
    .getByRole("button", { name: "Novo evento", exact: true })
    .waitFor();
  assert.equal(
    await page.getByText("Evento local preservado", { exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "Escolas", exact: true }).click();
  await page
    .getByRole("button", { name: "Cadastrar escola", exact: true })
    .click();
  await page
    .getByLabel("Nome da escola *", { exact: true })
    .fill("Escola conectada");
  await page.getByLabel("Município *", { exact: true }).fill("Boa Vista");
  await page
    .getByRole("button", { name: "Salvar escola", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Já existe um registro" })
    .waitFor();
  assert.equal(tables.schools.length, 0);
  assert.equal(await page.getByRole("dialog").count(), 1);
  await page
    .getByRole("button", { name: "Salvar escola", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Escola conectada", exact: true })
    .waitFor();
  assert.equal(tables.schools.length, 1);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("siep-schools")),
    null,
  );
  await page.getByRole("button", { name: "Eventos", exact: true }).click();
  await page.getByRole("button", { name: "Novo evento", exact: true }).click();
  await page
    .getByLabel("Nome do evento", { exact: true })
    .fill("Evento conectado");
  await page
    .getByRole("button", { name: "Salvar evento", exact: true })
    .click();
  await page.getByText("Evento conectado", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Gerenciar", exact: true }).click();
  await page.getByRole("tab", { name: "Modalidades e categorias" }).click();
  await page
    .getByRole("button", { name: "Nova modalidade", exact: true })
    .click();
  await page.getByLabel("Nome da modalidade *").fill("Futsal");
  await page.getByRole("button", { name: "Salvar modalidade" }).click();
  await page.getByRole("heading", { name: "Futsal", exact: true }).waitFor();
  assert.equal(tables.event_modalities.length, 1);
  await page
    .getByRole("button", { name: "Nova categoria", exact: true })
    .click();
  await page
    .getByLabel("Nome da categoria", { exact: true })
    .fill("12 a 14 anos");
  await page
    .getByRole("button", { name: "Salvar categoria", exact: true })
    .click();
  await page.getByText("12 a 14 anos", { exact: true }).waitFor();
  assert.equal(tables.event_categories.length, 1);
  await page.reload();
  await page
    .getByRole("button", { name: "Novo evento", exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("siep-events"))[0].name,
    ),
    "Evento local preservado",
  );
  await page.screenshot({
    path: "/tmp/siep-connected-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/tmp/siep-connected-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Overflow mobile",
  );
  await page.getByRole("button", { name: "Sair da conta" }).click();
  await page.getByRole("heading", { name: "Acessar o SIEP" }).waitFor();
  isAdmin = false;
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-de-teste-longa");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page
    .getByRole("button", { name: "Dados da escola", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Novo evento", exact: true })
      .count(),
    0,
  );
  await page
    .getByRole("button", { name: "Dados da escola", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Cadastrar escola", exact: true })
      .count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: login, recuperação, demo preservada, escolas assíncronas sem falso sucesso, eventos/configuração, recarga, logout, permissões visuais e mobile; API simulada, sem e-mails reais.",
  );
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
