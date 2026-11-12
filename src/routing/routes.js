import { matchPath } from "react-router-dom";
const secretary = [
  ["painel", "Visão geral"],
  ["eventos", "Eventos"],
  ["escolas", "Escolas"],
  ["responsaveis", "Responsáveis"],
  ["atletas", "Atletas"],
  ["comissao-tecnica", "Comissão técnica"],
  ["inscricoes", "Inscrições"],
  ["relatorios", "Relatórios"],
  ["notificacoes", "Notificações"],
  ["instituicao", "Instituição", "admin"],
  ["usuarios", "Usuários da Secretaria", "admin"],
  ["competicoes", "Competições"],
  ["inscricoes-publicas", "Inscrições públicas"],
];
const school = [
  ["painel", "Visão geral"],
  ["eventos", "Eventos disponíveis"],
  ["atletas", "Atletas"],
  ["comissao-tecnica", "Comissão técnica"],
  ["inscricoes", "Minhas inscrições"],
  ["notificacoes", "Notificações"],
  ["dados", "Dados da escola"],
];
export const eventTabs = {
  overview: "visao-geral",
  sports: "modalidades",
  rules: "regras",
  requirements: "formulario",
  functions: "funcoes",
};
export const routeDefinitions = [];
function addArea(area, base, pages, extra = {}) {
  for (const [slug, page, role] of pages) {
    routeDefinitions.push({
      path: base + "/" + slug,
      area,
      page,
      role: role || null,
      ...extra,
    });
  }
}
addArea("secretaria", "/secretaria/:tenantId", secretary);
addArea("escola", "/escola/:tenantId/escolas/:schoolId", school);
addArea(
  "secretaria",
  "/secretaria/:tenantId/escolas/:schoolId/acompanhamento",
  school,
  { schoolContext: true },
);
for (const [tab, slug] of Object.entries(eventTabs))
  routeDefinitions.push({
    path: "/secretaria/:tenantId/eventos/:eventId/" + slug,
    area: "secretaria",
    page: "Eventos",
    tab,
  });
routeDefinitions.push({
  path: "/secretaria/:tenantId/eventos/:eventId",
  area: "secretaria",
  page: "Eventos",
  tab: "overview",
});
for (const [slug, page] of [
  ["atletas", "Atletas"],
  ["comissao-tecnica", "Comissão técnica"],
  ["responsaveis", "Responsáveis"],
]) {
  routeDefinitions.push({
    path: "/secretaria/:tenantId/" + slug + "/novo",
    area: "secretaria",
    page,
    action: "new",
  });
  routeDefinitions.push({
    path: "/secretaria/:tenantId/" + slug + "/:recordId/editar",
    area: "secretaria",
    page,
    action: "edit",
  });
  if (slug !== "responsaveis") {
    for (const [area, base, schoolContext] of [
      ["escola", "/escola/:tenantId/escolas/:schoolId", false],
      [
        "secretaria",
        "/secretaria/:tenantId/escolas/:schoolId/acompanhamento",
        true,
      ],
    ]) {
      routeDefinitions.push({
        path: base + "/" + slug + "/novo",
        area,
        page,
        action: "new",
        schoolContext,
      });
      routeDefinitions.push({
        path: base + "/" + slug + "/:recordId/editar",
        area,
        page,
        action: "edit",
        schoolContext,
      });
    }
  }
}
export const publicPaths = [
  "/",
  "/entrar",
  "/secretaria/entrar",
  "/escola/entrar",
  "/cadastro",
  "/secretaria/cadastro",
  "/escola/cadastro",
  "/recuperar-senha",
  "/redefinir-senha",
  "/acesso-pendente",
  "/acesso-negado",
];
export function resolveRoute(path) {
  for (const definition of routeDefinitions) {
    const match = matchPath({ path: definition.path, end: true }, path);
    if (match) return { ...definition, ...match.params };
  }
  return null;
}
export function portalPath(area, tenantId, page = "Visão geral", params = {}) {
  const item = routeDefinitions.find(
    (r) =>
      r.area === area &&
      r.page === page &&
      !!r.schoolContext === !!params.schoolContext &&
      !r.action &&
      !r.eventId &&
      !r.path.includes(":eventId"),
  );
  if (!item) throw Error("Página não registrada");
  let path = item.path
    .replace(":tenantId", encodeURIComponent(tenantId))
    .replace(":schoolId", encodeURIComponent(params.schoolId || ""));
  if (params.eventId)
    return (
      "/secretaria/" +
      encodeURIComponent(tenantId) +
      "/eventos/" +
      encodeURIComponent(params.eventId) +
      "/" +
      (eventTabs[params.tab] || eventTabs.overview)
    );
  if (params.action === "new") path += "/novo";
  if (params.action === "edit")
    path += "/" + encodeURIComponent(params.recordId) + "/editar";
  return path;
}
export function accessDecision(route, access) {
  const tenant = access.find((t) => t.id === route?.tenantId);
  if (!route || !tenant)
    return { allowed: false, reason: "Sem acesso a esta instituição." };
  if (route.area === "secretaria" && !tenant.staff_role)
    return { allowed: false, reason: "Esta área é exclusiva da Secretaria." };
  if (route.role === "admin" && tenant.staff_role !== "admin")
    return {
      allowed: false,
      reason: "Esta página exige administrador da instituição.",
    };
  if (
    route.area === "escola" &&
    !tenant.schools.some((s) => s.id === route.schoolId)
  )
    return {
      allowed: false,
      reason: "Sua conta precisa de vínculo aprovado com esta escola.",
    };
  return { allowed: true, tenant };
}
export function landingPath(access, area) {
  if (area !== "escola") {
    const tenant = access.find((t) => t.staff_role);
    if (tenant) return portalPath("secretaria", tenant.id);
  }
  if (area !== "secretaria") {
    const tenant = access.find((t) => t.schools.length);
    if (tenant)
      return portalPath("escola", tenant.id, "Visão geral", {
        schoolId: tenant.schools[0].id,
      });
  }
  return "/acesso-pendente";
}

routeDefinitions.unshift(
  {
    path: "/secretaria/:tenantId/eventos/novo",
    area: "secretaria",
    page: "Eventos",
    action: "newEvent",
  },
  {
    path: "/secretaria/:tenantId/eventos/:eventId/editar",
    area: "secretaria",
    page: "Eventos",
    action: "editEvent",
  },
  {
    path: "/secretaria/:tenantId/eventos/:eventId/duplicar",
    area: "secretaria",
    page: "Eventos",
    action: "duplicateEvent",
  },
);
export function safeReturn(value) {
  try {
    const url = new URL(value, "https://siep.local");
    if (url.origin !== "https://siep.local" || !resolveRoute(url.pathname))
      return null;
    return url.pathname;
  } catch {
    return null;
  }
}

for (const [area, base, schoolContext] of [
  ["secretaria", "/secretaria/:tenantId", false],
  ["escola", "/escola/:tenantId/escolas/:schoolId", false],
  [
    "secretaria",
    "/secretaria/:tenantId/escolas/:schoolId/acompanhamento",
    true,
  ],
]) {
  for (const [suffix, action] of [
    ["editar", "editRegistration"],
    ["historico", "registrationHistory"],
  ])
    routeDefinitions.push({
      path: base + "/inscricoes/:registrationId/" + suffix,
      area,
      page:
        area === "escola" || schoolContext ? "Minhas inscrições" : "Inscrições",
      schoolContext,
      action,
    });
  if (area === "escola" || schoolContext)
    routeDefinitions.push({
      path: base + "/inscricoes/nova",
      area,
      page: "Minhas inscrições",
      schoolContext,
      action: "newRegistration",
    });
}
