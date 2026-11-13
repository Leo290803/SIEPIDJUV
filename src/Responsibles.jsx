import PersonPhoto from "./PersonPhoto.jsx";
import PersonIdentityFields from "./PersonIdentityFields.jsx";
import { personDataIssues, normalizeCpf } from "./personData.js";
import React, { useState, useEffect } from "react";
import { Users, Plus, Search, Check, X } from "lucide-react";
import { initialSchools } from "./Schools.jsx";
export const initialResponsibles = [
  "Mariana Oliveira",
  "Carlos Henrique",
  "Juliana Santos",
].map((name, i) => ({
  id: String(i),
  name,
  schoolId: String(i),
  school: initialSchools[i].name,
  position: "Responsável escolar",
  email: "",
  phone: "",
  status: "Pendente",
  example: true,
  history: [],
}));
export function readResponsibles() {
  try {
    const s = JSON.parse(localStorage.getItem("siep-responsibles"));
    return Array.isArray(s) ? s : initialResponsibles;
  } catch {
    return initialResponsibles;
  }
}
export default function Responsibles({
  records,
  onChange,
  schools: providedSchools,
  onPersist,
  onDecide,
  onProvision,
  connected = false,
  routeAction,
  routeRecordId,
  onOpenRecord,
  onCloseRecord,
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("Todos"),
    [form, setForm] = useState(false),
    [action, setAction] = useState(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false), [accessResult, setAccessResult] = useState(null);
  let schools;
  try {
    const saved = JSON.parse(localStorage.getItem("siep-schools"));
    schools =
      providedSchools || (Array.isArray(saved) ? saved : initialSchools);
  } catch {
    schools = providedSchools || initialSchools;
  }
  useEffect(() => {
    if (!onOpenRecord) return;
    if (routeAction === "new") setForm({});
    else if (routeAction === "edit")
      setForm(records.find((r) => r.id === routeRecordId) || false);
    else setForm(false);
    setError("");
  }, [routeAction, routeRecordId]);
  const [photoChange, setPhotoChange] = useState(undefined);
  useEffect(() => setPhotoChange(undefined), [routeAction, routeRecordId]);
  const closeRecord = () => {
    setPhotoChange(undefined);
    setForm(false);
    onCloseRecord?.();
  };
  const persist = async (next, entry, options) => {
    try {
      if (onPersist) await onPersist(entry, options);
      else {
        localStorage.setItem("siep-responsibles", JSON.stringify(next));
        onChange(next);
      }
      setError("");
      return true;
    } catch (error) {
      setError(
        onPersist
          ? error.message
          : "Não foi possível salvar no navegador. Tente novamente.",
      );
      return false;
    }
  };
  const normalize = (s) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const schoolName = (r) =>
    schools.find((s) => s.id === r.schoolId)?.name || r.school;
  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    const f = Object.fromEntries(new FormData(e.currentTarget));
    for (const k of Object.keys(f)) f[k] = f[k].trim();
    if (!f.name || !f.position) {
      setError("Informe o nome e o cargo.");
      return;
    }
    f.cpf = normalizeCpf(f.cpf);
    const coreIssues = personDataIssues(f);
    if (coreIssues.length) {
      setError(coreIssues.join(" "));
      return;
    }
    if (
      records.some(
        (r) => r.id !== form.id && r.schoolId === f.schoolId && r.cpf === f.cpf,
      )
    ) {
      setError("Este CPF já tem cadastro de responsável nesta escola.");
      return;
    }
    const school = schools.find(
      (s) => s.id === f.schoolId && (!s.archived || form.schoolId === s.id),
    );
    if (!school) {
      setError("Selecione uma escola ativa.");
      return;
    }
    if (
      f.email &&
      records.some(
        (r) =>
          r.id !== form.id &&
          r.schoolId === f.schoolId &&
          (r.email || "").toLowerCase() === f.email.toLowerCase() &&
          ["Pendente", "Aprovado"].includes(r.status),
      )
    ) {
      setError(
        "Este e-mail já possui um vínculo ativo ou pendente com esta escola.",
      );
      return;
    }
    const date = new Date().toISOString();
    const record = {
      ...form,
      ...f,
      id: form.id || crypto.randomUUID(),
      school: school.name,
      status: form.status || "Pendente",
      history: form.history || [
        { date, status: "Pendente", reason: "Cadastro criado" },
      ],
    };
    setBusy(true);
    if (
      await persist(
        form.id
          ? records.map((r) => (r.id === form.id ? record : r))
          : [...records, record],
        record,
        { photo: photoChange },
      )
    ) {
      closeRecord();
      setMessage(
        form.id
          ? "Dados do responsável atualizados."
          : connected ? "Responsável cadastrado. Confira a escola e use Gerar acesso." : "Responsável cadastrado. O vínculo aguarda análise.",
      );
    }
    setBusy(false);
  };
  const decide = async (e) => {
    e.preventDefault();
    if (busy) return;
    const reason = new FormData(e.currentTarget).get("reason").trim();
    const school = schools.find((s) => s.id === action.record.schoolId);
    if (connected && action.status === "Aprovado" && !action.record.userId) {
      setError(
        "A conta ainda não está vinculada. Use Gerar acesso para cadastrar a conta deste responsável.",
      );
      return;
    }
    if (
      action.status === "Aprovado" &&
      personDataIssues(action.record).length
    ) {
      setError(
        "Use Editar para completar nome, nascimento, CPF e sexo antes de aprovar o vínculo.",
      );
      return;
    }
    if (action.status === "Aprovado" && (!school || school.archived)) {
      setError(
        "Não é possível aprovar vínculo com escola arquivada ou indisponível.",
      );
      return;
    }
    if (action.status !== "Aprovado" && !reason) {
      setError("Informe uma justificativa.");
      return;
    }
    if (connected) {
      setBusy(true);
      try {
        await onDecide(action.record, action.status, reason);
        setAction(null);
        setMessage("Situação do vínculo atualizada.");
      } catch (error) {
        setError(error.message);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (
      await persist(
        records.map((r) =>
          r.id === action.record.id
            ? {
                ...r,
                status: action.status,
                history: [
                  ...(r.history || []),
                  {
                    date: new Date().toISOString(),
                    status: action.status,
                    reason: reason || "Vínculo aprovado",
                  },
                ],
              }
            : r,
        ),
      )
    ) {
      setAction(null);
      setMessage("Situação do vínculo atualizada.");
    }
  };
  const shown = records.filter(
    (r) =>
      (filter === "Todos" || r.status === filter) &&
      normalize([r.name, r.cpf, r.email, schoolName(r)].join(" ")).includes(
        normalize(query),
      ),
  );
  return (
    <section>
      {message && (
        <div className="school-success" role="status">
          <Check size={16} />
          {message}
        </div>
      )}
      {accessResult && <div className="panel access-credentials" role="status">
        <button className="text-btn" onClick={() => setAccessResult(null)}>Fechar dados do acesso</button>
        <span className="eyebrow">ACESSO DO RESPONSÁVEL</span>
        <h2>{accessResult.school}</h2>
        <p>Usuário (CPF): <strong>{accessResult.username}</strong></p>
        {accessResult.created ? <><p>Senha inicial: <strong>{accessResult.initial_password}</strong></p><p>Entregue estes dados diretamente ao responsável. Nenhum e-mail foi enviado.</p></> : <p>A conta já existia. A senha atual foi preservada.</p>}
      </div>}
      <div className="panel">
        <div className="section-title">
          <span className="record-count">
            {shown.length} {shown.length === 1 ? "responsável" : "responsáveis"}
          </span>
          <div className="school-tools">
            <button
              className="primary"
              onClick={() => {
                if (onOpenRecord) onOpenRecord({});
                else setForm(true);
                setError("");
              }}
            >
              <Plus size={17} />
              Cadastrar responsável
            </button>
            <label className="search">
              <Search size={16} />
              <input
                aria-label="Buscar responsáveis"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nome, CPF, e-mail ou escola"
              />
            </label>
            <select
              aria-label="Situação dos vínculos"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              {["Todos", "Pendente", "Aprovado", "Recusado", "Encerrado"].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </select>
          </div>
        </div>
        {shown.map((r) => (
          <article className="school-row" key={r.id}>
            <span className="avatar pastel">
              {r.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div className="school-info">
              <h3>
                {r.name}{" "}
                {r.example && <span className="tag draft">Exemplo</span>}
              </h3>
              <p>{schoolName(r)}</p>
              <small>
                {[r.position, r.email, r.phone].filter(Boolean).join(" · ")}
              </small>
              {r.history?.length > 0 && (
                <details className="link-history">
                  <summary>Histórico do vínculo</summary>
                  {r.history.map((h, i) => (
                    <p key={i}>
                      {new Date(h.date).toLocaleString("pt-BR")} · {h.status}:{" "}
                      {h.reason}
                    </p>
                  ))}
                </details>
              )}
            </div>
            <span
              className={
                "tag " +
                (r.status === "Aprovado"
                  ? "live"
                  : r.status === "Pendente"
                    ? "warning"
                    : "draft")
              }
            >
              {r.status}
            </span>
            {personDataIssues(r).length > 0 && (
              <span className="tag warning">Completar dados</span>
            )}
            <div className="school-actions">
              <button
                className="secondary"
                aria-label={`Editar responsável ${r.name}`}
                onClick={() => {
                  if (onOpenRecord) onOpenRecord(r);
                  else setForm(r);
                  setError("");
                }}
              >
                Editar
              </button>
              {connected && onProvision && ["Pendente", "Aprovado"].includes(r.status) && !r.userId && <button className="primary" disabled={busy || !r.cpf || !r.birth} onClick={async () => {
                if (!window.confirm(`Gerar acesso de ${r.name}, CPF ${r.cpf}, à escola ${schoolName(r)}? A senha inicial será o ano de nascimento + os 4 últimos dígitos do CPF.`)) return;
                setBusy(true); setError(""); setMessage(""); setAccessResult(null);
                try { const result = await onProvision(r); setAccessResult(result); setMessage(`Acesso liberado para ${result.school}.`); }
                catch (error) { setError(error.message); }
                finally { setBusy(false); }
              }}>Gerar acesso</button>}
              {(r.status === "Pendente"
                ? [
                    ...(!connected || r.userId ? [["Aprovar", "Aprovado"]] : []),
                    ["Recusar", "Recusado"],
                  ]
                : r.status === "Aprovado"
                  ? [["Encerrar vínculo", "Encerrado"]]
                  : [["Reabrir análise", "Pendente"]]
              ).map(([label, status]) => (
                <button
                  key={status}
                  className="secondary"
                  aria-label={`${label} de ${r.name}`}
                  onClick={() => {
                    setAction({ record: r, status });
                    setError("");
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </article>
        ))}
        {!shown.length && (
          <div className="empty">
            Nenhum responsável encontrado para estes filtros.
          </div>
        )}
      </div>
      {form && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="responsible-title"
          >
            <button
              className="close"
              aria-label="Fechar cadastro"
              onClick={closeRecord}
            >
              <X />
            </button>
            <span className="eyebrow">VÍNCULO ESCOLAR</span>
            <h2 id="responsible-title">
              {form.id ? "Editar responsável" : "Cadastrar responsável"}
            </h2>
            <form onSubmit={save}>
              {connected && <PersonPhoto photo={form.photo} value={photoChange} onChange={setPhotoChange} disabled={busy} />}
              <label>
                Nome completo *
                <input
                  autoFocus
                  name="name"
                  required
                  maxLength={150}
                  defaultValue={form.name || ""}
                />
              </label>
              <PersonIdentityFields person={form} />
              <label>
                Pesquisar escola
                <input
                  type="search"
                  placeholder="Nome ou município"
                  onChange={(e) => {
                    const select = e.currentTarget.form.elements.schoolId;
                    const q = normalize(e.target.value);
                    for (const option of select.options) {
                      option.hidden =
                        !!option.value && !normalize(option.text).includes(q);
                    }
                  }}
                />
              </label>
              <label>
                Escola *
                <select
                  name="schoolId"
                  required
                  defaultValue={form.schoolId || ""}
                >
                  <option value="" disabled>
                    Selecione uma escola
                  </option>
                  {schools
                    .filter((s) => !s.archived || s.id === form.schoolId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.city}
                      </option>
                    ))}
                </select>
              </label>
              {!schools.some((s) => !s.archived) && (
                <p className="school-error">
                  Cadastre ou reative uma escola antes de continuar.
                </p>
              )}
              <label>
                Cargo ou função *
                <input
                  name="position"
                  required
                  defaultValue={form.position || ""}
                  maxLength={100}
                  placeholder="Ex.: Diretor, professor, coordenador"
                />
              </label>
              <div className="form-row">
                <label>
                  E-mail (opcional)
                  <input
                    name="email"
                    type="email"
                    maxLength={150}
                    defaultValue={form.email || ""}
                  />
                </label>
                <label>
                  Telefone
                  <input
                    name="phone"
                    type="tel"
                    maxLength={25}
                    defaultValue={form.phone || ""}
                  />
                </label>
              </div>
              <p className="form-note">
                O cadastro inicia com vínculo pendente de aprovação.
              </p>
              {error && (
                <p className="school-error" role="alert">
                  {error}
                </p>
              )}
              <div className="school-form-footer">
                <button
                  type="button"
                  className="secondary"
                  onClick={closeRecord}
                >
                  Cancelar
                </button>
                <button className="primary" type="submit" disabled={busy}>
                  Salvar responsável
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {action && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="decision-title"
          >
            <h2 id="decision-title">Atualizar vínculo</h2>
            <p>
              {action.record.name} · {schoolName(action.record)}
            </p>
            <p>
              Nova situação: <strong>{action.status}</strong>
            </p>
            <form onSubmit={decide}>
              <label>
                Justificativa{" "}
                {action.status !== "Aprovado" ? "*" : "(opcional)"}
                <input
                  name="reason"
                  required={action.status !== "Aprovado"}
                  maxLength={500}
                />
              </label>
              {error && (
                <p className="school-error" role="alert">
                  {error}
                </p>
              )}
              <div className="school-form-footer">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setAction(null)}
                >
                  Cancelar
                </button>
                <button className="primary" type="submit" disabled={busy}>
                  Confirmar alteração
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
