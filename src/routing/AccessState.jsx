import React from "react";
import { Link } from "react-router-dom";
import { landingPath } from "./routes.js";
import { supabase } from "../data/client.js";
export default function AccessState({ kind = "denied", message, access = [] }) {
  return (
    <div className="account-shell">
      <div className="account-card">
        <h1>
          {kind === "missing"
            ? "Página não encontrada"
            : "Acesso não autorizado"}
        </h1>
        <p role="alert">
          {message ||
            (kind === "missing"
              ? "O endereço informado não corresponde a uma página do sistema."
              : "Sua conta não tem a permissão exigida para esta área.")}
        </p>
        <div className="account-links">
          <Link className="secondary" to={landingPath(access)}>
            Ir para minha área
          </Link>
          <button
            className="text-btn"
            onClick={() => supabase.auth.signOut({ scope: "local" })}
          >
            Sair da conta
          </button>
        </div>
      </div>
    </div>
  );
}
