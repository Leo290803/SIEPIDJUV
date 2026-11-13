import test from "node:test";
import assert from "node:assert/strict";
import {
  routeDefinitions,
  resolveRoute,
  portalPath,
  accessDecision,
  landingPath,
  safeReturn,
} from "../src/routing/routes.js";
const admin = [{ id: "tenant-a", staff_role: "admin", schools: [] }];
const manager = [{ id: "tenant-a", staff_role: "manager", schools: [] }];
const school = [
  { id: "tenant-a", staff_role: null, schools: [{ id: "school-a" }] },
];
test("todas as rotas registradas têm caminho único e identificação de área", () => {
  assert.equal(
    new Set(routeDefinitions.map((r) => r.path)).size,
    routeDefinitions.length,
  );
  for (const route of routeDefinitions)
    assert.ok(["secretaria", "escola"].includes(route.area));
});
test("URLs de todos os menus resolvem para a área e página corretas", () => {
  for (const [area, pages] of [
    [
      "secretaria",
      [
        "Visão geral",
        "Eventos",
        "Escolas",
        "Responsáveis",
        "Atletas",
        "Comissão técnica",
        "Inscrições",
        "Relatórios",
        "Notificações",
        "Instituição",
        "Usuários da Secretaria",
      ],
    ],
    [
      "escola",
      [
        "Visão geral",
        "Eventos disponíveis",
        "Atletas",
        "Comissão técnica",
        "Minhas inscrições",
        "Notificações",
        "Dados da escola",
      ],
    ],
  ])
    for (const page of pages) {
      const path = portalPath(area, "tenant-a", page, { schoolId: "school-a" });
      const route = resolveRoute(path);
      assert.equal(route.page, page);
      assert.equal(route.area, area);
    }
});
test("gestor não acessa administração de usuários ou instituição", () => {
  for (const page of ["Instituição", "Usuários da Secretaria"]) {
    const route = resolveRoute(portalPath("secretaria", "tenant-a", page));
    assert.equal(accessDecision(route, manager).allowed, false);
    assert.equal(accessDecision(route, admin).allowed, true);
  }
});
test("administrador sem vínculo escolar não vira responsável ao trocar URL", () => {
  const route = resolveRoute(
    portalPath("escola", "tenant-a", "Atletas", { schoolId: "school-a" }),
  );
  assert.equal(accessDecision(route, admin).allowed, false);
  assert.equal(accessDecision(route, school).allowed, true);
});
test("responsável não entra na Secretaria nem em outra escola/instituição", () => {
  assert.equal(
    accessDecision(resolveRoute("/secretaria/tenant-a/painel"), school).allowed,
    false,
  );
  for (const path of [
    "/escola/tenant-a/escolas/school-b/atletas",
    "/escola/tenant-b/escolas/school-a/painel",
  ])
    assert.equal(accessDecision(resolveRoute(path), school).allowed, false);
});
test("acompanhamento administrativo fica dentro da Secretaria", () => {
  const path = portalPath("secretaria", "tenant-a", "Atletas", {
    schoolId: "school-a",
    schoolContext: true,
  });
  const route = resolveRoute(path);
  assert.equal(route.schoolContext, true);
  assert.equal(route.area, "secretaria");
  assert.equal(accessDecision(route, admin).allowed, true);
  assert.equal(accessDecision(route, school).allowed, false);
});
test("cadastro, edição e abas têm URLs próprias sem confundir novo com ID", () => {
  assert.equal(
    resolveRoute("/secretaria/tenant-a/eventos/novo").action,
    "newEvent",
  );
  assert.equal(
    resolveRoute("/secretaria/tenant-a/atletas/id/editar").recordId,
    "id",
  );
  assert.equal(
    resolveRoute("/secretaria/tenant-a/eventos/event-a/regras").tab,
    "rules",
  );
  assert.equal(
    resolveRoute("/secretaria/tenant-a/inscricoes/reg-a/historico")
      .registrationId,
    "reg-a",
  );
});
test("redirecionamento de login aceita apenas páginas internas registradas", () => {
  for (const value of [
    "https://example.org",
    "//example.org",
    "/\\example.org",
    "javascript:alert(1)",
    "/pagina-inexistente",
  ])
    assert.equal(safeReturn(value), null);
  assert.equal(
    safeReturn("/secretaria/tenant-a/atletas"),
    "/secretaria/tenant-a/atletas",
  );
  assert.equal(resolveRoute("/qualquer-coisa"), null);
});
test("destino inicial depende dos vínculos aprovados recebidos do banco", () => {
  assert.equal(landingPath(admin), "/secretaria/tenant-a/painel");
  assert.equal(landingPath(school), "/escola/tenant-a/escolas/school-a/painel");
  assert.equal(landingPath([], undefined), "/acesso-pendente");
  assert.equal(landingPath(admin, "escola"), "/acesso-pendente");
});

test("crachás pertencem à Secretaria, com gestor autorizado e escola recusada",()=>{
 const route=resolveRoute("/secretaria/tenant-a/crachas");
 assert.equal(route.page,"Crachás");
 assert.equal(accessDecision(route,manager).allowed,true);
 assert.equal(accessDecision(route,school).allowed,false);
 assert.equal(portalPath("secretaria","tenant-a","Crachás"),"/secretaria/tenant-a/crachas");
});
