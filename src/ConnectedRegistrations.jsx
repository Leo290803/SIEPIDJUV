import EventAthleteForm from "./EventAthleteForm.jsx";
import RegistrationReview from "./RegistrationReview.jsx";
import ServerPagination from "./ServerPagination.jsx";
import { useServerFilters } from "./data/useServerFilters.js";
import React, { useEffect, useState, useRef } from "react";
import { X, Plus, ClipboardList, FileDown } from "lucide-react";
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
  schoolWorkflow = false,
}) {
  const [savedRegistration,setSavedRegistration]=useState(registration ? {id:registration.id,revision:registration.revision} : null);
  const completionRequest=useRef(null),schoolIssues=useRef(null);
  const currentId=savedRegistration?.id;
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
  useEffect(()=>{
    if(schoolWorkflow && (issues.length || error))requestAnimationFrame(()=>{schoolIssues.current?.scrollIntoView({block:'center',behavior:'auto'});schoolIssues.current?.focus({preventScroll:true});});
  },[schoolWorkflow,issues,error]);
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
      a.registration_id !== currentId,
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
      .eligible(event.id, school.id, categoryId, proofId, currentId)
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
  }, [api, event.id, school.id, categoryId, proofId, currentId]);
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
    p_registration_id: currentId || null,
    p_expected_revision: savedRegistration?.revision || null,
  });
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);setError("");if(schoolWorkflow)setIssues([]);
    const complete=schoolWorkflow && e.nativeEvent.submitter?.value!=='draft';
    const payload=input(),signature=JSON.stringify(payload);
    if(complete && completionRequest.current?.signature!==signature)completionRequest.current={signature,id:crypto.randomUUID()};
    try {
      const result=complete ? await api.completeRegistration(payload,completionRequest.current.id) : await api.saveRegistration(payload);
      completionRequest.current=null;
      setSavedRegistration({id:result.id,revision:result.revision});
      setIssues(result.issues || []);
      if(result.submission_error)setError(result.submission_error);
      await onSaved(result);
      if(!complete || result.submitted)onClose();
    } catch(error) {setError(readableError(error));}
    finally {setBusy(false);}
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
          {currentId ? "Continuar inscrição" : "Novo rascunho"}
        </p>
        {schoolWorkflow && <p className="form-note">O envio só estará confirmado quando aparecer a mensagem de sucesso. Use a ação de conclusão para validar, salvar e enviar.</p>}
        {schoolWorkflow && (issues.length>0 || error) && <div className="participation-issues" role="alert" tabIndex={-1} ref={schoolIssues}><strong>{issues.length ? "A inscrição ainda não foi enviada" : "Não foi possível confirmar a conclusão"}</strong>{issues.length>0 && <ul>{issueMessages(issues,event).map(message=><li key={message}>{message}</li>)}</ul>}{error&&<p>{error}</p>}<p>{issues.length ? "Os dados preenchidos foram mantidos. Resolva as pendências antes de concluir." : "Os dados preenchidos continuam na tela. Tente novamente; a operação evita inscrições duplicadas."}</p></div>}
        <form onSubmit={submit}>
          <fieldset className="form-fields" disabled={busy}>
            <label>
              Modalidade e categoria *
              <select
                required
                value={categoryId}
                disabled={!!currentId}
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
                  disabled={!!currentId}
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
            {!schoolWorkflow && issues.length > 0 && (
              <div className="participation-issues">
                <strong>{schoolWorkflow ? "Pendências para concluir a inscrição" : "Pendências da prévia"}</strong>
                <ul>
                  {issueMessages(issues, event).map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            )}
            {!schoolWorkflow && error && (
              <p className="school-error" role="alert">
                {error}
              </p>
            )}
            <p className="form-note">
              {schoolWorkflow ? "Salvar rascunho mantém a inscrição como não enviada. Concluir inscrição valida, salva e envia à Secretaria em uma única ação." : "Salvar rascunho preserva pendências para correção. Enviar para análise exige resolver todas as pendências."}
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
              {schoolWorkflow && <button className="primary" type="submit" value="complete" disabled={!categoryId || loading}>{registration?.status==='correction_requested' ? "Salvar correções e reenviar" : "Concluir inscrição"}</button>}
              <button
                className={schoolWorkflow ? "secondary" : "primary"}
                type="submit"
                value="draft"
                disabled={!categoryId || loading}
              >
                {schoolWorkflow ? "Salvar rascunho" : "Salvar rascunho no banco"}
              </button>

            </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
}
export default function ConnectedRegistrations({
  remote,
  events,
  schools,
  data,
  api,
  tenant,
  school,
  event,
  manager,
  onChanged,
  onSaveAthlete,
  routeAction,
  routeRegistrationId,
  onRoute,
}) {
  const [query, setQuery] = useState(remote?.filters.query || ""),
    [status, setStatus] = useState(remote?.filters.status || "all"),
    [eventFilter, setEventFilter] = useState(remote?.filters.eventId || ""),
    [schoolFilter, setSchoolFilter] = useState(remote?.filters.schoolId || ""),
    [editing, setEditing] = useState(null),
    [starting, setStarting] = useState(false),
    [decision, setDecision] = useState(null),
    [correcting, setCorrecting] = useState(null),
    [history, setHistory] = useState(null),
    [reviewNotes, setReviewNotes] = useState({}),
    [warnings, setWarnings] = useState(null),
    [successMessage,setSuccessMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const pdfRequest = useRef(null);
  const [generatingPdf,setGeneratingPdf] = useState(false), [pdfError,setPdfError] = useState("");
  useEffect(() => () => pdfRequest.current?.abort(), []);
  async function downloadRegistrationsPdf() {
    if (!school || !event || pdfRequest.current) return;
    const controller = new AbortController();
    pdfRequest.current = controller;
    setGeneratingPdf(true);setPdfError("");
    try {
      const {createSchoolRegistrationsPdf} = await import("./reports/schoolRegistrations.js");
      const pdf = await createSchoolRegistrationsPdf({api,tenant,school,event,status,query,signal:controller.signal});
      controller.signal.throwIfAborted();
      if (pdf) pdf.save("siep-inscricoes-da-escola.pdf");
      else setPdfError("Nenhuma inscrição corresponde aos filtros selecionados.");
    } catch (error) {
      if (!controller.signal.aborted) setPdfError(readableError(error));
    } finally {
      pdfRequest.current = null;
      if (!controller.signal.aborted) setGeneratingPdf(false);
    }
  }
  useEffect(() => {
    if (!onRoute) return;
    let active = true;
    const controller=new AbortController();
    setError("");
    setBusy(false);
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
          .history(tenant, r.id, controller.signal)
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
      controller.abort();
    };
  }, [routeAction, routeRegistrationId, data.registrations]);
  useEffect(() => {setCorrecting(null);if(routeAction)setSuccessMessage("");}, [routeAction,routeRegistrationId]);
  const closeRoute = () => {
    setCorrecting(null);
    setEditing(null);
    setStarting(false);
    setHistory(null);
    onRoute?.(null);
  };
  useServerFilters(remote, {query, status, eventId:eventFilter,schoolId:schoolFilter});
  const rows = remote ? data.registrations : data.registrations.filter(
    (r) =>
      (!school || r.school_id === school.id) &&
      (!event || r.event_id === event.id) &&
      (!eventFilter || r.event_id === eventFilter) &&
      (!schoolFilter || r.school_id === schoolFilter) &&
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
  async function openReview(r) {
    if (onRoute) { onRoute({id:r.id,history:true}); return; }
    setBusy(true); setError("");
    try { setHistory({r,...(await api.history(tenant,r.id))}); }
    catch(error) { setError(readableError(error)); }
    finally { setBusy(false); }
  }
  const queueRows = rows.filter(r => !manager || r.status === "submitted");
  const queueIndex = history ? queueRows.findIndex(r => r.id === history.r.id) : -1;
  const currentRowIndex = history ? rows.findIndex(r => r.id === history.r.id) : -1;
  const adjacent = direction => {
    if (currentRowIndex < 0) return null;
    const candidates = direction > 0 ? rows.slice(currentRowIndex+1) : rows.slice(0,currentRowIndex).reverse();
    return candidates.find(r => !manager || r.status === "submitted");
  };
  const schoolCompletionRequest=useRef(null),correctedSave=useRef(null);
  useEffect(()=>{correctedSave.current=null;},[correcting?.athlete.id]);
  function actions(r) {
    return [
      ...(manager && ["draft", "correction_requested"].includes(r.status)
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
  function registrationInput(r) {
    return {p_event_id:r.event_id,p_school_id:r.school_id,p_category_id:r.category_id,p_proof_id:r.proof_id||null,p_registration_id:r.id,p_expected_revision:r.revision,
      p_athletes:data.allocations.filter(a=>a.registration_id===r.id&&a.active!==false).map(a=>({participation_id:a.participation_id,slot_number:a.slot_number})),
      p_staff:data.registrationStaff.filter(a=>a.registration_id===r.id).map(a=>({person_id:a.person_id,staff_role_id:a.staff_role_id}))};
  }
  async function completeSchoolRegistration(r) {
    if(busy)return false;
    setBusy(true);setError('');setSuccessMessage('');setWarnings(null);
    const payload=registrationInput(r),signature=JSON.stringify(payload);
    if(schoolCompletionRequest.current?.signature!==signature)schoolCompletionRequest.current={signature,id:crypto.randomUUID()};
    try {
      const result=await api.completeRegistration(payload,schoolCompletionRequest.current.id);
      await onChanged().catch(()=>setError("A operação foi salva, mas a lista não pôde ser atualizada. Recarregue a página para conferir a situação."));
      schoolCompletionRequest.current=null;
      setWarnings(result.issues?.length||result.submission_error ? {issues:result.issues||[],message:result.submission_error,event:ev(r),registrationId:r.id} : null);
      if(result.submitted){setSuccessMessage('Inscrição enviada com sucesso. Aguarde a análise da Secretaria.');closeRoute();}
      return !!result.submitted;
    } catch(error){setError(readableError(error));throw error;}
    finally{setBusy(false);}
  }
  async function saveSchoolCorrection(entry,options) {
    const signature=JSON.stringify([
      entry,options?.complete,options?.removed,
      Object.entries(options?.files||{}).map(([id,file])=>[id,file?.name,file?.size,file?.lastModified]),
      options?.photo===null ? null : options?.photo ? [options.photo.name,options.photo.size,options.photo.lastModified] : undefined,
    ]);
    // Se o envio falhar após salvar dados/anexos, repetir não faz novo upload
    // nem tenta atualizar o cadastro com sua versão anterior.
    if(correctedSave.current!==signature){
      await onSaveAthlete(entry,options);
      correctedSave.current=signature;
    }
    if(options?.submitRegistration){
      try {await completeSchoolRegistration(correcting.registration);}
      catch(error){throw Error("Os dados foram salvos, mas não foi possível confirmar o reenvio. Tente novamente. "+readableError(error));}
    } else {
      setWarnings({issues:[],message:"Alterações salvas como rascunho. A inscrição ainda não foi reenviada.",event:correcting.event,registrationId:correcting.registration.id});
    }
    setCorrecting(null);
    return true;
  }
  return (
    <section>
      {successMessage && <p className="info-box" role="status">{successMessage}</p>}
      {warnings && (
        <div className="participation-issues" role="status">
          <strong>{manager ? "Rascunho salvo com pendências" : "Dados salvos. Inscrição ainda não enviada à Secretaria."}</strong>
          <ul>
            {issueMessages(warnings.issues, warnings.event).map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
          {warnings.message && <p>{warnings.message}</p>}
          <p>{manager ? "Corrija antes de enviar para análise." : "Resolva as pendências e clique em Concluir inscrição ou Salvar correções e reenviar."}</p>
        </div>
      )}
      {error && (
        <p className="school-error" role="alert">
          {error}
        </p>
      )}
      {manager && <div className="registration-queue-toolbar">
        <div><strong>Fila de conferência</strong><p>Filtre as inscrições enviadas e avance pela fila dentro da análise.</p></div>
        <div className="staff-actions">{[["submitted","Aguardando análise"],["correction_requested","Em correção"],["all","Todas as inscrições"]].map(([value,label]) => <button key={value} className={status === value ? "primary" : "secondary"} aria-pressed={status === value} onClick={() => setStatus(value)}>{label}</button>)}</div>
      </div>}
      <div className="panel registration-compact-list">
        <div className="table-toolbar">
          <span className="record-count">{remote?.total ?? rows.length} inscrições</span>
          <div className="school-tools">
            <label className="search">
              <input
                aria-label="Buscar inscrições"
                placeholder="Evento ou escola"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {manager && !school && <select aria-label="Escola das inscrições" value={schoolFilter} onChange={e=>setSchoolFilter(e.target.value)}><option value="">Todas as escolas</option>{schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>}
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
            {school && event && !manager && !routeAction && (
              <button type="button" className="secondary" disabled={generatingPdf}
                aria-busy={generatingPdf} onClick={downloadRegistrationsPdf}>
                <FileDown size={16}/>
                {generatingPdf ? "Gerando PDF…" : "Baixar relatório em PDF"}
              </button>
            )}
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
        {pdfError && <p className="school-error" role="alert">{pdfError}</p>}
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
                      {!manager && r.status === "draft" && <small className="correction-list-deadline">Ainda não enviado à Secretaria</small>}
                      {r.status === "correction_requested" && r.correction_deadline && <small className="correction-list-deadline">Corrigir até {new Date(r.correction_deadline).toLocaleString("pt-BR")}</small>}
                    </td>
                    <td>
                      <div className="staff-actions">
                        {!manager && ["draft", "correction_requested"].includes(
                          r.status,
                        ) && (
                          <button
                            className="secondary"
                            onClick={() =>
                              r.status === "correction_requested" ? openReview(r) : onRoute ? onRoute({ id: r.id }) : setEditing(r)
                            }
                          >
                            {r.status === "correction_requested" ? "Corrigir pendências" : "Concluir inscrição"}
                          </button>
                        )}
                        <button
                          className="secondary"
                          onClick={() => openReview(r)}
                          disabled={busy}
                        >
                          {manager ? r.status === "submitted" ? "Conferir inscrição" : "Ver inscrição" : "Detalhes e histórico"}
                        </button>
                        {manager && actions(r).length > 0 && <details className="registration-more"><summary>Mais ações</summary><div>{["draft","correction_requested"].includes(r.status) && <button className="secondary" onClick={() => onRoute ? onRoute({id:r.id}) : setEditing(r)}>Continuar</button>}{actions(r).map(([label,value]) => <button key={value} className="secondary" onClick={() => setDecision({r,status:value,label})}>{label}</button>)}</div></details>}
                        {!manager && actions(r).map(([label, value]) => (
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
      {remote && <ServerPagination {...remote} />}
      {(starting || editing) && (
        <RegistrationEditor
          key={editing?.id || "new"}
          event={editing ? ev(editing) : event}
          school={editing ? sc(editing) : school}
          registration={editing}
          data={data}
          api={api}
          schoolWorkflow={!manager}
          onClose={closeRoute}
          onSaved={async (result) => {
            await onChanged().catch(()=>setError("A operação foi salva, mas a lista não pôde ser atualizada. Recarregue a página para conferir a situação."));
            setWarnings(result?.issues?.length || result.submission_error ? {issues:result.issues || [],message:result.submission_error,event:editing ? ev(editing) : event,registrationId:result.id} : null);
            if(result.submitted)setSuccessMessage('Inscrição enviada com sucesso. Aguarde a análise da Secretaria.');
          }}
        />
      )}
      {correcting && <EventAthleteForm key={correcting.athlete.id} connected event={correcting.event} schoolId={correcting.school.id} schoolName={correcting.school.name} athlete={correcting.athlete} records={data.athletes} registrationCorrection completeLabel="Salvar correções e reenviar" focusField={correcting.documentId ? 'document:'+correcting.documentId : 'name'} correctionNotice={correcting.message || "Corrija os dados ou anexos solicitados. Use Salvar correções e reenviar para concluir ou Salvar rascunho para continuar depois."} onDocumentDownload={api.download} onClose={() => setCorrecting(null)} onSave={saveSchoolCorrection} />}
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
                const next = e.nativeEvent.submitter?.value === "next" ? adjacent(1) : null;
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
                  setReviewNotes(current => { const remaining = {...current}; delete remaining[decision.r.id]; return remaining; });
                  if (next) await openReview(next);
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
                  <textarea
                    aria-label="Justificativa *"
                    rows={5}
                    name="reason"
                    required
                    maxLength={5000}
                    defaultValue={
                      decision.status === "submitted"
                        ? "Envio para análise"
                        : decision.reason || ""
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
                  {manager && history && adjacent(1) && ["approved","rejected","correction_requested"].includes(decision.status) && <button className="primary" name="after" value="next">Confirmar e próxima inscrição</button>}
                </div>
              </fieldset>
            </form>
          </div>
        </div>
      )}
      {history && (
        <div className="modal-backdrop" style={decision || correcting ? {display:"none"} : undefined}>
          <div
            className="modal athlete-event-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Análise da inscrição"
          >
            <button
              className="close"
              aria-label="Fechar histórico"
              onClick={closeRoute}
            >
              <X />
            </button>
            <h2>Análise da inscrição</h2>
            <RegistrationReview key={history.r.id} history={history} savedNotes={reviewNotes[history.r.id]} onNotesChange={notes => setReviewNotes(current => ({...current,[history.r.id]:notes}))} onCorrect={!manager && onSaveAthlete ? (athlete,documentId,message) => setCorrecting({athlete,documentId,message,registration:history.r,event:ev(history.r),school:sc(history.r)}) : undefined} submitting={busy} submissionError={error} submissionFeedback={warnings?.registrationId===history.r.id ? warnings : null} onResend={() => completeSchoolRegistration(history.r).catch(()=>{})} event={ev(history.r)} school={sc(history.r)} data={data} api={api} manager={manager}
              navigation={manager && (queueRows.length > 1 || remote && remote.offset+remote.limit < remote.total) && <div className="review-queue-navigation"><strong>{queueIndex >= 0 ? `Inscrição ${queueIndex+1} de ${queueRows.length} nesta página da fila` : "Inscrição fora da fila de análise"}</strong><div className="staff-actions"><button className="secondary" disabled={busy || !adjacent(-1)} onClick={() => openReview(adjacent(-1))}>Inscrição anterior</button><button className="primary" disabled={busy || !adjacent(1)} onClick={() => openReview(adjacent(1))}>Próxima inscrição</button>{remote && remote.offset+remote.limit < remote.total && <button className="secondary" onClick={() => {closeRoute();remote.onPage(remote.offset+remote.limit);}}>Próxima página da fila</button>}</div></div>}
              onContinue={() => { const r = history.r; closeRoute(); onRoute ? onRoute({id:r.id}) : setEditing(r); }}
              onDecision={(status,label,reason) => setDecision({r:history.r,status,label,reason})} />
          </div>
        </div>
      )}
    </section>
  );
}
