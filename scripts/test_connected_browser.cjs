// Navegador real + API simulada: não cria contas nem envia e-mails.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
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
  let isManager = false;
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
    people: [],
    event_participations: [],
    participation_categories: [],
    participant_documents: [],
    membership_decisions: [],
    registrations: [],
    registration_athletes: [],
    registration_staff: [],
    school_event_contexts: [],
    notifications: [],
    registration_versions: [],
    registration_decisions: [],
  };
  const uploadedPaths = new Set();
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
        body = req.headers()["content-type"]?.includes("application/json")
          ? req.postDataJSON()
          : null,
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
          if(url.searchParams.get('grant_type')==='refresh_token'&&body.refresh_token==='expired-test')return response(route,{error:'invalid_grant',message:'Invalid Refresh Token',msg:'Invalid Refresh Token'},400);
          if (
            url.searchParams.get("grant_type") === "password" &&
            body.password !== "senha-de-teste-longa"
          )
            return response(
              route,
              {
                error: "invalid_grant",
                message: "Invalid login credentials",
                msg: "Invalid login credentials",
              },
              400,
            );
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
      if (url.pathname.startsWith("/storage/v1/object/")) {
        const path = url.pathname.split("/siep-documents/")[1];
        if (method === "POST") {
          uploadedPaths.add(path);
          return response(route, {
            Key: "siep-documents/" + path,
            Id: randomUUID(),
          });
        }
        return route.fulfill({
          status: 200,
          body: Buffer.from("test-image"),
          contentType: "image/png",
        });
      }
      const table = url.pathname.split("/").at(-1);
      if (table === "siep_save_connected_person") {
        let link = tables.school_people.find((l) => l.id === body.p_link_id);
        let person = link
          ? tables.people.find((p) => p.id === link.person_id)
          : tables.people.find((p) => p.cpf === body.p_data.cpf);
        if (!person) {
          person = {
            id: body.p_create_id || randomUUID(),
            institution_id: tenant,
            full_name: body.p_data.full_name,
            birth_date: body.p_data.birth_date,
            cpf: body.p_data.cpf,
            gender: body.p_data.gender,
            contact: body.p_data.contact,
            archived: false,
            updated_at: new Date().toISOString(),
          };
          tables.people.push(person);
        }
        if (!link) {
          link = {
            id: randomUUID(),
            institution_id: tenant,
            school_id: body.p_school_id,
            person_id: person.id,
            role: body.p_role,
            status: body.p_role === "responsible" ? "pending" : "approved",
            version: 1,
          };
          tables.school_people.push(link);
        }
        Object.assign(link, {
          archived: body.p_data.archived,
          position: body.p_data.position,
          professional_registration: body.p_data.professional_registration,
        });
        link.version++;
        let part = null;
        if (body.p_event_id) {
          part = tables.event_participations.find(
            (p) => p.person_id === person.id && p.event_id === body.p_event_id,
          );
          if (!part) {
            part = {
              id: randomUUID(),
              institution_id: tenant,
              school_id: body.p_school_id,
              person_id: person.id,
              event_id: body.p_event_id,
            };
            tables.event_participations.push(part);
          }
          Object.assign(part, {
            status: "draft",
            additional_data: body.p_additional_data,
          });
          tables.participation_categories =
            tables.participation_categories.filter(
              (c) => c.participation_id !== part.id,
            );
          for (const id of body.p_category_ids || [])
            tables.participation_categories.push({
              id: randomUUID(),
              institution_id: tenant,
              event_id: body.p_event_id,
              participation_id: part.id,
              category_id: id,
            });
        }
        return response(route, {
          person_id: person.id,
          link_id: link.id,
          version: link.version,
          participation: part,
        });
      }
      if (table === "siep_set_active_event") {
        tables.school_event_contexts = [
          {
            id: randomUUID(),
            institution_id: tenant,
            school_id: body.p_school_id,
            event_id: body.p_event_id,
          },
        ];
        return response(route, null);
      }
      if (table === "siep_save_participation") {
        const part = tables.event_participations.find(
          (p) =>
            p.person_id === body.p_person_id && p.event_id === body.p_event_id,
        );
        part.status = body.p_complete ? "complete" : "draft";
        return response(route, {
          id: part.id,
          status: part.status,
          issues: [],
        });
      }
      if (table === "siep_prepare_document") {
        const part = tables.event_participations.find(
          (p) => p.id === body.p_participation_id,
        );
        const id = randomUUID(),
          path =
            tenant + "/" + part.event_id + "/" + part.id + "/" + id + ".png";
        const d = {
          id,
          institution_id: tenant,
          event_id: part.event_id,
          participation_id: part.id,
          requirement_id: body.p_requirement_id,
          bucket_id: "siep-documents",
          object_path: path,
          mime_type: body.p_mime_type,
          size_bytes: body.p_size_bytes,
          original_name: body.p_name,
          status: "pending",
        };
        tables.participant_documents.push(d);
        return response(route, { id, bucket: "siep-documents", path });
      }
      if (table === "siep_finalize_document") {
        const d = tables.participant_documents.find(
          (d) => d.id === body.p_document_id,
        );
        assert.ok(uploadedPaths.has(d.object_path));
        d.status = "uploaded";
        return response(route, null);
      }
      if (table === "siep_eligible_athletes")
        return response(
          route,
          tables.event_participations
            .filter((p) => p.status === "complete")
            .map((p) => ({
              participation_id: p.id,
              person_id: p.person_id,
              full_name: tables.people.find(
                (person) => person.id === p.person_id,
              ).full_name,
            })),
        );
      if (table === "siep_preview_registration")
        return response(route, { issues: [] });
      if (table === "siep_save_registration") {
        let r = tables.registrations.find(
          (r) => r.id === body.p_registration_id,
        );
        if (!r) {
          r = {
            id: randomUUID(),
            institution_id: tenant,
            event_id: body.p_event_id,
            school_id: body.p_school_id,
            category_id: body.p_category_id,
            proof_id: body.p_proof_id,
            status: "draft",
            revision: 1,
          };
          tables.registrations.push(r);
        } else r.revision++;
        tables.registration_athletes = body.p_athletes.map((a) => ({
          id: randomUUID(),
          institution_id: tenant,
          event_id: r.event_id,
          school_id: r.school_id,
          registration_id: r.id,
          participation_id: a.participation_id,
          person_id: tables.event_participations.find(
            (p) => p.id === a.participation_id,
          ).person_id,
          proof_id: r.proof_id,
          slot_number: a.slot_number,
          active: true,
        }));
        tables.registration_staff = body.p_staff.map((s) => ({
          ...s,
          id: randomUUID(),
          institution_id: tenant,
          event_id: r.event_id,
          school_id: r.school_id,
          registration_id: r.id,
        }));
        return response(route, {
          id: r.id,
          status: r.status,
          revision: r.revision,
          issues: [],
        });
      }
      if (table === "siep_transition_registration") {
        const r = tables.registrations.find(
          (r) => r.id === body.p_registration_id,
        );
        r.status = body.p_status;
        r.revision++;
        return response(route, r);
      }

      if (table === "siep_password_change_required") return response(route, false);
      if (table === "siep_my_access")
        return response(route, [
          {
            ...tables.institutions[0],
            staff_role: isAdmin ? "admin" : isManager ? "manager" : null,
            schools:
              isAdmin || isManager
                ? []
                : tables.schools.map((s) => ({ id: s.id, name: s.name })),
          },
        ]);
      if (table === "siep_staff_accounts")
        return isAdmin
          ? response(
              route,
              tables.institution_memberships.map((m) => ({
                ...m,
                email: user.email,
              })),
            )
          : response(route, { code: "42501", message: "denied" }, 403);
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
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        };
        tables[table].push(row);
        return response(route, row, 201);
      }
      if (method === "PATCH") {
        const id = url.searchParams.get("id")?.replace("eq.", "");
        const row = tables[table].find((r) => r.id === id);
        Object.assign(row, body);
        if (table === "events") row.configuration_version++;
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
  assert.equal(await page.getByRole("button", { name: "Abrir demonstração local" }).count(), 0);
  await page.goto("http://localhost:5173/demonstracao");
  await page.getByRole("heading", { name: "Acessar o SIEP" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/entrar");
  await page.getByRole("button", { name: "Esqueci minha senha" }).click();
  await page.getByLabel(/^(E-mail|CPF ou e-mail)$/).fill(user.email);
  await page.getByRole("button", { name: "Enviar instruções" }).click();
  await page
    .getByText(
      "Se houver uma conta para este endereço, você receberá as instruções de recuperação.",
    )
    .waitFor();
  assert.equal(resetRedirect, "http://localhost:5173/?recovery=1");
  await page.getByRole("button", { name: "Voltar ao acesso" }).click();
  await page.getByLabel(/^(E-mail|CPF ou e-mail)$/).fill(user.email);
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
  await page
    .getByRole("tab", { name: "Formulário e documentos", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Adicionar documento", exact: true })
    .click();
  await page.getByLabel("Documento 1", { exact: true }).fill("Foto");
  await page
    .getByRole("button", {
      name: "Salvar formulário e documentos",
      exact: true,
    })
    .click();
  await page
    .getByText("Configuração salva no banco.", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Editar informações do evento", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .locator('select[name="status"]')
    .selectOption("Inscrições abertas");
  await page
    .getByRole("button", { name: "Salvar evento", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  for (const name of [
    "Visão geral",
    "Atletas",
    "Comissão técnica",
    "Inscrições",
    "Relatórios",
    "Notificações",
  ])
    assert.equal(
      await page.getByRole("button", { name, exact: true }).count(),
      1,
      "Menu ausente: " + name,
    );
  await page.getByRole("button", { name: "Atletas", exact: true }).click();
  await page
    .getByRole("button", { name: "Cadastrar atleta", exact: true })
    .click();
  await page
    .getByLabel("Nome completo *", { exact: true })
    .fill("Atleta conectado");
  await page.getByLabel("CPF *", { exact: true }).fill("52998224725");
  await page
    .getByLabel("Data de nascimento *", { exact: true })
    .fill("2012-01-01");
  await page.locator('select[name="gender"]').selectOption("Feminino");
  await page
    .getByRole("dialog")
    .locator('select[name="schoolId"]')
    .selectOption(tables.schools[0].id);
  await page
    .getByRole("button", { name: "Salvar atleta", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Atleta conectado", exact: true })
    .waitFor();
  assert.equal(tables.people.length, 1);
  await page
    .getByRole("button", { name: "Comissão técnica", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cadastrar profissional", exact: true })
    .click();
  await page
    .getByLabel("Nome completo *", { exact: true })
    .fill("Atleta conectado");
  await page.getByLabel("CPF *", { exact: true }).fill("52998224725");
  await page
    .getByLabel("Data de nascimento *", { exact: true })
    .fill("2012-01-01");
  await page.locator('select[name="gender"]').selectOption("Feminino");
  await page
    .getByRole("dialog")
    .locator('select[name="schoolId"]')
    .selectOption(tables.schools[0].id);
  await page.locator('select[name="position"]').selectOption("Técnico");
  await page
    .getByRole("button", { name: "Salvar profissional", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(tables.people.length, 1, "Profissão duplicou pessoa");
  assert.equal(
    await page.getByText("Área de trabalho:", { exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "Escolas", exact: true }).click();
  await page.getByRole("button", { name: "Acompanhar", exact: true }).click();
  await page
    .getByRole("button", { name: "Trabalhar neste evento", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Trocar evento", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Atletas da escola", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Editar Atleta conectado", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /Futsal · 12 a 14 anos/ }).check();
  await page.getByLabel("Anexar Foto", { exact: true }).setInputFiles({
    name: "foto.png",
    mimeType: "image/png",
    buffer: Buffer.from("fake-image"),
  });
  await page
    .getByRole("button", { name: "Concluir cadastro", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.getByText("Cadastro completo", { exact: true }).waitFor();
  assert.equal(
    tables.participant_documents.filter((d) => d.status === "uploaded").length,
    1,
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem("siep-athletes")),
    null,
  );
  await page
    .getByRole("button", { name: "Inscrições da escola", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Nova inscrição neste evento", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("combobox")
    .first()
    .selectOption(tables.event_categories[0].id);
  await page
    .getByLabel("Atleta 1", { exact: true })
    .selectOption(tables.event_participations[0].id);
  await page
    .getByRole("button", { name: "Salvar rascunho no banco", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(tables.registrations.length, 1);
  await page
    .getByRole("button", { name: "Enviar para análise", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.getByRole("cell", { name: "Enviada", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "← Escolas da instituição", exact: true })
    .click();
  await page.getByRole("button", { name: "Inscrições", exact: true }).click();
  await page.getByRole("button", { name: "Aprovar", exact: true }).click();
  await page.getByLabel("Justificativa *", { exact: true }).fill("Conferido");
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.getByRole("cell", { name: "Aprovada", exact: true }).waitFor();
  await page.getByRole("button", { name: "Relatórios", exact: true }).click();
  await page
    .getByRole("button", { name: "Exportar inscrições em CSV", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Notificações", exact: true }).click();
  await page
    .getByText("Nenhuma notificação recebida.", { exact: true })
    .waitFor();
  const retainedPath = new URL(page.url()).pathname;
  await page.reload();
  await page
    .getByRole("heading", { name: "Notificações da minha conta", exact: true })
    .waitFor();
  assert.equal(new URL(page.url()).pathname, retainedPath);
  await page.getByRole("button", { name: "Visão geral", exact: true }).click();
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
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page.getByRole("button", { name: "Sair da conta" }).click();
  await page.getByRole("heading", { name: "Acessar o SIEP" }).waitFor();
  isAdmin = false;
  user.user_metadata = { role: "admin", is_admin: true };
  await page.getByLabel(/^(E-mail|CPF ou e-mail)$/).fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-de-teste-longa");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();

  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
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
  assert.ok(new URL(page.url()).pathname.startsWith("/escola/"));
  await page.goto(
    "http://localhost:5173/secretaria/" + tenant + "/instituicao",
  );
  await page
    .getByRole("heading", { name: "Acesso não autorizado", exact: true })
    .waitFor();
  await page.goto(
    "http://localhost:5173/escola/" +
      tenant +
      "/escolas/99999999-9999-4999-8999-999999999999/atletas",
  );
  await page
    .getByRole("heading", { name: "Acesso não autorizado", exact: true })
    .waitFor();
  await page.goto("http://localhost:5173/rota-inexistente");
  await page
    .getByRole("heading", { name: "Página não encontrada", exact: true })
    .waitFor();
  isManager = true;
  await page.goto("http://localhost:5173/secretaria/" + tenant + "/usuarios");
  await page
    .getByRole("heading", { name: "Acesso não autorizado", exact: true })
    .waitFor();
  await page.goto("http://localhost:5173/secretaria/" + tenant + "/eventos");
  await page
    .getByRole("button", { name: "Novo evento", exact: true })
    .waitFor();
  isAdmin = true;
  isManager = false;
  await page.goto("http://localhost:5173/secretaria/" + tenant + "/usuarios");
  await page
    .getByRole("heading", {
      name: "Usuários da Secretaria",
      level: 1,
      exact: true,
    })
    .waitFor();
  isAdmin = false;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByRole("heading", { name: "Acesso não autorizado", exact: true })
    .waitFor();
  await page.goto(
    "http://localhost:5173/entrar?retorno=https://example.invalid",
  );
  await page.getByRole("button", { name: "Abrir menu", exact: true }).waitFor();
  assert.equal(new URL(page.url()).origin, "http://localhost:5173");
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page
    .getByRole("button", { name: "Sair da conta", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Acessar o SIEP", exact: true })
    .waitFor();
  await page.goBack();
  await page.getByRole("button", { name: "Entrar", exact: true }).waitFor();
  assert.ok(new URL(page.url()).pathname.includes("entrar"));
  assert.equal(
    await page
      .getByRole("button", { name: "Cadastrar atleta", exact: true })
      .count(),
    0,
  );
  await page.goto("http://localhost:5173/secretaria/" + tenant + "/atletas");
  await page
    .getByRole("heading", { name: "Acessar o SIEP", exact: true })
    .waitFor();
  assert.equal(
    new URL(page.url()).searchParams.get("retorno"),
    "/secretaria/" + tenant + "/atletas",
  );
  await page.getByLabel(/^(E-mail|CPF ou e-mail)$/).fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-incorreta");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByText("E-mail ou senha inválidos.", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Novo evento", exact: true })
      .count(),
    0,
  );
  await page.goto("http://localhost:5173/redefinir-senha");
  await page
    .getByRole("heading", { name: "Recuperar acesso", exact: true })
    .waitFor();
  await page
    .getByText(
      "O link de recuperação expirou ou já foi utilizado. Solicite novas instruções.",
      { exact: true },
    )
    .waitFor();
  await page.goto('http://localhost:5173/escola/entrar');
  await page.getByLabel(/^(E-mail|CPF ou e-mail)$/).fill(user.email);
  await page.getByLabel('Senha',{exact:true}).fill('senha-de-teste-longa');
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await page.getByRole('button',{name:'Abrir menu',exact:true}).waitFor();
  await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.startsWith('sb-')&&key.endsWith('-auth-token'));const session=JSON.parse(localStorage.getItem(key));session.expires_at=1;session.refresh_token='expired-test';localStorage.setItem(key,JSON.stringify(session));});
  await page.reload();
  await page.getByRole('button',{name:'Entrar',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Cadastrar atleta',exact:true}).count(),0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: navegação completa, login/recuperação, escola, atleta/profissional sem duplicação, documento privado, cadastro na edição, inscrição, envio, aprovação, relatórios, notificações, recarga, permissões, mobile e demo preservada; URLs, recarga, acesso negado, gestor/admin, vínculo escolar, revogação, logout/voltar e redirect seguro; API simulada.",
  );
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
