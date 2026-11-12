import React, { useState, useEffect } from "react";
import { supabase, readableError } from "./data/client.js";
export function PendingAccess({ onRefresh, institutionSlug = "idjuv" }) {
  const [schools, setSchools] = useState([]),
    [selectedId, setSelectedId] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [sentSchool, setSentSchool] = useState(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const selectedSchool = schools.find(s => s.id === selectedId);
  async function loadSchools() {
    setLoading(true);
    setError("");
    try {
      const { data, error } = await supabase.rpc("siep_school_directory", { p_institution_slug: institutionSlug });
      if (error) throw error;
      setSchools(data || []);
    } catch (error) { setError(readableError(error)); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    loadSchools();
    supabase.auth.getUser().then(({ data }) => {
      setName(current => current || data.user?.user_metadata?.display_name || "");
    }).catch(() => {});
  }, [institutionSlug]);
  async function request(e) {
    e.preventDefault();
    if (busy || !selectedSchool || !confirmed) return;
    const target = selectedSchool;
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.rpc("siep_request_school_access", { p_school_id: target.id, p_full_name: name.trim() });
      if (error) throw error;
      setSentSchool(target);
    } catch (error) { setError(readableError(error)); }
    finally { setBusy(false); }
  }
  function schoolSummary(school) {
    return <div className="school-access-selected"><span>ESCOLA ESCOLHIDA</span><strong>{school.name}</strong><small>Instituição: {institutionSlug.toUpperCase()}{school.inep ? " · INEP: " + school.inep : ""}</small></div>;
  }
  return (
    <section className="school-access-card" aria-labelledby="school-access-title">
      <div className="school-access-heading">
        <span className="school-access-eyebrow">SIEP · ACESSO DA ESCOLA</span>
        <h1 id="school-access-title">{sentSchool ? "Aguarde a aprovação" : "Solicite acesso à sua escola"}</h1>
        <p>{sentSchool ? "Seu pedido foi enviado à Secretaria para análise." : "Escolha sua escola e confira o nome antes de solicitar. O acesso depende da aprovação da Secretaria."}</p>
      </div>
      {sentSchool ? (
        <div className="school-access-confirmation" role="status">
          <span className="school-access-status">Solicitação enviada</span>
          {schoolSummary(sentSchool)}
          <p>Você solicitou acesso como responsável por esta escola. Depois da aprovação, clique em <strong>Atualizar meu acesso</strong>.</p>
        </div>
      ) : (
        <div className="school-access-step">
          {loading ? <p role="status">Carregando escolas…</p> : schools.length ? (
            <form onSubmit={request}>
              <fieldset disabled={busy} className="school-access-fields">
                <legend className="sr-only">Solicitação de acesso escolar</legend>
                <label className="school-access-wide" htmlFor="access-school">Qual é a sua escola?</label>
                <select className="school-access-wide" id="access-school" name="school" required value={selectedId} onChange={e => { setSelectedId(e.target.value); setConfirmed(false); setError(""); }}>
                  <option value="" disabled>Selecione a escola em que você atua</option>
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}{s.inep ? " · INEP " + s.inep : ""}</option>)}
                </select>
                <label className="school-access-wide">Nome completo do responsável<input name="name" required autoComplete="name" maxLength={160} value={name} onChange={e => setName(e.target.value)} /></label>
                {selectedSchool && <div className="school-access-wide" aria-live="polite">
                  {schoolSummary(selectedSchool)}
                  <label className="school-access-check"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>Confirmo que esta é a escola correta e quero solicitar acesso como responsável.</span></label>
                </div>}
                <div className="school-access-submit school-access-wide"><p>Confira a escola destacada antes de enviar.</p><button className="primary" disabled={busy || !selectedSchool || !confirmed}>{busy ? "Enviando…" : "Solicitar acesso à escola"}</button></div>
              </fieldset>
            </form>
          ) : <p className="school-access-empty">Nenhuma escola disponível para {institutionSlug.toUpperCase()}. Peça à Secretaria para verificar o cadastro da escola.</p>}
          {!loading && !schools.length && <button className="secondary" onClick={loadSchools}>Tentar carregar escolas novamente</button>}
        </div>
      )}
      {error && <p className="school-error school-access-error" role="alert">{error}</p>}
      <footer className="school-access-footer"><div><strong>Já teve seu vínculo aprovado?</strong><p>Atualize para verificar a liberação do acesso.</p></div><button className="secondary" onClick={onRefresh} disabled={busy}>Atualizar meu acesso</button></footer>
      <details className="school-access-help"><summary>Preciso de acesso à Secretaria</summary><p>Peça a um administrador da instituição para vincular sua conta confirmada à equipe da Secretaria.</p></details>
    </section>
  );
}
export function InstitutionForm({ institution, onSave }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="panel">
      <h2>Instituição</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            await onSave({
              ...institution,
              name: f.get("name").trim(),
              branding: {
                ...institution.branding,
                subtitle: f.get("subtitle").trim(),
              },
            });
          } catch (error) {
            setError(readableError(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <label>
            Nome
            <input
              name="name"
              defaultValue={institution.name}
              required
              maxLength={160}
            />
          </label>
          <label>
            Identificação complementar
            <input
              name="subtitle"
              defaultValue={institution.branding?.subtitle || ""}
              maxLength={160}
            />
          </label>
          {error && (
            <p role="alert" className="school-error">
              {error}
            </p>
          )}
          <button className="primary">Salvar instituição</button>
        </fieldset>
      </form>
    </div>
  );
}
export function EventForm({ event, onSave, onClose }) {
  const [newId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={event ? "Editar evento" : "Criar evento"}
      >
        <h2>{event ? "Editar evento" : "Criar evento"}</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const input = {
              ...event,
              id: event?.id || newId,
              ...Object.fromEntries(new FormData(e.currentTarget)),
            };
            if (input.end && (!input.start || input.end < input.start)) {
              setError("Confira o início e o fim das inscrições.");
              return;
            }
            setBusy(true);
            setError("");
            try {
              await onSave(input);
              onClose();
            } catch (error) {
              setError(readableError(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Nome do evento
              <input
                name="name"
                required
                maxLength={120}
                defaultValue={event?.name || ""}
              />
            </label>
            <div className="form-row">
              <label>
                Edição
                <input
                  name="year"
                  required
                  defaultValue={event?.year || String(new Date().getFullYear())}
                />
              </label>
              <label>
                Tipo
                <select
                  name="type"
                  defaultValue={event?.type || "Competição esportiva"}
                >
                  <option>Competição esportiva</option>
                  <option>Evento esportivo</option>
                  <option>Projeto social</option>
                  <option>Outro evento</option>
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                Início das inscrições
                <input
                  type="date"
                  name="start"
                  defaultValue={event?.start || ""}
                />
              </label>
              <label>
                Fim das inscrições
                <input type="date" name="end" defaultValue={event?.end || ""} />
              </label>
            </div>
            {event && (
              <label>
                Situação
                <select name="status" defaultValue={event.status}>
                  <option>Rascunho</option>
                  <option>Inscrições abertas</option>
                  <option>Encerrado</option>
                  <option>Arquivado</option>
                </select>
              </label>
            )}
            {error && (
              <p role="alert" className="school-error">
                {error}
              </p>
            )}
            <div className="school-form-footer">
              <button type="button" className="secondary" onClick={onClose}>
                Cancelar
              </button>
              <button className="primary">
                {busy ? "Salvando…" : "Salvar evento"}
              </button>
            </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
}
export function AccessRequests({ tenant, schools }) {
  const [rows, setRows] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function reload() {
    const { data, error } = await supabase
      .from("school_link_requests")
      .select("*")
      .eq("institution_id", tenant)
      .order("created_at");
    if (error) throw error;
    const links = await supabase
      .from("school_people")
      .select("*")
      .eq("institution_id", tenant)
      .eq("role", "responsible");
    if (links.error) throw links.error;
    setRows(
      data.map((r) => ({
        ...r,
        link: links.data.find((l) => l.id === r.school_person_id),
      })),
    );
  }
  useEffect(() => {
    reload().catch((e) => setError(readableError(e)));
  }, [tenant]);
  return (
    <div className="panel">
      <h2>Vínculos de responsáveis</h2>
      <p>
        Confira a identidade declarada e o vínculo com a escola antes de
        aprovar.
      </p>
      {error && (
        <p className="school-error" role="alert">
          {error}
        </p>
      )}
      {!rows.length && <p>Nenhuma solicitação recebida.</p>}
      {rows.map((row) => (
        <form
          key={row.id}
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              const { error } = await supabase.rpc("siep_decide_school_link", {
                p_link_id: row.school_person_id,
                p_status: f.get("status"),
                p_reason: f.get("reason").trim(),
              });
              if (error) throw error;
              await reload();
            } catch (error) {
              setError(readableError(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy}>
            <h3>
              {row.requested_identity.full_name} ·{" "}
              {schools.find((s) => s.id === row.link?.school_id)?.name}
            </h3>
            <p>
              CPF: {row.requested_identity.cpf} · Nascimento:{" "}
              {row.requested_identity.birth_date} ·{" "}
              {row.requested_identity.gender}
            </p>
            <p>
              Situação:{" "}
              {
                {
                  pending: "Pendente",
                  approved: "Aprovado",
                  refused: "Recusado",
                  closed: "Encerrado",
                }[row.link?.status]
              }
            </p>
            <label>
              Decisão
              <select name="status">
                {row.link?.status === "pending" ? (
                  <>
                    <option value="approved">Aprovar</option>
                    <option value="refused">Recusar</option>
                  </>
                ) : row.link?.status === "approved" ? (
                  <option value="closed">Encerrar vínculo</option>
                ) : (
                  <option value="pending">Reabrir para análise</option>
                )}
              </select>
            </label>
            <label>
              Justificativa
              <input name="reason" required maxLength={500} />
            </label>
            <button className="primary">Registrar decisão</button>
          </fieldset>
        </form>
      ))}
    </div>
  );
}
