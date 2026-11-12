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
  const entryPath = "/entrar";
  const authMode = routeLocation.pathname === "/recuperar-senha"
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
      if (mode === "login") {
        if (email.includes("@")) response = await supabase.auth.signInWithPassword({ email, password });
        else {
          const { data, error } = await supabase.functions.invoke("cpf-login", { body: { cpf: email, password } });
          if (error || data?.error) throw Error(data?.error || "CPF ou senha inválidos, ou limite de tentativas atingido. Tente novamente mais tarde.");
          response = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
        }
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
  if (["/secretaria/entrar", "/escola/entrar"].includes(routeLocation.pathname)) return <Navigate to={"/entrar" + routeLocation.search} replace />;
  if (routeLocation.pathname.endsWith("/cadastro")) return <Navigate to={entryPath} replace />;
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
    login: "Acessar o SIEP",
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
        {mode === "login" && <p className="form-note">Entre com seu CPF ou e-mail e senha. O sistema abrirá a área autorizada para sua conta.</p>}
        {mode === "reset" && <p className="form-note">Acesso por CPF: procure a Secretaria para obter ajuda. Esta recuperação por e-mail atende contas que já usam e-mail.</p>}
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            {mode !== "password" && (
              <label>
                {mode === "login" ? "CPF ou e-mail" : "E-mail"}
                <input
                  name="email"
                  type={mode === "login" ? "text" : "email"}
                  required
                  autoComplete={mode === "login" ? "username" : "email"}
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
                    "/recuperar-senha",
                  );
                  setError("");
                  setMessage("");
                }}
              >
                Esqueci minha senha
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
