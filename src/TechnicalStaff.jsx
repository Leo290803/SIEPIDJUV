import PersonPhoto from "./PersonPhoto.jsx";
import PersonIdentityFields from "./PersonIdentityFields.jsx";
import { personDataIssues, normalizeCpf } from "./personData.js";
import React, { useState, useEffect } from "react";
import {
  Plus,
  Search,
  Check,
  X,
  Pencil,
  Archive,
  RotateCcw,
} from "lucide-react";
import { initialSchools } from "./Schools.jsx";

const functions = [
  "Técnico",
  "Auxiliar técnico",
  "Preparador físico",
  "Fisioterapeuta",
  "Médico",
  "Coordenador",
  "Outro",
];
const normalize = (text) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function readStaff() {
  try {
    const data = JSON.parse(localStorage.getItem("siep-staff"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
export default function TechnicalStaff({
  schoolId,
  records: providedRecords,
  schools: providedSchools,
  onPersist,
  connected = false,
  routeAction,
  routeRecordId,
  onOpenRecord,
  onCloseRecord,
}) {
  const [localRecords, setRecords] = useState(() =>
    providedRecords ? [] : readStaff(),
  );
  const records = providedRecords || localRecords;
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("active");
  const [schoolFilter, setSchoolFilter] = useState(schoolId || "");
  const [editing, setEditing] = useState(null);
  const [archiving, setArchiving] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
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
    if (routeAction === "new") setEditing(schoolId ? { schoolId } : {});
    else if (routeAction === "edit")
      setEditing(records.find((r) => r.id === routeRecordId) || null);
    else setEditing(null);
    setError("");
  }, [routeAction, routeRecordId]);
  const [photoChange, setPhotoChange] = useState(undefined);
  useEffect(() => setPhotoChange(undefined), [routeAction, routeRecordId]);
  const closeRecord = () => {
    setPhotoChange(undefined);
    setEditing(null);
    onCloseRecord?.();
  };
  const schoolName = (record) =>
    schools.find((s) => s.id === record.schoolId)?.name || record.school;
  const scoped = records.filter((r) => !schoolId || r.schoolId === schoolId);
  const shown = scoped.filter(
    (r) =>
      (!schoolFilter || r.schoolId === schoolFilter) &&
      (filter === "all" ||
        (filter === "archived" ? r.archived : !r.archived)) &&
      normalize(
        [r.name, r.position, r.email, r.registration, schoolName(r)].join(" "),
      ).includes(normalize(query)),
  );
  async function persist(next, entry, options) {
    try {
      if (onPersist) await onPersist(entry, options);
      else localStorage.setItem("siep-staff", JSON.stringify(next));
      setRecords(next);
      setError("");
      return true;
    } catch (error) {
      setError(
        onPersist
          ? error.message
          : "Não foi possível salvar no navegador. Verifique o espaço disponível e tente novamente.",
      );
      return false;
    }
  }
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    for (const key of Object.keys(data)) data[key] = data[key].trim();
    data.cpf = normalizeCpf(data.cpf);
    const coreIssues = personDataIssues(data);
    if (coreIssues.length) {
      setError(coreIssues.join(" "));
      return;
    }
    if (
      records.some(
        (r) =>
          r.id !== editing.id &&
          r.schoolId === data.schoolId &&
          r.cpf === data.cpf,
      )
    ) {
      setError("Este CPF já está cadastrado na comissão técnica desta escola.");
      return;
    }
    const school = schools.find((s) => s.id === data.schoolId);
    if (!data.name || !data.position) {
      setError("Informe o nome e a função do profissional.");
      return;
    }
    if (
      !school ||
      (school.archived && editing.schoolId !== school.id) ||
      (schoolId && data.schoolId !== schoolId)
    ) {
      setError("Selecione uma escola ativa desta área.");
      return;
    }
    if (
      data.email &&
      records.some(
        (r) =>
          r.id !== editing.id &&
          r.schoolId === data.schoolId &&
          r.email.toLowerCase() === data.email.toLowerCase(),
      )
    ) {
      setError(
        "Já existe um profissional com este e-mail nesta escola. Confira também os arquivados.",
      );
      return;
    }
    const entry = {
      ...editing,
      ...data,
      school: school.name,
      id: editing.id || crypto.randomUUID(),
      archived: editing.archived || false,
    };
    setBusy(true);
    if (
      await persist(
        editing.id
          ? records.map((r) => (r.id === editing.id ? entry : r))
          : [...records, entry],
        entry,
        { photo: photoChange },
      )
    ) {
      closeRecord();
      setMessage(
        connected
          ? "Profissional salvo no banco."
          : "Profissional salvo neste navegador.",
      );
    }
    setBusy(false);
  }
  function open(record) {
    if (onOpenRecord) {
      onOpenRecord(record);
      return;
    }
    setEditing(record);
    setError("");
    setMessage("");
  }
  async function toggleArchive() {
    if (busy) return;
    setBusy(true);
    const entry = { ...archiving, archived: !archiving.archived };
    if (
      await persist(
        records.map((r) => (r.id === archiving.id ? entry : r)),
        entry,
      )
    ) {
      setMessage(
        archiving.archived
          ? "Profissional reativado."
          : "Profissional arquivado. O cadastro foi preservado.",
      );
      setArchiving(null);
    }
    setBusy(false);
  }
  return (
    <section>
      {message && (
        <div className="school-success" role="status">
          <Check size={16} />
          {message}
        </div>
      )}
      <div className="panel">
        <div className="table-toolbar">
          <span className="record-count">
            {shown.length}{" "}
            {shown.length === 1 ? "profissional" : "profissionais"}
          </span>
          <div className="school-tools">
            <button
              className="primary"
              onClick={() => open(schoolId ? { schoolId } : {})}
            >
              <Plus size={17} />
              Cadastrar profissional
            </button>
            <label className="search">
              <Search size={16} />
              <input
                aria-label="Buscar profissionais"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nome, função ou registro"
              />
            </label>
            <select
              aria-label="Escola dos profissionais"
              disabled={!!schoolId}
              value={schoolFilter}
              onChange={(e) => setSchoolFilter(e.target.value)}
            >
              <option value="">Todas as escolas</option>
              {schools
                .filter((s) => !schoolId || s.id === schoolId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.archived ? " (arquivada)" : ""}
                  </option>
                ))}
            </select>
            <select
              aria-label="Situação dos profissionais"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="active">Ativos</option>
              <option value="archived">Arquivados</option>
              <option value="all">Todos</option>
            </select>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Profissional</th>
                {!schoolId && <th>Escola</th>}
                <th>Função</th>
                <th>Registro</th>
                <th>Contato</th>
                <th>Situação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                  </td>
                  {!schoolId && <td>{schoolName(r)}</td>}
                  <td>{r.position}</td>
                  <td>{r.registration || "—"}</td>
                  <td>
                    {r.email || "—"}
                    {r.phone && <div>{r.phone}</div>}
                  </td>
                  <td>
                    <span
                      className={
                        "tag " +
                        (r.archived
                          ? "draft"
                          : personDataIssues(r).length
                            ? "warning"
                            : "live")
                      }
                    >
                      {r.archived
                        ? "Arquivado"
                        : personDataIssues(r).length
                          ? "Completar dados"
                          : "Ativo"}
                    </span>
                  </td>
                  <td>
                    <div className="staff-actions">
                      <button
                        className="secondary"
                        aria-label={`Editar ${r.name}`}
                        onClick={() => open(r)}
                      >
                        <Pencil size={14} />
                        Editar
                      </button>
                      <button
                        className="secondary"
                        aria-label={`${r.archived ? "Reativar" : "Arquivar"} ${r.name}`}
                        onClick={() => {
                          setArchiving(r);
                          setError("");
                        }}
                      >
                        {r.archived ? (
                          <RotateCcw size={14} />
                        ) : (
                          <Archive size={14} />
                        )}{" "}
                        {r.archived ? "Reativar" : "Arquivar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!shown.length && (
                <tr>
                  <td colSpan={schoolId ? 6 : 7} className="table-empty">
                    Nenhum profissional encontrado. Cadastre um profissional ou
                    altere os filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {editing && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-title"
          >
            <button
              className="close"
              aria-label="Fechar cadastro"
              onClick={closeRecord}
            >
              <X />
            </button>
            <h2 id="staff-title">
              {editing.id ? "Editar profissional" : "Cadastrar profissional"}
            </h2>
            <p>Campos com * são obrigatórios.</p>
            <form onSubmit={save}>
              {connected && <PersonPhoto photo={editing.photo} value={photoChange} onChange={setPhotoChange} disabled={busy} />}
              <label>
                Nome completo *
                <input
                  autoFocus
                  name="name"
                  required
                  maxLength={150}
                  defaultValue={editing.name || ""}
                />
              </label>
              <PersonIdentityFields person={editing} />
              <label>
                Escola *
                <select
                  name="schoolId"
                  required
                  defaultValue={editing.schoolId || ""}
                >
                  <option value="" disabled>
                    Selecione uma escola
                  </option>
                  {schools
                    .filter(
                      (s) =>
                        (!schoolId || s.id === schoolId) &&
                        (!s.archived || s.id === editing.schoolId),
                    )
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.archived ? " (arquivada)" : ""}
                      </option>
                    ))}
                </select>
              </label>
              <div className="form-row">
                <label>
                  Função *
                  <select
                    name="position"
                    required
                    defaultValue={editing.position || ""}
                  >
                    <option value="" disabled>
                      Selecione a função
                    </option>
                    {functions.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Registro profissional (opcional)
                  <small className="field-help">
                    Informativo, sem verificação automática.
                  </small>
                  <input
                    name="registration"
                    maxLength={60}
                    defaultValue={editing.registration || ""}
                    placeholder="Ex.: CREF / UF"
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  E-mail (opcional)
                  <input
                    name="email"
                    type="email"
                    maxLength={150}
                    defaultValue={editing.email || ""}
                  />
                </label>
                <label>
                  Telefone (opcional)
                  <input
                    name="phone"
                    type="tel"
                    maxLength={25}
                    defaultValue={editing.phone || ""}
                  />
                </label>
              </div>
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
                  Salvar profissional
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {archiving && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-staff-title"
          >
            <h2 id="archive-staff-title">
              {archiving.archived ? "Reativar" : "Arquivar"} profissional?
            </h2>
            <p>
              {archiving.name} · {schoolName(archiving)}
            </p>
            <div className="info-box">
              O cadastro e as seleções em rascunhos anteriores serão
              preservados. Profissionais arquivados não estarão disponíveis para
              novas seleções.
            </div>
            {error && (
              <p className="school-error" role="alert">
                {error}
              </p>
            )}
            <div className="school-form-footer">
              <button className="secondary" onClick={() => setArchiving(null)}>
                Cancelar
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={toggleArchive}
              >
                Confirmar {archiving.archived ? "reativação" : "arquivamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
