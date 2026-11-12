import React, { lazy, useEffect, useState } from "react";
import { supabase, readableError } from "./data/client.js";
const ConnectedApp = lazy(() => import("./ConnectedApp.jsx"));
import logo from "../Gemini_Generated_Image_wvkarowvkarowvka-removebg-preview.png";
export default function AccountGate({ Demo }) {
  const [session, setSession] = useState(null),
    [ready, setReady] = useState(false),
    [demo, setDemo] = useState(false),
    [mode, setMode] = useState(
      new URLSearchParams(location.search).get("recovery") === "1"
        ? "password"
        : "login",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (active) {
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
      setSession(session);
      if (event === "PASSWORD_RECOVERY") setMode("password");
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
      setError(
        "O link de recuperação expirou ou já foi utilizado. Solicite novas instruções.",
      );
    }
  }, [ready, mode, session]);
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
          history.replaceState(null, "", location.pathname);
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
  if (demo)
    return (
      <>
        <div className="demo-return">
          <button className="secondary" onClick={() => setDemo(false)}>
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
  if (session && mode !== "password")
    return <ConnectedApp key={session.user.id} session={session} />;
  const titles = {
    login: "Acessar o SIEP",
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
                  setMode("reset");
                  setError("");
                  setMessage("");
                }}
              >
                Esqueci minha senha
              </button>
              <button
                className="text-btn"
                onClick={() => {
                  setMode("signup");
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
                setMode("login");
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
        <button className="secondary" onClick={() => setDemo(true)}>
          Abrir demonstração local
        </button>
      </div>
    </div>
  );
}
