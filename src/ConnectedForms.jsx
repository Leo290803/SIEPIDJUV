import React, { useState, useEffect } from "react";
import { supabase, readableError } from "./data/client.js";
export function PendingAccess({ onRefresh }) {
  const [schools, setSchools] = useState([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [searched, setSearched] = useState(false);
  async function search(e) {
    e.preventDefault();
    const slug = new FormData(e.currentTarget).get("slug").trim().toLowerCase();
    setBusy(true);
    setError("");
    setSchools([]);
    setSearched(false);
    try {
      const { data, error } = await supabase.rpc("siep_school_directory", {
        p_institution_slug: slug,
      });
      if (error) throw error;
      setSchools(data || []);
      setSearched(true);
    } catch (error) {
      setError(readableError(error));
    } finally {
      setBusy(false);
    }
  }
  async function request(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const f = new FormData(e.currentTarget);
      const { error } = await supabase.rpc("siep_request_school_link", {
        p_school_id: f.get("school"),
        p_data: {
          full_name: f.get("name").trim(),
          birth_date: f.get("birth"),
          cpf: f.get("cpf"),
          gender: f.get("gender"),
        },
      });
      if (error) throw error;
      setMessage("Solicitação enviada. O acesso será liberado após aprovação da Secretaria.");
    } catch (error) {
      setError(readableError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="school-access-card" aria-labelledby="school-access-title">
      <div className="school-access-heading">
        <span className="school-access-eyebrow">SIEP · ACESSO DA ESCOLA</span>
        <h1 id="school-access-title">{message ? "Aguarde a aprovação" : "Vincule sua conta à escola"}</h1>
        <p>Sua conta está conectada. Para acessar a área escolar, solicite um vínculo como responsável. A Secretaria precisa aprovar esse acesso.</p>
      </div>
      {message ? (
        <div className="school-access-confirmation" role="status">
          <span className="school-access-status">Solicitação enviada</span>
          <h2>Agora é com a Secretaria</h2>
          <p>{message}</p>
          <p>Depois da aprovação, clique em <strong>Atualizar meu acesso</strong> para entrar na área da escola.</p>
        </div>
      ) : (
        <>
          <section className="school-access-step" aria-labelledby="school-search-title">
            <div className="school-access-step-title"><span aria-hidden="true">1</span><div><h2 id="school-search-title">Encontre sua escola</h2><p>Primeiro, informe a instituição responsável pelo evento.</p></div></div>
            <form onSubmit={search} className="school-access-search">
              <label htmlFor="institution-code">Código da instituição
                <input id="institution-code" name="slug" defaultValue="idjuv" required autoCapitalize="none" spellCheck={false} aria-describedby="institution-code-help" onChange={() => { setSchools([]); setSearched(false); setError(""); }} />
                <small id="institution-code-help">Para o IDJUV, use <strong>idjuv</strong>. O nome da escola será escolhido abaixo.</small>
              </label>
              <button className="secondary" disabled={busy}>{busy ? "Aguarde…" : "Pesquisar escolas"}</button>
            </form>
            {searched && schools.length === 0 && <p className="school-access-empty" role="status">Nenhuma escola disponível para este código. Confira a instituição ou peça à Secretaria para verificar o cadastro da escola.</p>}
          </section>
          {schools.length > 0 && (
            <section className="school-access-step" aria-labelledby="school-responsible-title">
              <div className="school-access-step-title"><span aria-hidden="true">2</span><div><h2 id="school-responsible-title">Identifique o responsável</h2><p>Selecione a escola e preencha seus dados pessoais.</p></div></div>
              <form onSubmit={request}>
                <fieldset disabled={busy} className="school-access-fields">
                  <legend className="sr-only">Dados para solicitar vínculo escolar</legend>
                  <label className="school-access-wide">Escola
                    <select name="school" required defaultValue=""><option value="" disabled>Selecione sua escola</option>{schools.map(s => <option key={s.id} value={s.id}>{s.name}{s.inep ? " · " + s.inep : ""}</option>)}</select>
                  </label>
                  <label className="school-access-wide">Nome completo do responsável<input name="name" required autoComplete="name" maxLength={160} /></label>
                  <label>CPF<input name="cpf" required inputMode="numeric" placeholder="000.000.000-00" maxLength={14} /></label>
                  <label>Data de nascimento<input name="birth" type="date" required /></label>
                  <label className="school-access-wide">Sexo<select name="gender" required defaultValue=""><option value="" disabled>Selecione</option><option>Masculino</option><option>Feminino</option></select></label>
                  <div className="school-access-submit school-access-wide"><p>O envio solicita acesso apenas à escola selecionada.</p><button className="primary" disabled={busy}>{busy ? "Enviando…" : "Solicitar vínculo"}</button></div>
                </fieldset>
              </form>
            </section>
          )}
        </>
      )}
      {error && <p className="school-error school-access-error" role="alert">{error}</p>}
      <footer className="school-access-footer"><div><strong>Já teve seu vínculo aprovado?</strong><p>Atualize para verificar a liberação do acesso.</p></div><button className="secondary" onClick={onRefresh} disabled={busy}>Atualizar meu acesso</button></footer>
      <details className="school-access-help"><summary>Preciso de acesso à Secretaria</summary><p>Peça a um administrador da instituição para vincular sua conta confirmada à equipe da Secretaria. O formulário acima é destinado a responsáveis escolares.</p></details>
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
