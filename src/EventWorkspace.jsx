import React, { useState } from "react";
import EventRequirements from "./EventRequirements.jsx";
import EventCategories from "./EventCategories.jsx";
import EventValidations from "./EventValidations.jsx";
import { modalityGroups } from "./modalityGroups.js";
import { ValidationHelp } from "./EventHelp.jsx";
const roles = [
  "Técnico",
  "Auxiliar técnico",
  "Preparador físico",
  "Fisioterapeuta",
  "Médico",
  "Coordenador",
  "Outro",
];
function Functions({ event, onSave }) {
  const [selected, setSelected] = useState(event.staffFunctions || roles),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError(
          (await onSave({ ...event, staffFunctions: selected }))
            ? ""
            : "Não foi possível salvar.",
        );
      }}
    >
      <h3>Funções da comissão técnica no evento</h3>
      <p className="form-note">
        Habilite as funções permitidas para os profissionais selecionados nas
        inscrições.
      </p>
      <fieldset className="selection-grid">
        {roles.map((r) => (
          <label className="checkbox" key={r}>
            <input
              type="checkbox"
              checked={selected.includes(r)}
              onChange={() =>
                setSelected(
                  selected.includes(r)
                    ? selected.filter((v) => v !== r)
                    : [...selected, r],
                )
              }
            />
            {r}
          </label>
        ))}
      </fieldset>
      {error && (
        <p className="school-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" type="submit">
        Salvar funções do evento
      </button>
    </form>
  );
}
const tabs = [
  ["overview", "Visão geral"],
  ["sports", "Modalidades e categorias"],
  ["rules", "Regras e limites"],
  ["requirements", "Formulário e documentos"],
  ["functions", "Funções"],
];
export default function EventWorkspace({
  event,
  onSave,
  onBack,
  onDuplicate,
  saving = false,
  readOnly = false,
  connected = false,
  activeTab,
  onTabChange,
}) {
  const [localTab, setLocalTab] = useState("overview");
  const tab = activeTab || localTab;
  const setTab = (value) => {
    setLocalTab(value);
    onTabChange?.(value);
  };
  if (!event)
    return (
      <div className="panel empty">
        <p>Este evento não está disponível.</p>
        <button className="secondary" onClick={onBack}>
          Voltar aos eventos
        </button>
      </div>
    );
  const keydown = (e, index) => {
    let next;
    if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft")
      next = (index + tabs.length - 1) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    setTab(tabs[next][0]);
    e.currentTarget.parentElement
      .querySelectorAll('[role="tab"]')
      [next].focus();
  };
  return (
    <section className="event-manager">
      <div className="manager-toolbar">
        <button className="text-btn" onClick={onBack}>
          ← Voltar aos eventos
        </button>
        {!readOnly && (
          <button
            className="secondary"
            disabled={saving}
            onClick={() => onDuplicate(event)}
          >
            Duplicar evento
          </button>
        )}
      </div>
      <div className="manager-heading">
        <div>
          <h2>{event.name}</h2>
          <p>
            {event.type ? event.type + " · " : ""}Edição {event.year}
          </p>
        </div>
        <span
          className={"tag " + (event.status === "Rascunho" ? "draft" : "live")}
        >
          {event.status}
        </span>
      </div>
      <div
        className="event-tabs"
        role="tablist"
        aria-label="Configurações do evento"
      >
        {tabs.map(([id, label], index) => (
          <button
            key={id}
            id={"event-tab-" + id}
            role="tab"
            aria-selected={tab === id}
            aria-controls={"event-panel-" + id}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(e) => keydown(e, index)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="panel event-workspace manager-content">
        <fieldset className="connected-fields" disabled={saving || readOnly}>
          <div
            hidden={tab !== "overview"}
            role="tabpanel"
            id="event-panel-overview"
            aria-labelledby="event-tab-overview"
          >
            <h3>Informações do evento</h3>
            <dl className="school-data">
              <div>
                <dt>Período de inscrição</dt>
                <dd>{event.date || "Datas a definir"}</dd>
              </div>
              <div>
                <dt>Público</dt>
                <dd>Escolas com responsáveis aprovados pela instituição</dd>
              </div>
              <div>
                <dt>Configurações</dt>
                <dd>
                  {modalityGroups(event).length} modalidades ·{" "}
                  {(event.categories || []).length} categorias ·{" "}
                  {
                    (event.validationRules || []).filter(
                      (r) => r.enabled !== false,
                    ).length
                  }{" "}
                  regras ativas
                </dd>
              </div>
            </dl>
            <p className="form-note">
              Use as abas para configurar este evento. Cada seção tem seu
              próprio botão de salvar; você pode alternar entre as abas sem
              perder o preenchimento em andamento.
            </p>
          </div>
          <div
            hidden={tab !== "sports"}
            role="tabpanel"
            id="event-panel-sports"
            aria-labelledby="event-tab-sports"
          >
            <EventCategories
              event={event}
              connected={connected}
              onSave={(updated) => onSave(updated, "sports")}
            />
          </div>
          <div
            hidden={tab !== "rules"}
            role="tabpanel"
            id="event-panel-rules"
            aria-labelledby="event-tab-rules"
          >
            <ValidationHelp />
            <EventValidations
              event={event}
              onSave={(updated) => onSave(updated, "rules")}
            />
          </div>
          <div
            hidden={tab !== "requirements"}
            role="tabpanel"
            id="event-panel-requirements"
            aria-labelledby="event-tab-requirements"
          >
            <EventRequirements
              event={event}
              connected={connected}
              onSave={(updated) => onSave(updated, "requirements")}
            />
          </div>
          <div
            hidden={tab !== "functions"}
            role="tabpanel"
            id="event-panel-functions"
            aria-labelledby="event-tab-functions"
          >
            <Functions
              event={event}
              onSave={(updated) => onSave(updated, "functions")}
            />
          </div>
        </fieldset>
      </div>
    </section>
  );
}
