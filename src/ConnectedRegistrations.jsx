import React, { useEffect, useState } from "react";
import { X, Plus, ClipboardList } from "lucide-react";
import {
  registrationStatusLabel,
  issueMessages,
} from "./data/peopleMapping.js";
import { readableError } from "./data/client.js";
export function RegistrationEditor({
  event,
  school,
  registration,
  data,
  api,
  onSaved,
  onClose,
}) {
  const [categoryId, setCategoryId] = useState(registration?.category_id || ""),
    [proofId, setProofId] = useState(registration?.proof_id || ""),
    [slots, setSlots] = useState(() =>
      Object.fromEntries(
        data.allocations
          .filter((a) => a.registration_id === registration?.id)
          .map((a) => [a.slot_number, a.participation_id]),
      ),
    ),
    [staff, setStaff] = useState(() =>
      Object.fromEntries(
        data.registrationStaff
          .filter((a) => a.registration_id === registration?.id)
          .map((a) => [a.person_id, a.staff_role_id]),
      ),
    ),
    [eligible, setEligible] = useState([]),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [issues, setIssues] = useState([]);
  const category = event.categories.find((c) => c.id === categoryId),
    proof = category?.proofs?.find((p) => p.id === proofId);
  const capacity = proof ? proof.slotsPerSchool : category?.max || 1;
  const n = Number.isInteger(capacity) ? Math.min(capacity, 1000) : 0;
  const other = data.allocations.filter(
    (a) =>
      a.active &&
      a.event_id === event.id &&
      a.school_id === school.id &&
      a.proof_id === proofId &&
      a.registration_id !== registration?.id,
  );
  const professionals = data.staff.filter(
    (p) =>
      p.schoolId === school.id &&
      !p.archived &&
      event.staffFunctions.includes(p.position),
  );
  useEffect(() => {
    let active = true;
    setError("");
    setEligible([]);
    if (!categoryId || ((category?.proofs || []).length && !proofId)) return;
    setLoading(true);
    api
      .eligible(event.id, school.id, categoryId, proofId, registration?.id)
      .then((rows) => {
        if (active) setEligible(rows);
      })
      .catch((error) => {
        if (active) setError(readableError(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, event.id, school.id, categoryId, proofId, registration?.id]);
  const input = () => ({
    p_event_id: event.id,
    p_school_id: school.id,
    p_category_id: categoryId,
    p_proof_id: proofId || null,
    p_athletes: Object.entries(slots)
      .filter(([, id]) => id)
      .map(([slot, id]) => ({
        participation_id: id,
        slot_number: Number(slot),
      })),
    p_staff: Object.entries(staff)
      .filter(([, role]) => role)
      .map(([person_id, staff_role_id]) => ({ person_id, staff_role_id })),
    p_registration_id: registration?.id || null,
    p_expected_revision: registration?.revision || null,
  });
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.saveRegistration(input());
      await onSaved(result);
      onClose();
    } catch (error) {
      setError(readableError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <div
        className="modal athlete-event-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Inscrição no evento"
      >
        <button
          className="close"
          aria-label="Fechar inscrição"
          disabled={busy}
          onClick={onClose}
        >
          <X />
        </button>
        <h2>Inscrição · {event.name}</h2>
        <p>
          {school.name} ·{" "}
          {registration ? "Continuar inscrição" : "Novo rascunho"}
        </p>
        <form onSubmit={submit}>
          <fieldset className="form-fields" disabled={busy}>
            <label>
              Modalidade e categoria *
              <select
                required
                value={categoryId}
                disabled={!!registration}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setProofId("");
                  setSlots({});
                  setIssues([]);
                }}
              >
                <option value="">Selecione</option>
                {event.categories
                  .filter((c) => c.enabled !== false || c.id === categoryId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.modality} · {c.name}
                    </option>
                  ))}
              </select>
            </label>
            {category?.proofs?.length > 0 && (
              <label>
                Prova *
                <select
                  required
                  value={proofId}
                  disabled={!!registration}
                  onChange={(e) => {
                    setProofId(e.target.value);
                    setSlots({});
                    setIssues([]);
                  }}
                >
                  <option value="">Selecione</option>
                  {category.proofs
                    .filter((p) => p.enabled !== false || p.id === proofId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.type}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {category && (!category.proofs.length || proofId) && (
              <>
                <h3>Atletas da escola</h3>
                {loading && <p role="status">Consultando atletas elegíveis…</p>}
                {!n && (
                  <p className="school-error">
                    A secretaria precisa configurar as vagas da prova antes de
                    preencher as inscrições.
                  </p>
                )}
                {n > 0 && (
                  <p className="form-note">
                    {proof
                      ? `${n} vagas por escola nesta prova.`
                      : `Máximo de ${n} atletas nesta categoria.`}{" "}
                    {proof?.type === "Revezamento"
                      ? "O mínimo do revezamento é verificado separadamente."
                      : category.type === "Individual"
                        ? "Cada inscrição individual recebe um atleta; as demais posições podem ficar em outras inscrições."
                        : ""}
                  </p>
                )}
                {Array.from({ length: n }, (_, i) => i + 1).map((number) => {
                  const occupied = other.find((a) => a.slot_number === number);
                  const existing = slots[number];
                  const options = eligible.filter(
                    (a) =>
                      !Object.entries(slots).some(
                        ([s, id]) =>
                          Number(s) !== number && id === a.participation_id,
                      ),
                  );
                  const old =
                    existing &&
                    !options.some((a) => a.participation_id === existing);
                  return (
                    <label key={number}>
                      Atleta {number}
                      {occupied ? (
                        <input
                          disabled
                          value={
                            data.athletes.find(
                              (a) => a.personId === occupied.person_id,
                            )?.name || "Vaga selecionada em outra inscrição"
                          }
                        />
                      ) : (
                        <select
                          aria-label={`Atleta ${number}`}
                          disabled={loading}
                          value={existing || ""}
                          onChange={(e) =>
                            setSlots({ ...slots, [number]: e.target.value })
                          }
                        >
                          <option value="">Vaga não preenchida</option>
                          {old && (
                            <option value={existing}>
                              {data.athletes.find(
                                (a) =>
                                  a.eventProfiles[event.id]?.participationId ===
                                  existing,
                              )?.name ||
                                "Atleta indisponível — revise o cadastro"}
                            </option>
                          )}
                          {options.map((a) => (
                            <option
                              key={a.participation_id}
                              value={a.participation_id}
                            >
                              {a.full_name}
                            </option>
                          ))}
                        </select>
                      )}
                    </label>
                  );
                })}
                {!loading && !eligible.length && (
                  <p className="info-box">
                    Nenhum atleta elegível disponível. Confira o cadastro
                    completo no evento, nascimento, sexo, documentos e regras.
                  </p>
                )}
                <h3>Comissão técnica</h3>
                {professionals.map((p) => (
                  <label key={p.id} className="checkbox">
                    <input
                      type="checkbox"
                      checked={!!staff[p.personId]}
                      onChange={(e) =>
                        setStaff({
                          ...staff,
                          [p.personId]: e.target.checked
                            ? event._staffRoles.find(
                                (r) => r.name === p.position && r.enabled,
                              )?.id || ""
                            : "",
                        })
                      }
                    />
                    {p.name} · {p.position}
                  </label>
                ))}
                {Object.keys(staff)
                  .filter(
                    (id) =>
                      staff[id] &&
                      !professionals.some((p) => p.personId === id),
                  )
                  .map((id) => (
                    <label key={id} className="checkbox">
                      <input
                        type="checkbox"
                        checked
                        onChange={() => setStaff({ ...staff, [id]: "" })}
                      />
                      Profissional indisponível — remover seleção
                    </label>
                  ))}
                {!professionals.length && (
                  <p className="form-note">
                    Nenhum profissional ativo com função habilitada neste
                    evento.
                  </p>
                )}
              </>
            )}
            {issues.length > 0 && (
              <div className="participation-issues">
                <strong>Pendências da prévia</strong>
                <ul>
                  {issueMessages(issues, event).map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            )}
            {error && (
              <p className="school-error" role="alert">
                {error}
              </p>
            )}
            <p className="form-note">
              Salvar rascunho preserva pendências para correção. Enviar para
              análise exige resolver todas as pendências.
            </p>
            <div className="school-form-footer">
              <button
                type="button"
                className="secondary"
                disabled={!categoryId || loading}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    setIssues((await api.preview(input())).issues);
                  } catch (error) {
                    setError(readableError(error));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Verificar pendências
              </button>
              <button
                className="primary"
                type="submit"
                disabled={!categoryId || loading}
              >
                Salvar rascunho no banco
              </button>
            </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
}
export default function ConnectedRegistrations({
  events,
  schools,
  data,
  api,
  tenant,
  school,
  event,
  manager,
  onChanged,
  routeAction,
  routeRegistrationId,
  onRoute,
}) {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [eventFilter, setEventFilter] = useState(""),
    [editing, setEditing] = useState(null),
    [starting, setStarting] = useState(false),
    [decision, setDecision] = useState(null),
    [history, setHistory] = useState(null),
    [warnings, setWarnings] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!onRoute) return;
    let active = true;
    setStarting(routeAction === "newRegistration");
    setEditing(
      routeAction === "editRegistration"
        ? data.registrations.find((r) => r.id === routeRegistrationId)
        : null,
    );
    setHistory(null);
    if (routeAction === "registrationHistory") {
      const r = data.registrations.find((r) => r.id === routeRegistrationId);
      if (r) {
        setBusy(true);
        api
          .history(tenant, r.id)
          .then((result) => {
            if (active) setHistory({ r, ...result });
          })
          .catch((error) => {
            if (active) setError(readableError(error));
          })
          .finally(() => {
            if (active) setBusy(false);
          });
      }
    }
    return () => {
      active = false;
    };
  }, [routeAction, routeRegistrationId]);
  const closeRoute = () => {
    setEditing(null);
    setStarting(false);
    setHistory(null);
    onRoute?.(null);
  };
  const rows = data.registrations.filter(
    (r) =>
      (!school || r.school_id === school.id) &&
      (!event || r.event_id === event.id) &&
      (!eventFilter || r.event_id === eventFilter) &&
      (status === "all" || r.status === status) &&
      [
        events.find((e) => e.id === r.event_id)?.name,
        schools.find((s) => s.id === r.school_id)?.name,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const ev = (r) => events.find((e) => e.id === r.event_id),
    sc = (r) => schools.find((s) => s.id === r.school_id);
  function actions(r) {
    return [
      ...(["draft", "correction_requested"].includes(r.status)
        ? [["Enviar para análise", "submitted"]]
        : []),
      ...(manager && r.status === "submitted"
        ? [
            ["Aprovar", "approved"],
            ["Solicitar correção", "correction_requested"],
            ["Indeferir", "rejected"],
          ]
        : []),
      ...(["draft", "submitted", "correction_requested"].includes(r.status) ||
      (manager && r.status === "approved")
        ? [["Cancelar inscrição", "cancelled"]]
        : []),
    ];
  }
  return (
    <section>
      {warnings && (
        <div className="participation-issues" role="status">
          <strong>Rascunho salvo com pendências</strong>
          <ul>
            {issueMessages(warnings.issues, warnings.event).map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
          <p>Corrija antes de enviar para análise.</p>
        </div>
      )}
      {error && (
        <p className="school-error" role="alert">
          {error}
        </p>
      )}
      <div className="panel">
        <div className="table-toolbar">
          <span className="record-count">{rows.length} inscrições</span>
          <div className="school-tools">
            <label className="search">
              <input
                aria-label="Buscar inscrições"
                placeholder="Evento ou escola"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {!event && (
              <select
                aria-label="Evento das inscrições"
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
              >
                <option value="">Todos os eventos</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            )}
            <select
              aria-label="Situação das inscrições"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">Todas as situações</option>
              {Object.entries(registrationStatusLabel).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            {school && event && (
              <button
                className="primary"
                onClick={() => (onRoute ? onRoute({}) : setStarting(true))}
              >
                <Plus size={16} />
                Nova inscrição neste evento
              </button>
            )}
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Evento / escola</th>
                <th>Modalidade / categoria / prova</th>
                <th>Atletas</th>
                <th>Situação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const category = ev(r)?.categories.find(
                    (c) => c.id === r.category_id,
                  ),
                  proof = category?.proofs.find((p) => p.id === r.proof_id);
                return (
                  <tr key={r.id}>
                    <td>
                      <strong>{ev(r)?.name || "Evento"}</strong>
                      <div>{sc(r)?.name}</div>
                    </td>
                    <td>
                      {category?.modality} · {category?.name}
                      {proof && <div>{proof.name}</div>}
                    </td>
                    <td>
                      {
                        data.allocations.filter(
                          (a) => a.registration_id === r.id,
                        ).length
                      }
                    </td>
                    <td>
                      <span
                        className={
                          "tag " +
                          (r.status === "approved"
                            ? "live"
                            : r.status === "correction_requested"
                              ? "warning"
                              : "draft")
                        }
                      >
                        {registrationStatusLabel[r.status]}
                      </span>
                    </td>
                    <td>
                      <div className="staff-actions">
                        {["draft", "correction_requested"].includes(
                          r.status,
                        ) && (
                          <button
                            className="secondary"
                            onClick={() =>
                              onRoute ? onRoute({ id: r.id }) : setEditing(r)
                            }
                          >
                            Continuar
                          </button>
                        )}
                        <button
                          className="secondary"
                          onClick={async () => {
                            if (onRoute) {
                              onRoute({ id: r.id, history: true });
                              return;
                            }
                            setBusy(true);
                            setError("");
                            try {
                              setHistory({
                                r,
                                ...(await api.history(tenant, r.id)),
                              });
                            } catch (error) {
                              setError(readableError(error));
                            } finally {
                              setBusy(false);
                            }
                          }}
                          disabled={busy}
                        >
                          Detalhes e histórico
                        </button>
                        {actions(r).map(([label, value]) => (
                          <button
                            className="secondary"
                            key={value}
                            onClick={() =>
                              setDecision({ r, status: value, label })
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td className="table-empty" colSpan={5}>
                    Nenhuma inscrição encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {(starting || editing) && (
        <RegistrationEditor
          key={editing?.id || "new"}
          event={editing ? ev(editing) : event}
          school={editing ? sc(editing) : school}
          registration={editing}
          data={data}
          api={api}
          onClose={closeRoute}
          onSaved={async (result) => {
            await onChanged();
            setWarnings(
              result?.issues?.length
                ? {
                    issues: result.issues,
                    event: editing ? ev(editing) : event,
                  }
                : null,
            );
          }}
        />
      )}
      {decision && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={decision.label}
          >
            <h2>{decision.label}</h2>
            <p>
              {ev(decision.r)?.name} · {sc(decision.r)?.name}
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                setBusy(true);
                setError("");
                const f = new FormData(e.currentTarget);
                try {
                  await api.transition(
                    decision.r,
                    decision.status,
                    f.get("reason").trim(),
                    f.get("deadline")
                      ? new Date(f.get("deadline")).toISOString()
                      : null,
                  );
                  await onChanged();
                  setWarnings(null);
                  setDecision(null);
                } catch (error) {
                  let issues = [];
                  try {
                    issues = JSON.parse(error.details || "[]");
                  } catch {}
                  setError(
                    issues.length
                      ? issueMessages(issues, ev(decision.r)).join(" ")
                      : readableError(error),
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <fieldset className="form-fields" disabled={busy}>
                <label>
                  Justificativa *
                  <input
                    name="reason"
                    required
                    maxLength={1000}
                    defaultValue={
                      decision.status === "submitted"
                        ? "Envio para análise"
                        : ""
                    }
                  />
                </label>
                {decision.status === "correction_requested" && (
                  <label>
                    Prazo para correção *
                    <input name="deadline" type="datetime-local" required />
                  </label>
                )}
                {error && (
                  <p className="school-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="school-form-footer">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setDecision(null)}
                  >
                    Voltar
                  </button>
                  <button className="primary">Confirmar</button>
                </div>
              </fieldset>
            </form>
          </div>
        </div>
      )}
      {history && (
        <div className="modal-backdrop">
          <div
            className="modal athlete-event-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Histórico da inscrição"
          >
            <button
              className="close"
              aria-label="Fechar histórico"
              onClick={closeRoute}
            >
              <X />
            </button>
            <h2>Histórico da inscrição</h2>
            <p>
              {ev(history.r)?.name} · {sc(history.r)?.name}
            </p>
            {history.versions
              .sort((a, b) => b.revision - a.revision)
              .map((version) => (
                <details className="panel" key={version.id}>
                  <summary>
                    Versão {version.revision} ·{" "}
                    {registrationStatusLabel[version.status]} ·{" "}
                    {new Date(version.created_at).toLocaleString("pt-BR")}
                  </summary>
                  <h3>Atletas</h3>
                  {version.snapshot.athletes?.map((a) => (
                    <p key={a.person.id}>
                      {a.person.full_name} · Vaga {a.allocation.slot_number}
                    </p>
                  ))}
                  <h3>Comissão técnica</h3>
                  {version.snapshot.staff?.map((s) => (
                    <p key={s.person.id}>{s.person.full_name}</p>
                  ))}
                </details>
              ))}
            {history.decisions
              .sort((a, b) => a.created_at.localeCompare(b.created_at))
              .map((d) => (
                <p key={d.id}>
                  {new Date(d.created_at).toLocaleString("pt-BR")} ·{" "}
                  {registrationStatusLabel[d.to_status]}: {d.reason}
                </p>
              ))}
          </div>
        </div>
      )}
    </section>
  );
}
