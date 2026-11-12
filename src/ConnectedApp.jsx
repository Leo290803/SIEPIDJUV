import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  School,
  Settings,
  LogOut,
  Plus,
  Users,
} from "lucide-react";
import { supabase, readableError } from "./data/client.js";
import { repositories } from "./data/repositories.js";
import Schools from "./Schools.jsx";
import EventTable from "./EventTable.jsx";
import EventWorkspace from "./EventWorkspace.jsx";
import DuplicateEventDialog from "./DuplicateEventDialog.jsx";
import logo from "../Gemini_Generated_Image_wvkarowvkarowvka-removebg-preview.png";
function PendingAccess({ onRefresh }) {
  const [schools, setSchools] = useState([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function search(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { data, error } = await supabase.rpc("siep_school_directory", {
      p_institution_slug: new FormData(e.currentTarget).get("slug").trim(),
    });
    if (error) setError(readableError(error));
    else setSchools(data);
    setBusy(false);
  }
  async function request(e) {
    e.preventDefault();
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
      setMessage(
        "Solicitação enviada. O acesso será liberado após aprovação da secretaria.",
      );
    } catch (error) {
      setError(readableError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel">
      <h2>Acesso à instituição</h2>
      <p>
        Sua conta está conectada. O acesso aos dados depende de um vínculo
        aprovado. Se você é o primeiro administrador, confirme o e-mail
        reservado e atualize o acesso.
      </p>
      <button className="secondary" onClick={onRefresh}>
        Atualizar meu acesso
      </button>
      <h3>Sou responsável por uma escola</h3>
      <form onSubmit={search}>
        <label>
          Identificador da instituição
          <input name="slug" defaultValue="idjuv" required />
        </label>
        <button className="secondary" disabled={busy}>
          Pesquisar escolas
        </button>
      </form>
      {schools.length > 0 && (
        <form onSubmit={request}>
          <fieldset disabled={busy}>
            <label>
              Escola
              <select name="school" required>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.inep ? " · " + s.inep : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nome completo
              <input name="name" required />
            </label>
            <div className="form-row">
              <label>
                Nascimento
                <input name="birth" type="date" required />
              </label>
              <label>
                CPF
                <input name="cpf" required inputMode="numeric" />
              </label>
            </div>
            <label>
              Sexo
              <select name="gender" required>
                <option value="">Selecione</option>
                <option>Masculino</option>
                <option>Feminino</option>
              </select>
            </label>
            <button className="primary">Solicitar vínculo</button>
          </fieldset>
        </form>
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
    </div>
  );
}
function InstitutionForm({ institution, onSave }) {
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
function EventForm({ event, onSave, onClose }) {
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
function AccessRequests({ tenant, schools }) {
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
export default function ConnectedApp({ session }) {
  const repo = useMemo(() => repositories(supabase), []);
  const [institutions, setInstitutions] = useState([]),
    [memberships, setMemberships] = useState([]),
    [tenant, setTenant] = useState(""),
    [events, setEvents] = useState([]),
    [schools, setSchools] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [page, setPage] = useState("Eventos"),
    [eventId, setEventId] = useState(""),
    [form, setForm] = useState(null),
    [duplicate, setDuplicate] = useState(null),
    [saving, setSaving] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setEvents([]);
    setSchools([]);
    Promise.all([repo.institutions(), repo.memberships()])
      .then(async ([institutions, memberships]) => {
        if (!active) return;
        setInstitutions(institutions);
        setMemberships(memberships);
        const selected =
          institutions.find((i) => i.id === tenant)?.id ||
          institutions[0]?.id ||
          "";
        if (selected !== tenant) {
          setTenant(selected);
          return;
        }
        if (selected) {
          const [events, schools] = await Promise.all([
            repo.events(selected),
            repo.schools(selected),
          ]);
          if (active) {
            setEvents(events);
            setSchools(schools);
          }
        }
        if (active) setLoading(false);
      })
      .catch((error) => {
        if (active) {
          setError(readableError(error));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [repo, tenant, revision]);
  const institution = institutions.find((i) => i.id === tenant),
    membership = memberships.find(
      (m) => m.institution_id === tenant && m.user_id === session.user.id,
    ),
    canManage = !!membership,
    canAdmin = membership?.role === "admin";
  async function refreshEvents() {
    setEvents(await repo.events(tenant));
  }
  async function saveConfiguration(updated, section) {
    if (saving) return false;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await repo.saveConfiguration(updated, section);
      await refreshEvents();
      setMessage("Configuração salva no banco.");
      return true;
    } catch (error) {
      setError(readableError(error));
      return false;
    } finally {
      setSaving(false);
    }
  }
  const activeEvent = events.find((e) => e.id === eventId);
  return (
    <div className="app">
      <aside className="sidebar connected-sidebar">
        <button
          className="brand official-brand"
          onClick={() => {
            setPage("Eventos");
            setEventId("");
          }}
        >
          <img src={logo} alt="SIEP" />
        </button>
        <div className="workspace">
          <School size={20} />
          {institutions.length > 1 ? (
            <select
              aria-label="Instituição"
              value={tenant}
              disabled={saving || !!form || !!duplicate}
              onChange={(e) => {
                setTenant(e.target.value);
                setPage("Eventos");
                setEventId("");
                setMessage("");
              }}
            >
              {institutions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          ) : (
            <div>
              {institution?.name || "Minha conta"}
              <small>
                {institution?.branding?.subtitle || "Acesso conectado"}
              </small>
            </div>
          )}
        </div>
        <nav>
          {[
            [CalendarDays, "Eventos"],
            [School, canManage ? "Escolas" : "Dados da escola"],
            ...(canManage ? [[Users, "Responsáveis"]] : []),
            ...(canAdmin ? [[Settings, "Instituição"]] : []),
          ].map(([Icon, label]) => (
            <button
              className={page === label ? "active" : ""}
              key={label}
              onClick={() => {
                setPage(label);
                setEventId("");
                setMessage("");
              }}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile">
            <div>
              {session.user.email}
              <small>
                {canAdmin
                  ? "Administrador"
                  : canManage
                    ? "Secretaria"
                    : "Conta escolar"}
              </small>
            </div>
          </div>
          <button
            className="settings"
            onClick={async () => {
              const { error } = await supabase.auth.signOut({ scope: "local" });
              if (error) setError(readableError(error));
            }}
          >
            <LogOut size={18} />
            Sair da conta
          </button>
        </div>
      </aside>
      <div className="main">
        <header>
          <strong>{institution?.name || "SIEP"}</strong>
          <span>Conta conectada</span>
        </header>
        <main>
          {error && (
            <div className="school-error" role="alert">
              {error}{" "}
              <button
                className="secondary"
                onClick={() => setRevision((v) => v + 1)}
              >
                Recarregar dados
              </button>
            </div>
          )}
          {message && (
            <p className="school-success" role="status">
              {message}
            </p>
          )}
          {loading ? (
            <p role="status">Carregando dados da instituição…</p>
          ) : !institution ? (
            <PendingAccess onRefresh={() => setRevision((v) => v + 1)} />
          ) : (
            <>
              <div className="page-heading">
                <h1>{eventId ? "Gerenciar evento" : page}</h1>
                {canManage && page === "Eventos" && !eventId && (
                  <button
                    className="primary"
                    onClick={() => setForm({ create: true })}
                  >
                    <Plus size={17} />
                    Novo evento
                  </button>
                )}
                {canManage && eventId && (
                  <button
                    className="secondary"
                    onClick={() => setForm(activeEvent)}
                  >
                    Editar informações do evento
                  </button>
                )}
              </div>
              {page === "Eventos" &&
                (eventId ? (
                  <EventWorkspace
                    key={activeEvent?.id}
                    event={activeEvent}
                    onSave={saveConfiguration}
                    saving={saving}
                    readOnly={!canManage}
                    connected
                    onBack={() => setEventId("")}
                    onDuplicate={setDuplicate}
                  />
                ) : (
                  <EventTable
                    events={events}
                    onOpen={(e) => setEventId(e.id)}
                    onDuplicate={canManage ? setDuplicate : undefined}
                    actionLabel={!canManage ? "Consultar" : undefined}
                    readOnly={!canManage}
                  />
                ))}
              {["Escolas", "Dados da escola"].includes(page) && (
                <Schools
                  records={schools}
                  readOnly={!canManage}
                  onSaveSchool={async (s, exists) => {
                    setSaving(true);
                    try {
                      await repo.saveSchool(tenant, s, exists);
                      setSchools(await repo.schools(tenant));
                      return true;
                    } catch (error) {
                      throw Error(readableError(error));
                    } finally {
                      setSaving(false);
                    }
                  }}
                />
              )}
              {page === "Instituição" && canAdmin && (
                <InstitutionForm
                  key={tenant}
                  institution={institution}
                  onSave={async (updated) => {
                    await repo.saveInstitution(updated);
                    setInstitutions(await repo.institutions());
                    setMessage("Instituição salva no banco.");
                  }}
                />
              )}
              {page === "Responsáveis" && canManage && (
                <AccessRequests
                  key={tenant}
                  tenant={tenant}
                  schools={schools}
                />
              )}
            </>
          )}
        </main>
      </div>
      {form && (
        <EventForm
          event={form.create ? null : form}
          onClose={() => setForm(null)}
          onSave={async (input) => {
            if (form.create) await repo.createEvent(tenant, input);
            else await repo.updateEvent(input);
            await refreshEvents();
            setMessage("Evento salvo no banco.");
          }}
        />
      )}
      {duplicate && (
        <DuplicateEventDialog
          source={duplicate}
          connected
          onClose={() => setDuplicate(null)}
          onDuplicate={async (input) => {
            const id = await repo.duplicate(duplicate, input);
            await refreshEvents();
            setDuplicate(null);
            setEventId(id);
            setMessage("Cópia criada no banco como rascunho.");
            return true;
          }}
        />
      )}
    </div>
  );
}
