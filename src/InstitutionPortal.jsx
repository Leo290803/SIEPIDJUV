import { useNavigate, useLocation } from "react-router-dom";
import { portalPath, eventTabs, safeReturn } from "./routing/routes.js";
import AccessState from "./routing/AccessState.jsx";
import EventBadges from "./EventBadges.jsx";
import StaffAccounts from "./StaffAccounts.jsx";
import React, { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  School,
  Users,
  ClipboardList,
  BarChart3,
  Settings,
  Bell,
  LogOut,
  Plus,
  ArrowUpRight,
  Menu,
  X,
} from "lucide-react";
import { supabase, readableError } from "./data/client.js";
import { portalRepository } from "./data/portalRepository.js";
import { registrationStatusLabel } from "./data/peopleMapping.js";
import {
  InstitutionForm,
  EventForm,
  AccessRequests,
} from "./ConnectedForms.jsx";
import Schools from "./Schools.jsx";
import Athletes from "./Athletes.jsx";
import TechnicalStaff from "./TechnicalStaff.jsx";
import Responsibles from "./Responsibles.jsx";
import EventTable from "./EventTable.jsx";
import EventWorkspace from "./EventWorkspace.jsx";
import DuplicateEventDialog from "./DuplicateEventDialog.jsx";
import ConnectedRegistrations from "./ConnectedRegistrations.jsx";
import logo from "../Gemini_Generated_Image_wvkarowvkarowvka-removebg-preview.png";
const empty = {
  athletes: [],
  staff: [],
  responsibles: [],
  registrations: [],
  allocations: [],
  registrationStaff: [],
  contexts: [],
  notifications: [],
};
export function exportCsv(name, headers, rows) {
  const cell = (value) => {
    let text = String(value ?? "");
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const url = URL.createObjectURL(
    new Blob(
      [
        "\ufeff" +
          [headers, ...rows].map((row) => row.map(cell).join(";")).join("\n"),
      ],
      { type: "text/csv;charset=utf-8;" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function InstitutionPortal({
  session,
  institution,
  institutions,
  onTenant,
  onInstitutionChanged,
  membership,
  repo,
  route,
}) {
  const navigate = useNavigate(),
    location = useLocation();
  const api = useMemo(() => portalRepository(supabase), []),
    tenant = institution.id,
    canManage = !!membership,
    canAdmin = membership?.role === "admin";
  const [mobileMenu, setMobileMenu] = useState(false),
    [data, setData] = useState(empty),
    [events, setEvents] = useState([]),
    [schools, setSchools] = useState([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([repo.events(tenant), repo.schools(tenant), api.load(tenant)])
      .then(([events, schools, data]) => {
        if (active) {
          setEvents(events);
          setSchools(schools);
          setData(data);
          setLoading(false);
        }
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
  }, [repo, api, tenant, refreshKey]);
  const page = route.page,
    schoolArea = route.area === "escola" || route.schoolContext,
    schoolId = route.schoolId,
    eventId = route.eventId || "";
  const school = schools.find((s) => s.id === schoolId);
  const activeEvent = events.find(
    (e) =>
      e.id ===
        data.contexts.find((c) => c.school_id === school?.id)?.event_id &&
      e.status === "Inscrições abertas",
  );
  const managedEvent = events.find((e) => e.id === eventId);
  const form =
    route.action === "newEvent"
      ? { create: true }
      : route.action === "editEvent"
        ? managedEvent
        : null;
  const duplicate = route.action === "duplicateEvent" ? managedEvent : null;
  const requests = data.responsibles.filter((r) => r.status === "Pendente"),
    notifications = data.notifications.filter((n) => !n.read_at).length;
  const go = (next, { primary = false, action, recordId } = {}) => {
    setMobileMenu(false);
    setMessage("");
    setError("");
    navigate(
      portalPath(route.area, tenant, next, {
        schoolId: primary && route.area === "secretaria" ? undefined : schoolId,
        schoolContext: primary ? false : route.schoolContext,
        action,
        recordId,
      }),
    );
  };
  const setPage = (next) => go(next, { primary: true });
  const setEventId = (id) =>
    navigate(
      portalPath("secretaria", tenant, "Eventos", id ? { eventId: id } : {}),
    );
  const setSchoolId = (id) =>
    navigate(
      portalPath(route.area, tenant, "Visão geral", {
        schoolId: id,
        schoolContext: route.schoolContext,
      }),
    );
  const setForm = (value) => {
    if (!value) {
      navigate(
        safeReturn(location.state?.returnTo) ||
          portalPath(
            "secretaria",
            tenant,
            "Eventos",
            eventId ? { eventId } : {},
          ),
      );
      return;
    }
    navigate(
      "/secretaria/" +
        tenant +
        "/eventos/" +
        (value.create ? "novo" : value.id + "/editar"),
      { state: { returnTo: location.pathname } },
    );
  };
  const setDuplicate = (value) => {
    if (!value) {
      setEventId(eventId);
      return;
    }
    navigate("/secretaria/" + tenant + "/eventos/" + value.id + "/duplicar");
  };
  async function refresh() {
    const [events, schools, data] = await Promise.all([
      repo.events(tenant),
      repo.schools(tenant),
      api.load(tenant),
    ]);
    setEvents(events);
    setSchools(schools);
    setData(data);
  }
  async function savePerson(role, entry, options) {
    setBusy(true);
    setError("");
    try {
      await api.savePerson(tenant, role, entry, options);
      await refresh();
    } catch (error) {
      await refresh().catch(() => {});
      throw Error(readableError(error));
    } finally {
      setBusy(false);
    }
  }
  async function saveConfiguration(updated, section) {
    if (busy) return false;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await repo.saveConfiguration(updated, section);
      setEvents(await repo.events(tenant));
      setMessage("Configuração salva no banco.");
      return true;
    } catch (error) {
      setError(readableError(error));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const staffForSchool = data.staff.filter(
      (p) => p.schoolId === school?.id && !p.archived,
    ),
    athletesForSchool = data.athletes.filter(
      (p) => p.schoolId === school?.id && !p.archived,
    );
  const ownRegistrations = data.registrations.filter(
    (r) =>
      (!schoolArea || r.school_id === school?.id) &&
      (!schoolArea || !activeEvent || r.event_id === activeEvent.id),
  );
  const nav =
    route.area === "escola"
      ? [
          [LayoutDashboard, "Visão geral"],
          [CalendarDays, "Eventos disponíveis"],
          [Users, "Atletas"],
          [Users, "Comissão técnica"],
          [ClipboardList, "Minhas inscrições"],
          [School, "Dados da escola"],
        ]
      : [
          [LayoutDashboard, "Visão geral"],
          [CalendarDays, "Eventos"],
          [School, "Escolas"],
          [Users, "Responsáveis"],
          [Users, "Atletas"],
          [Users, "Comissão técnica"],
          [ClipboardList, "Inscrições e documentos"],
          ...(canAdmin
            ? [
                [Users, "Usuários da Secretaria"],
              ]
            : []),
        ];
  const documentPages = ["Inscrições", "Relatórios", "Crachás"];
  const isDocuments = route.area === "secretaria" && !route.schoolContext && documentPages.includes(page);
  const roleFormSchool = schoolArea ? school?.id : undefined;
  const showPicker =
    schoolArea && !activeEvent && ["Visão geral", "Atletas"].includes(page);
  const showActive =
    schoolArea &&
    activeEvent &&
    [
      "Visão geral",
      "Atletas",
      "Minhas inscrições",
      "Comissão técnica",
    ].includes(page);
  const recordLists = {
    Atletas: data.athletes,
    "Comissão técnica": data.staff,
    Responsáveis: data.responsibles,
  };
  if (
    !loading &&
    ((eventId && !managedEvent) ||
      (schoolId && !school) ||
      (route.recordId &&
        !recordLists[page]?.some(
          (r) =>
            r.id === route.recordId && (!schoolId || r.schoolId === schoolId),
        )) ||
      (route.registrationId &&
        !data.registrations.some(
          (r) =>
            r.id === route.registrationId &&
            (!schoolId || r.school_id === schoolId),
        )))
  )
    return (
      <AccessState
        kind="missing"
        access={[institution]}
        message="Registro indisponível nesta instituição ou escola."
      />
    );
  return (
    <div className="app">
      <aside
        className={"sidebar connected-sidebar" + (mobileMenu ? " open" : "")}
      >
        <button
          className="portal-menu-close"
          aria-label="Fechar menu"
          onClick={() => setMobileMenu(false)}
        >
          <X size={20} />
        </button>
        <button
          className="brand official-brand"
          onClick={() => go("Visão geral", { primary: true })}
        >
          <img
            src={logo}
            alt="SIEP — Sistema de Inscrições em Eventos e Projetos"
          />
        </button>
        <div className="workspace">
          <School size={20} />
          {institutions.length > 1 ? (
            <select
              aria-label="Instituição"
              disabled={busy || !!form || !!duplicate}
              value={tenant}
              onChange={(e) => onTenant(e.target.value)}
            >
              {institutions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          ) : (
            <div>
              {institution.name}
              <small>{institution.branding?.subtitle}</small>
            </div>
          )}
        </div>
        {schoolArea && (
          <label className="portal-school-label">
            Escola
            <select
              aria-label="Escola de trabalho"
              disabled={busy}
              value={school?.id || ""}
              onChange={(e) => {
                setSchoolId(e.target.value);
              }}
            >
              {schools
                .filter(
                  (s) =>
                    !s.archived &&
                    (route.area === "secretaria" ||
                      institution.schools.some((own) => own.id === s.id)),
                )
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <div className="nav-label">
          {route.area === "escola" ? "ÁREA DA ESCOLA" : "ÁREA DA SECRETARIA"}
        </div>
        <nav>
          {nav.map(([Icon, label]) => (
            <button
              key={label}
              className={page === label || label === "Inscrições e documentos" && isDocuments ? "active" : ""}
              onClick={() => go(label === "Inscrições e documentos" ? "Inscrições" : label, { primary: true })}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        {route.area === "secretaria" && (
          <>
            <div className="nav-label">OUTROS MÓDULOS</div>
            <nav>
              {["Competições", "Inscrições públicas"].map((label) => (
                <button
                  key={label}
                  className={page === label ? "active" : ""}
                  onClick={() => go(label, { primary: true })}
                >
                  <Settings size={18} />
                  {label}
                  <span className="soon">Em breve</span>
                </button>
              ))}
            </nav>
          </>
        )}
        <div className="sidebar-bottom">
          <div className="profile">
            <div>
              {session.user.user_metadata?.display_name || session.user.email}
              <small>
                {canAdmin
                  ? "Administrador da instituição"
                  : canManage
                    ? "Secretaria"
                    : "Responsável escolar"}
              </small>
            </div>
            {canAdmin && route.area === "secretaria" && <button
              className={"profile-settings" + (page === "Instituição" ? " active" : "")}
              aria-label="Configurações da instituição"
              title="Configurações da instituição"
              aria-current={page === "Instituição" ? "page" : undefined}
              onClick={() => go("Instituição", { primary: true })}
            ><Settings size={19} aria-hidden="true" /></button>}
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
      {mobileMenu && (
        <button
          className="portal-menu-backdrop"
          aria-label="Fechar navegação"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <div className="main">
        <header>
          <button
            className="mobile-toggle"
            aria-label="Abrir menu"
            aria-expanded={mobileMenu}
            onClick={() => setMobileMenu(true)}
          >
            <Menu size={20} />
          </button>
          <strong>
            {institution.name} ·{" "}
            {route.area === "escola" ? "Escola" : "Secretaria"}
          </strong>
          <div className="portal-header-account">
            <button
              className={"header-notifications" + (page === "Notificações" ? " active" : "")}
              aria-label="Notificações"
              aria-description={notifications ? `${notifications} notificações não lidas` : "Nenhuma notificação não lida"}
              title={notifications ? `${notifications} notificações não lidas` : "Notificações"}
              aria-current={page === "Notificações" ? "page" : undefined}
              onClick={() => go("Notificações", { primary: true })}
            >
              <Bell size={20} aria-hidden="true" />
              {notifications > 0 && <span className="header-notification-count" aria-hidden="true">{notifications > 99 ? "99+" : notifications}</span>}
            </button>
            <span className="portal-account-status">Conta conectada</span>
          </div>
        </header>
        <main>
          {route.schoolContext && (
            <div className="panel">
              <button
                className="text-btn"
                onClick={() => go("Escolas", { primary: true })}
              >
                ← Escolas da instituição
              </button>
              <h2>Acompanhamento de {school?.name || "escola"}</h2>
              <nav className="school-context-tabs">
                {[
                  "Visão geral",
                  "Eventos disponíveis",
                  "Atletas",
                  "Comissão técnica",
                  "Minhas inscrições",
                  "Dados da escola",
                ].map((label) => (
                  <button
                    key={label}
                    className={page === label ? "active" : ""}
                    onClick={() => go(label)}
                  >
                    {{
                      "Visão geral": "Resumo da escola",
                      "Eventos disponíveis": "Eventos da escola",
                      Atletas: "Atletas da escola",
                      "Comissão técnica": "Profissionais da escola",
                      "Minhas inscrições": "Inscrições da escola",
                    }[label] || label}
                  </button>
                ))}
              </nav>
            </div>
          )}
          {error && (
            <div className="school-error" role="alert">
              {error}{" "}
              <button
                className="secondary"
                onClick={() => {
                  setError("");
                  setRefreshKey((v) => v + 1);
                }}
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
          ) : (
            <>
              {showActive && (
                <div className="event-context-line">
                  <CalendarDays size={17} />
                  <span>
                    Evento:{" "}
                    <strong>
                      {activeEvent.name} · {activeEvent.year}
                    </strong>
                  </span>
                  <button
                    className="text-btn"
                    onClick={() => go("Eventos disponíveis")}
                  >
                    Trocar evento
                  </button>
                </div>
              )}
              <div className="page-heading">
                <h1>
                  {eventId
                    ? "Gerenciar evento"
                    : isDocuments ? "Inscrições e documentos" : page === "Visão geral"
                      ? "Painel inicial"
                      : page}
                </h1>
                {!schoolArea &&
                  ["Visão geral", "Eventos"].includes(page) &&
                  !eventId && (
                    <button
                      className="primary"
                      onClick={() => setForm({ create: true })}
                    >
                      <Plus size={17} />
                      Novo evento
                    </button>
                  )}
                {eventId && (
                  <button
                    className="secondary"
                    onClick={() => setForm(managedEvent)}
                  >
                    Editar informações do evento
                  </button>
                )}
              </div>
              {isDocuments && <nav className="documents-tabs" aria-label="Inscrições, relatórios e crachás">
                {documentPages.map(label=><button key={label} className={page===label?"active":""} aria-current={page===label?"page":undefined} onClick={()=>go(label,{primary:true})}>{label}</button>)}
              </nav>}

              {schoolArea && !school ? (
                <div className="panel empty">
                  <School size={32} />
                  <h2>Nenhuma escola ativa disponível</h2>
                  <p>
                    A secretaria precisa cadastrar uma escola e aprovar o
                    vínculo dos responsáveis.
                  </p>
                </div>
              ) : (
                <>
                  {page === "Visão geral" && !showPicker && (
                    <>
                      <section className="stats">
                        {(schoolArea
                          ? [
                              [
                                Users,
                                "Atletas no evento",
                                athletesForSchool.filter(
                                  (a) => a.eventProfiles[activeEvent?.id],
                                ).length,
                                "Atletas",
                              ],
                              [
                                ClipboardList,
                                "Inscrições neste evento",
                                ownRegistrations.length,
                                "Minhas inscrições",
                              ],
                              [
                                Users,
                                "Profissionais da escola",
                                staffForSchool.length,
                                "Comissão técnica",
                              ],
                            ]
                          : [
                              [
                                CalendarDays,
                                "Eventos abertos",
                                events.filter(
                                  (e) => e.status === "Inscrições abertas",
                                ).length,
                                "Eventos",
                              ],
                              [
                                School,
                                "Escolas ativas",
                                schools.filter((s) => !s.archived).length,
                                "Escolas",
                              ],
                              [
                                Users,
                                "Vínculos pendentes",
                                requests.length,
                                "Responsáveis",
                              ],
                              [
                                ClipboardList,
                                "Inscrições para análise",
                                data.registrations.filter(
                                  (r) => r.status === "submitted",
                                ).length,
                                "Inscrições",
                              ],
                            ]
                        ).map(([Icon, label, count, target]) => (
                          <button
                            className="stat dashboard-link"
                            key={label}
                            onClick={() => go(target)}
                          >
                            <div className="stat-top">
                              <span>{label}</span>
                              <Icon size={20} />
                            </div>
                            <strong>{count}</strong>
                            <small>
                              Consultar <ArrowUpRight size={14} />
                            </small>
                          </button>
                        ))}
                      </section>
                      {!schoolArea && (
                        <EventTable
                          events={events}
                          onOpen={(e) => {
                            setEventId(e.id);
                            setPage("Eventos");
                          }}
                          onDuplicate={setDuplicate}
                        />
                      )}
                    </>
                  )}
                  {(page === "Eventos disponíveis" || showPicker) && (
                    <>
                      {!activeEvent && (
                        <p className="picker-instruction">
                          Escolha o evento de trabalho. A escolha será mantida
                          ao navegar e recarregar.
                        </p>
                      )}
                      <EventTable
                        events={events.filter(
                          (e) => e.status === "Inscrições abertas",
                        )}
                        school
                        actionLabel="Trabalhar neste evento"
                        onOpen={async (e) => {
                          setBusy(true);
                          setError("");
                          try {
                            await api.setActiveEvent(school.id, e.id);
                            await refresh();
                            go("Visão geral");
                          } catch (error) {
                            setError(readableError(error));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      />
                    </>
                  )}
                  {page === "Eventos" &&
                    !schoolArea &&
                    (eventId ? (
                      <EventWorkspace
                        key={eventId}
                        connected
                        activeTab={route.tab || "overview"}
                        onTabChange={(tab) =>
                          navigate(
                            portalPath("secretaria", tenant, "Eventos", {
                              eventId,
                              tab,
                            }),
                          )
                        }
                        event={managedEvent}
                        onSave={saveConfiguration}
                        saving={busy}
                        onBack={() => setEventId("")}
                        onDuplicate={setDuplicate}
                      />
                    ) : (
                      <EventTable
                        events={events}
                        onOpen={(e) => setEventId(e.id)}
                        onDuplicate={setDuplicate}
                      />
                    ))}
                  {page === "Escolas" && !schoolArea && (
                    <Schools
                      records={schools}
                      onOpenSchool={(school) =>
                        navigate(
                          portalPath("secretaria", tenant, "Visão geral", {
                            schoolId: school.id,
                            schoolContext: true,
                          }),
                        )
                      }
                      onSaveSchool={async (entry, exists) => {
                        setBusy(true);
                        try {
                          await repo.saveSchool(tenant, entry, exists);
                          setSchools(await repo.schools(tenant));
                          return true;
                        } catch (error) {
                          throw Error(readableError(error));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                  )}
                  {page === "Dados da escola" && schoolArea && (
                    <div className="panel">
                      <dl className="school-data">
                        {[
                          ["Nome", school.name],
                          ["Município", school.city],
                          ["INEP", school.inep],
                          ["Endereço", school.address],
                          ["E-mail", school.email],
                          ["Telefone", school.phone],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{value || "Não informado"}</dd>
                          </div>
                        ))}
                      </dl>
                      <p className="form-note">
                        Os dados institucionais são mantidos pela secretaria.
                      </p>
                    </div>
                  )}
                  {page === "Atletas" && !showPicker && (
                    <Athletes
                      key={
                        (roleFormSchool || "all") +
                        "-" +
                        (schoolArea ? activeEvent?.id : "people")
                      }
                      connected
                      schoolId={roleFormSchool}
                      event={schoolArea ? activeEvent : undefined}
                      records={data.athletes}
                      routeAction={route.action}
                      routeRecordId={route.recordId}
                      onOpenRecord={(r) =>
                        go("Atletas", {
                          action: r.id ? "edit" : "new",
                          recordId: r.id,
                        })
                      }
                      onCloseRecord={() => go("Atletas")}
                      schools={schools}
                      onPersist={(entry, options) =>
                        savePerson("athlete", entry, options)
                      }
                      onDocumentDownload={api.download}
                    />
                  )}
                  {page === "Comissão técnica" && (
                    <TechnicalStaff
                      key={roleFormSchool || "all"}
                      connected
                      schoolId={roleFormSchool}
                      records={data.staff}
                      routeAction={route.action}
                      routeRecordId={route.recordId}
                      onOpenRecord={(r) =>
                        go("Comissão técnica", {
                          action: r.id ? "edit" : "new",
                          recordId: r.id,
                        })
                      }
                      onCloseRecord={() => go("Comissão técnica")}
                      schools={schools}
                      onPersist={(entry, options) => savePerson("staff", entry, options)}
                    />
                  )}
                  {page === "Responsáveis" && !schoolArea && (
                    <>
                      <Responsibles
                        connected
                        records={data.responsibles}
                        routeAction={route.action}
                        routeRecordId={route.recordId}
                        onOpenRecord={(r) =>
                          go("Responsáveis", {
                            action: r.id ? "edit" : "new",
                            recordId: r.id,
                          })
                        }
                        onCloseRecord={() => go("Responsáveis")}
                        schools={schools}
                        onPersist={(entry, options) => savePerson("responsible", entry, options)}
                        onProvision={async (record) => {
                          const { data: result, error } = await supabase.functions.invoke("provision-school-access", { body: { link_id: record.id } });
                          if (error || result?.error) {
                            let message = result?.error;
                            if (!message && error?.context?.json) message = (await error.context.json().catch(() => ({}))).error;
                            throw Error(message || readableError(error));
                          }
                          await refresh();
                          return result;
                        }}
                        onDecide={async (record, status, reason) => {
                          setBusy(true);
                          try {
                            await api.decideLink(record.id, status, reason);
                            await refresh();
                          } catch (error) {
                            throw Error(readableError(error));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      />
                      <details className="panel">
                        <summary>
                          Histórico de solicitações anteriores
                        </summary>
                        <AccessRequests tenant={tenant} schools={schools} />
                      </details>
                    </>
                  )}
                  {(page === "Inscrições" || page === "Minhas inscrições") &&
                    !showPicker && (
                      <ConnectedRegistrations
                        key={
                          (roleFormSchool || "all") +
                          "-" +
                          (schoolArea ? activeEvent?.id : "all")
                        }
                        routeAction={route.action}
                        routeRegistrationId={route.registrationId}
                        onRoute={(action) => {
                          const base = portalPath(route.area, tenant, page, {
                            schoolId,
                            schoolContext: route.schoolContext,
                          });
                          navigate(
                            base +
                              (action?.id
                                ? "/" +
                                  action.id +
                                  (action.history ? "/historico" : "/editar")
                                : action
                                  ? "/nova"
                                  : ""),
                          );
                        }}
                        events={events}
                        schools={schools}
                        data={data}
                        api={api}
                        tenant={tenant}
                        school={schoolArea ? school : undefined}
                        event={schoolArea ? activeEvent : undefined}
                        manager={canManage && !schoolArea}
                        onChanged={refresh}
                      />
                    )}
                  {page === "Relatórios" && !schoolArea && (
                    <div className="panel">
                      <h2>Relatórios da instituição</h2>
                      <p className="panel-desc">
                        Resumo dos registros do banco da instituição atual.
                      </p>
                      <dl className="school-data">
                        {[
                          ["Escolas", schools.length],
                          [
                            "Atletas",
                            data.athletes.filter((a) => !a.archived).length,
                          ],
                          [
                            "Profissionais",
                            data.staff.filter((a) => !a.archived).length,
                          ],
                          ["Inscrições", data.registrations.length],
                        ].map(([label, count]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{count}</dd>
                          </div>
                        ))}
                      </dl>
                      <div className="staff-actions">
                        <button
                          className="secondary"
                          onClick={() =>
                            exportCsv(
                              "siep-eventos.csv",
                              ["Evento", "Edição", "Situação"],
                              events.map((e) => [e.name, e.year, e.status]),
                            )
                          }
                        >
                          Exportar eventos em CSV
                        </button>
                        <button
                          className="secondary"
                          onClick={() =>
                            exportCsv(
                              "siep-inscricoes.csv",
                              [
                                "Evento",
                                "Escola",
                                "Categoria",
                                "Prova",
                                "Situação",
                                "Atletas",
                              ],
                              data.registrations.map((r) => {
                                const e = events.find(
                                    (e) => e.id === r.event_id,
                                  ),
                                  c = e?.categories.find(
                                    (c) => c.id === r.category_id,
                                  );
                                return [
                                  e?.name,
                                  schools.find((s) => s.id === r.school_id)
                                    ?.name,
                                  c?.name,
                                  c?.proofs.find((p) => p.id === r.proof_id)
                                    ?.name || "",
                                  registrationStatusLabel[r.status],
                                  data.allocations.filter(
                                    (a) => a.registration_id === r.id,
                                  ).length,
                                ];
                              }),
                            )
                          }
                        >
                          Exportar inscrições em CSV
                        </button>
                      </div>
                    </div>
                  )}
                  {page === "Crachás" && !schoolArea && <EventBadges events={events} schools={schools} api={api} tenant={tenant} />}
                  {page === "Notificações" && (
                    <div className="panel">
                      <h2>Notificações da minha conta</h2>
                      {!data.notifications.length && (
                        <div className="empty">
                          Nenhuma notificação recebida.
                        </div>
                      )}
                      {data.notifications
                        .sort((a, b) =>
                          b.created_at.localeCompare(a.created_at),
                        )
                        .map((n) => (
                          <article className="school-row" key={n.id}>
                            <Bell size={20} />
                            <div className="school-info">
                              <h3>
                                Atualização de inscrição:{" "}
                                {registrationStatusLabel[n.payload.status] ||
                                  "Novo aviso"}
                              </h3>
                              <p>
                                {new Date(n.created_at).toLocaleString("pt-BR")}
                              </p>
                            </div>
                            {!n.read_at ? (
                              <button
                                className="secondary"
                                onClick={async () => {
                                  try {
                                    await api.markRead(n.id);
                                    await refresh();
                                  } catch (error) {
                                    setError(readableError(error));
                                  }
                                }}
                              >
                                Marcar como lida
                              </button>
                            ) : (
                              <span className="tag draft">Lida</span>
                            )}
                          </article>
                        ))}
                    </div>
                  )}
                  {page === "Usuários da Secretaria" && canAdmin && (
                    <StaffAccounts tenant={tenant} />
                  )}
                  {page === "Instituição" && canAdmin && (
                    <InstitutionForm
                      institution={institution}
                      onSave={async (updated) => {
                        setBusy(true);
                        try {
                          await repo.saveInstitution(updated);
                          await onInstitutionChanged();
                          setMessage("Instituição salva no banco.");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                  )}
                  {["Competições", "Inscrições públicas"].includes(page) && (
                    <div className="coming">
                      <Settings size={36} />
                      <span className="tag draft">Em breve</span>
                      <h2>{page}</h2>
                      <p>
                        {page === "Competições"
                          ? "Tabelas de jogos, resultados e classificações."
                          : "Inscrições abertas ao público, sem necessidade de criar conta."}
                      </p>
                      <button
                        className="secondary"
                        onClick={() => go("Visão geral")}
                      >
                        Voltar ao painel
                      </button>
                    </div>
                  )}
                </>
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
            await refresh();
            setMessage("Evento salvo no banco.");
          }}
        />
      )}
      {duplicate && (
        <DuplicateEventDialog
          connected
          source={duplicate}
          onClose={() => setDuplicate(null)}
          onDuplicate={async (input) => {
            const id = await repo.duplicate(duplicate, input);
            await refresh();
            setDuplicate(null);
            setPage("Eventos");
            setEventId(id);
            setMessage("Cópia criada no banco.");
            return true;
          }}
        />
      )}
    </div>
  );
}
