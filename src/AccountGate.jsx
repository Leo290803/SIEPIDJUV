import React, { lazy, useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, Link } from "react-router-dom";
import { resolveRoute, publicPaths } from "./routing/routes.js";
import { supabase, readableError } from "./data/client.js";
const ConnectedApp = lazy(() => import("./ConnectedApp.jsx"));
import logo from "../Gemini_Generated_Image_wvkarowvkarowvka-removebg-preview.png";
export default function AccountGate({ Demo }) {
  const routeLocation = useLocation(),
    navigate = useNavigate(),
    epoch = useRef(0);
  const entryArea = routeLocation.pathname.startsWith("/secretaria")
    ? "secretaria"
    : routeLocation.pathname.startsWith("/escola")
      ? "escola"
      : ["secretaria", "escola"].includes(
            new URLSearchParams(routeLocation.search).get("area"),
          )
        ? new URLSearchParams(routeLocation.search).get("area")
        : "";
  const entryPath = entryArea ? "/" + entryArea + "/entrar" : "/entrar";
  const authMode = routeLocation.pathname.endsWith("/cadastro")
    ? "signup"
    : routeLocation.pathname === "/recuperar-senha"
      ? "reset"
      : routeLocation.pathname === "/redefinir-senha"
        ? "password"
        : "login";
  const [session, setSession] = useState(null),
    [ready, setReady] = useState(false),
    [demo, setDemo] = useState(false),
    [mode, setMode] = useState(
      new URLSearchParams(location.search).get("recovery") === "1"
        ? "password"
        : authMode,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    const initialEpoch = epoch.current;
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (active && epoch.current === initialEpoch) {
          setSession(data.session);
          setReady(true);
          if (error) setError(readableError(error));
        }
      })
      .catch((error) => {
        if (active) {
          setError(readableError(error));
          setReady(true);
        }
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event !== "INITIAL_SESSION") epoch.current++;
      setSession(session);
      if (event === "PASSWORD_RECOVERY") {
        setMode("password");
        navigate("/redefinir-senha", { replace: true });
      }
      if (event === "SIGNED_OUT") setMode("login");
      setReady(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (ready && mode === "password" && !session) {
      setMode("reset");
      navigate("/recuperar-senha", { replace: true });
      setError(
        "O link de recuperação expirou ou já foi utilizado. Solicite novas instruções.",
      );
    }
  }, [ready, mode, session]);
  useEffect(() => {
    setMode(authMode);
    setError((current) =>
      authMode === "reset" &&
      current.startsWith("O link de recuperação expirou")
        ? current
        : "",
    );
    setMessage("");
  }, [authMode]);
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(e.currentTarget),
      email = String(form.get("email") || "").trim(),
      password = String(form.get("password") || "");
    try {
      let response;
      if (mode === "login")
        response = await supabase.auth.signInWithPassword({ email, password });
      if (mode === "signup") {
        response = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: location.origin + "/",
            data: { display_name: form.get("name") },
          },
        });
        if (!response.error)
          setMessage(
            "Confira seu e-mail para confirmar a conta. O acesso à instituição depende de vínculo aprovado.",
          );
      }
      if (mode === "reset") {
        response = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin + "/?recovery=1",
        });
        if (!response.error)
          setMessage(
            "Se houver uma conta para este endereço, você receberá as instruções de recuperação.",
          );
      }
      if (mode === "password") {
        response = await supabase.auth.updateUser({ password });
        if (!response.error) {
          navigate("/", { replace: true });
          setMode("login");
          setMessage("Senha atualizada.");
        }
      }
      if (response?.error) throw response.error;
    } catch (error) {
      setError(readableError(error));
    } finally {
      setBusy(false);
    }
  }
  if (routeLocation.pathname.length > 1 && routeLocation.pathname.endsWith("/"))
    return (
      <Navigate
        to={routeLocation.pathname.replace(/\/+$/, "") + routeLocation.search}
        replace
      />
    );
  if (routeLocation.pathname === "/demonstracao")
    return (
      <>
        <div className="demo-return">
          <button className="secondary" onClick={() => navigate("/entrar")}>
            Sair da demonstração e acessar minha conta
          </button>
        </div>
        <Demo />
      </>
    );
  if (!ready)
    return (
      <div className="account-shell">
        <p role="status">Verificando acesso…</p>
      </div>
    );
  if (session && mode !== "password" && authMode !== "password")
    return <ConnectedApp key={session.user.id} session={session} />;
  const isEntry = [
    "/",
    "/entrar",
    "/secretaria/entrar",
    "/escola/entrar",
    "/cadastro",
    "/secretaria/cadastro",
    "/escola/cadastro",
    "/recuperar-senha",
    "/redefinir-senha",
  ].includes(routeLocation.pathname);
  if (!session && !isEntry && routeLocation.pathname !== "/demonstracao") {
    if (
      resolveRoute(routeLocation.pathname) ||
      /^\/(secretaria|escola)\/[^/]+$/.test(routeLocation.pathname) ||
      ["/secretaria", "/escola", "/acesso-pendente", "/acesso-negado"].includes(
        routeLocation.pathname,
      )
    ) {
      const entry = routeLocation.pathname.startsWith("/secretaria")
        ? "/secretaria/entrar"
        : routeLocation.pathname.startsWith("/escola")
          ? "/escola/entrar"
          : "/entrar";
      return (
        <Navigate
          to={entry + "?retorno=" + encodeURIComponent(routeLocation.pathname)}
          replace
        />
      );
    }
    return (
      <div className="account-shell">
        <div className="account-card">
          <h1>Página não encontrada</h1>
          <Link to="/entrar">Acessar o sistema</Link>
        </div>
      </div>
    );
  }
  const titles = {
    login: routeLocation.pathname.startsWith("/secretaria")
      ? "Acesso da Secretaria"
      : routeLocation.pathname.startsWith("/escola")
        ? "Acesso da Escola"
        : "Acessar o SIEP",
    signup: "Criar minha conta",
    reset: "Recuperar acesso",
    password: "Definir nova senha",
  };
  return (
    <div className="account-shell">
      <div className="account-card">
        <img
          src={logo}
          alt="SIEP — Sistema de Inscrições em Eventos e Projetos"
        />
        <h1>{titles[mode]}</h1>
        {mode === "login" &&
          ["/", "/entrar"].includes(routeLocation.pathname) && (
            <div className="account-links">
              <Link to="/secretaria/entrar">Acesso da Secretaria</Link>
              <Link to="/escola/entrar">Acesso da Escola</Link>
            </div>
          )}
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            {mode === "signup" && (
              <label>
                Nome completo
                <input
                  name="name"
                  required
                  autoComplete="name"
                  maxLength={160}
                />
              </label>
            )}
            {mode !== "password" && (
              <label>
                E-mail
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
            )}
            {mode !== "reset" && (
              <label>
                {mode === "password" ? "Nova senha" : "Senha"}
                <input
                  name="password"
                  type="password"
                  required
                  minLength={mode === "login" ? 1 : 10}
                  maxLength={128}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                />
              </label>
            )}
            {mode === "signup" && (
              <p className="form-note">
                Use ao menos 10 caracteres. Confirme o endereço pelo link
                enviado ao seu e-mail.
              </p>
            )}
            {error && (
              <p className="school-error" role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className="school-success" role="status">
                {message}
              </p>
            )}
            <button type="submit" className="primary">
              {busy
                ? "Aguarde…"
                : mode === "reset"
                  ? "Enviar instruções"
                  : mode === "password"
                    ? "Salvar senha"
                    : mode === "signup"
                      ? "Criar conta"
                      : "Entrar"}
            </button>
          </fieldset>
        </form>
        <div className="account-links">
          {mode === "login" ? (
            <>
              <button
                className="text-btn"
                onClick={() => {
                  navigate(
                    "/recuperar-senha" +
                      (entryArea ? "?area=" + entryArea : ""),
                  );
                  setError("");
                  setMessage("");
                }}
              >
                Esqueci minha senha
              </button>
              <button
                className="text-btn"
                onClick={() => {
                  navigate(
                    entryArea === "secretaria"
                      ? "/secretaria/cadastro"
                      : "/escola/cadastro",
                  );
                  setError("");
                  setMessage("");
                }}
              >
                Criar conta
              </button>
            </>
          ) : (
            <button
              className="text-btn"
              onClick={() => {
                navigate(entryPath);
                setError("");
                setMessage("");
              }}
            >
              Voltar ao acesso
            </button>
          )}
        </div>
        <hr />
        <p className="form-note">
          A demonstração mantém os cadastros anteriores neste navegador.
        </p>
        <button className="secondary" onClick={() => navigate("/demonstracao")}>
          Abrir demonstração local
        </button>
      </div>
    </div>
  );
}
