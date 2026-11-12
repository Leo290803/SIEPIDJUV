import React, { useEffect, useState } from "react";
import { supabase, readableError } from "./data/client.js";
export default function StaffAccounts({ tenant }) {
  const [rows, setRows] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function reload() {
    const { data, error } = await supabase.rpc("siep_staff_accounts", {
      p_institution_id: tenant,
    });
    if (error) throw error;
    setRows(data || []);
  }
  useEffect(() => {
    reload().catch((error) => setError(readableError(error)));
  }, [tenant]);
  async function save(email, role, status) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error } = await supabase.rpc("siep_set_staff_account", {
        p_institution_id: tenant,
        p_email: email,
        p_role: role,
        p_status: status,
      });
      if (error) throw error;
      await reload();
      setMessage("Permissão da Secretaria atualizada.");
    } catch (error) {
      setError(readableError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel">
      <h2>Usuários da Secretaria</h2>
      <p>
        Administrador gerencia a instituição e os acessos. Gestor opera eventos,
        escolas e inscrições. Esta configuração não aprova vínculos de
        responsáveis escolares.
      </p>
      {error && (
        <p role="alert" className="school-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="school-success">
          {message}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          save(f.get("email"), f.get("role"), "approved");
        }}
      >
        <fieldset disabled={busy}>
          <div className="form-row">
            <label>
              E-mail da conta confirmada
              <input type="email" name="email" required />
            </label>
            <label>
              Papel
              <select name="role">
                <option value="manager">Gestor da Secretaria</option>
                <option value="admin">Administrador</option>
              </select>
            </label>
          </div>
          <button className="primary">Vincular à Secretaria</button>
        </fieldset>
      </form>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Conta</th>
              <th>Papel</th>
              <th>Situação</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.name || r.email}
                  <small>{r.name && r.email}</small>
                </td>
                <td>{r.role === "admin" ? "Administrador" : "Gestor"}</td>
                <td>
                  {r.status === "approved"
                    ? "Aprovado"
                    : r.status === "closed"
                      ? "Encerrado"
                      : "Pendente"}
                </td>
                <td>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      save(
                        r.email,
                        r.role,
                        r.status === "approved" ? "closed" : "approved",
                      )
                    }
                  >
                    {r.status === "approved"
                      ? "Encerrar acesso"
                      : "Aprovar acesso"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
