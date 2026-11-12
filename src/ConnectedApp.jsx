import React, { useEffect, useMemo, useState } from "react";
import {
  Navigate,
  useLocation,
  useNavigate,
  matchPath,
} from "react-router-dom";
import { supabase, readableError } from "./data/client.js";
import { repositories } from "./data/repositories.js";
import { PendingAccess } from "./ConnectedForms.jsx";
import InstitutionPortal from "./InstitutionPortal.jsx";
import AccessState from "./routing/AccessState.jsx";
import {
  accessDecision,
  landingPath,
  portalPath,
  publicPaths,
  resolveRoute,
  safeReturn,
} from "./routing/routes.js";
export default function ConnectedApp({ session }) {
  const repo = useMemo(() => repositories(supabase), []),
    location = useLocation(),
    navigate = useNavigate();
  const [access, setAccess] = useState([]),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    supabase
      .rpc("siep_my_access")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) throw error;
        setAccess(data || []);
        setReady(true);
      })
      .catch((error) => {
        if (active) {
          setError(readableError(error));
          setReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, [revision, session.user.id]);
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) setRevision((n) => n + 1);
    };
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 60000);
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, []);
  if (!ready)
    return (
      <div className="account-shell">
        <p role="status">Verificando permissões…</p>
      </div>
    );
  if (error)
    return (
      <div className="account-shell">
        <div className="account-card">
          <h1>Não foi possível verificar o acesso</h1>
          <p role="alert">{error}</p>
          <button className="primary" onClick={() => setRevision((v) => v + 1)}>
            Tentar novamente
          </button>
          <button
            className="text-btn"
            onClick={() => supabase.auth.signOut({ scope: "local" })}
          >
            Sair da conta
          </button>
        </div>
      </div>
    );
  const path = location.pathname,
    route = resolveRoute(path);
  if (path === "/acesso-pendente")
    return (
      <div className="account-shell">
        <div className="account-pending">
          <PendingAccess
            institutionSlug={new URLSearchParams(location.search).get("instituicao")?.trim().toLowerCase() || "idjuv"}
            onRefresh={() => setRevision((v) => v + 1)}
          />
          {access.length > 0 && (
            <button
              className="secondary"
              onClick={() => navigate(landingPath(access))}
            >
              Ir para minha área autorizada
            </button>
          )}
          <button
            className="text-btn"
            onClick={() => supabase.auth.signOut({ scope: "local" })}
          >
            Sair da conta
          </button>
        </div>
      </div>
    );
  if (path === "/acesso-negado") return <AccessState access={access} />;
  if (!route) {
    const rootArea =
      path === "/secretaria"
        ? "secretaria"
        : path === "/escola"
          ? "escola"
          : null;
    const alias =
      !publicPaths.includes(path) &&
      (matchPath("/secretaria/:tenantId", path) ||
        matchPath("/escola/:tenantId", path));
    if (publicPaths.includes(path) || rootArea || alias) {
      const requested = safeReturn(
        new URLSearchParams(location.search).get("retorno"),
      );
      if (requested && path.includes("entrar"))
        return <Navigate to={requested} replace />;
      const area =
        rootArea ||
        (alias
          ? path.split("/")[1]
          : path.startsWith("/escola/")
            ? "escola"
            : path.startsWith("/secretaria/")
              ? "secretaria"
              : undefined);
      const allowed = alias
        ? access.filter((t) => t.id === alias.params.tenantId)
        : access;
      const target = landingPath(allowed, area);
      if (target === "/acesso-pendente" && access.length > 0 && (area || alias))
        return (
          <AccessState
            access={access}
            message="Sua conta não possui vínculo aprovado para esta área ou instituição."
          />
        );
      return <Navigate to={target} replace />;
    }
    return <AccessState kind="missing" access={access} />;
  }
  const decision = accessDecision(route, access);
  if (!decision.allowed)
    return <AccessState access={access} message={decision.reason} />;
  const institution = decision.tenant;
  return (
    <InstitutionPortal
      key={route.area + ":" + institution.id + ":" + (route.schoolId || "")}
      session={session}
      route={route}
      institution={institution}
      institutions={access.filter((t) =>
        route.area === "secretaria" ? !!t.staff_role : t.schools.length > 0,
      )}
      onTenant={(id) =>
        navigate(
          landingPath(
            access.filter((t) => t.id === id),
            route.area,
          ),
        )
      }
      onInstitutionChanged={() => setRevision((v) => v + 1)}
      membership={
        institution.staff_role ? { role: institution.staff_role } : undefined
      }
      repo={repo}
    />
  );
}
