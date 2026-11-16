import React, {useEffect, useState} from "react";
import {registrationStatusLabel} from "./data/peopleMapping.js";
import {guardianFields as guardianFieldPairs, guardianPolicy, isMinorAt} from "./guardianRequirements.js";

const guardianFields = guardianFieldPairs.map(([key,label]) => ({key,label}));

function PrivateFile({attachment, api, photo = false}) {
  const [url, setUrl] = useState(""), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  async function open() {
    setLoading(true); setError("");
    try { setUrl(URL.createObjectURL(await api.download(attachment))); }
    catch { setError("Não foi possível abrir o arquivo. Tente novamente."); }
    finally { setLoading(false); }
  }
  return <div className="review-file">
    {!url && <button type="button" className="secondary" disabled={loading} onClick={open}>{loading ? "Carregando…" : photo ? "Ver foto" : `Abrir ${attachment.name || "documento"}`}</button>}
    {url && (photo ? <img className="review-photo" src={url} alt="Foto de identificação do cadastro" /> : <a href={url} download={attachment.name || "documento"}>Baixar {attachment.name || "documento"}</a>)}
    {error && <p role="alert" className="school-error">{error}</p>}
  </div>;
}

export default function RegistrationReview({history, event, school, data, api, manager, onDecision, onContinue}) {
  const [tab, setTab] = useState("review"), [notes, setNotes] = useState({});
  const r = history.r;
  const category = event?.categories.find(c => c.id === r.category_id);
  const proof = category?.proofs.find(p => p.id === r.proof_id);
  const roster = data.allocations.filter(a => a.registration_id === r.id && a.active !== false);
  const latest = [...history.decisions].sort((a,b) => b.created_at.localeCompare(a.created_at))[0];
  const policy = event ? guardianPolicy(event) : null;
  const canReview = manager && r.status === "submitted";
  const correctionReason = Object.entries(notes).filter(([,value]) => value.trim()).map(([label,value]) => `${label}: ${value.trim()}`).join("\n");
  function note(label) {
    return canReview && <label className="review-note">O que precisa de correção em {label}?
      <textarea aria-label={`O que precisa de correção em ${label}?`} rows={2} maxLength={300} value={notes[label] || ""} onChange={e => setNotes({...notes,[label]:e.target.value})} />
    </label>;
  }
  return <>
    <div className="review-heading"><div><strong>{event?.name}</strong><p>{school?.name}</p><p>{category?.modality} · {category?.name}{proof ? ` · ${proof.name}` : ""}</p></div><span className="tag">{registrationStatusLabel[r.status]}</span></div>
    {latest && <div className={r.status === "correction_requested" ? "participation-issues" : "panel"}><strong>Última decisão · {registrationStatusLabel[latest.to_status]}</strong><p className="review-reason">{latest.reason}</p>{r.status === "correction_requested" && r.correction_deadline && <p>Corrigir até {new Date(r.correction_deadline).toLocaleString("pt-BR")}</p>}{["draft","correction_requested"].includes(r.status) && <button className="secondary" onClick={onContinue}>Continuar inscrição</button>}</div>}
    <div className="review-tabs" role="tablist" aria-label="Detalhes da inscrição"><button role="tab" aria-selected={tab === "review"} className="secondary" onClick={() => setTab("review")}>Conferência</button><button role="tab" aria-selected={tab === "history"} className="secondary" onClick={() => setTab("history")}>Histórico</button></div>
    {tab === "review" ? <div role="tabpanel" aria-label="Conferência">
      <h3>Atletas · {roster.length}</h3>
      {roster.map(allocation => {
        const person = data.athletes.find(p => p.personId === allocation.person_id && p.schoolId === r.school_id);
        if (!person) return <p key={allocation.id}>Dados do atleta indisponíveis. Atualize a inscrição antes de decidir.</p>;
        const profile = person.eventProfiles?.[r.event_id];
        const requirements = (event?.requirements.documents || []).filter(d => !d.categoryId || d.categoryId === r.category_id);
        const documents = profile?.documents || {};
        return <section className="panel review-person" key={allocation.id || allocation.person_id}>
          <h4>{person.name} · Vaga {allocation.slot_number}</h4>
          <dl className="review-data"><div><dt>CPF</dt><dd>{person.cpf}</dd></div><div><dt>Nascimento</dt><dd>{person.birth?.split("-").reverse().join("/")}</dd></div><div><dt>Sexo</dt><dd>{person.gender}</dd></div><div><dt>Cadastro no evento</dt><dd>{profile?.status === "complete" ? "Concluído" : profile?.status || "Não localizado"}</dd></div></dl>
          {person.photo ? <PrivateFile key={person.photo.id} attachment={person.photo} api={api} photo /> : <p>Sem foto de identificação. A foto geral é opcional.</p>}
          {note(person.name)}
          <h4>Documentos do evento</h4>
          {!requirements.length && !Object.keys(documents).length && <p>Nenhum documento solicitado.</p>}
          {requirements.map(req => <div className="review-document" key={req.id}><strong>{req.name}{req.required ? " · Obrigatório" : " · Opcional"}</strong>{documents[req.id] ? <PrivateFile key={documents[req.id].id} attachment={documents[req.id]} api={api} /> : <p>{req.required ? "Documento obrigatório não anexado" : "Não anexado"}</p>}{note(`${person.name} — ${req.name}`)}</div>)}
          {Object.entries(documents).filter(([id]) => !requirements.some(req => req.id === id)).map(([id,doc]) => <PrivateFile key={id} attachment={doc} api={api} />)}
          {policy?.enabled && isMinorAt(person.birth, policy.referenceDate) && guardianFields.some(field => policy.fields[field.key] !== "hidden" && profile?.additionalData?.[field.key]) && <><h4>Responsável legal informado</h4><dl className="review-data">{guardianFields.map(field => policy.fields[field.key] !== "hidden" && profile?.additionalData?.[field.key] && <div key={field.key}><dt>{field.label}</dt><dd>{profile.additionalData[field.key]}</dd></div>)}</dl></>}
        </section>;
      })}
      <h3>Comissão técnica</h3>
      {data.registrationStaff.filter(s => s.registration_id === r.id).map(assignment => {
        const person = data.staff.find(p => p.personId === assignment.person_id && p.schoolId === r.school_id);
        return <section className="panel" key={assignment.id || assignment.person_id}><strong>{person?.name || "Profissional indisponível"}</strong><p>{event?._staffRoles?.find(role => role.id === assignment.staff_role_id)?.name}</p>{person?.photo && <PrivateFile key={person.photo.id} attachment={person.photo} api={api} photo />}{person && note(person.name)}</section>;
      })}
      {!data.registrationStaff.some(s => s.registration_id === r.id) && <p>Nenhum profissional vinculado.</p>}
      {canReview && <div className="review-decisions"><p>As orientações serão enviadas à escola na justificativa. Confira e confirme a decisão na próxima etapa.</p><div className="staff-actions"><button className="primary" onClick={() => onDecision("approved", "Aprovar")}>Aprovar</button><button className="secondary" onClick={() => onDecision("correction_requested", "Solicitar correção", correctionReason)}>Solicitar correção</button><button className="secondary" onClick={() => onDecision("rejected", "Indeferir")}>Indeferir</button></div></div>}
    </div> : <div role="tabpanel" aria-label="Histórico">
      <p>As versões abaixo preservam os dados enviados em cada etapa. A conferência mostra o cadastro atual.</p>
      {[...history.versions].sort((a,b) => b.revision-a.revision).map(version => <details className="panel" key={version.id}><summary>Versão {version.revision} · {registrationStatusLabel[version.status]} · {new Date(version.created_at).toLocaleString("pt-BR")}</summary><h3>Atletas</h3>{version.snapshot.athletes?.map(a => <p key={a.person.id}>{a.person.full_name} · Vaga {a.allocation.slot_number}</p>)}<h3>Comissão técnica</h3>{version.snapshot.staff?.map(s => <p key={s.person.id}>{s.person.full_name}</p>)}</details>)}
      {[...history.decisions].sort((a,b) => a.created_at.localeCompare(b.created_at)).map(d => <p className="review-reason" key={d.id}>{new Date(d.created_at).toLocaleString("pt-BR")} · {registrationStatusLabel[d.to_status]}: {d.reason}</p>)}
    </div>}
  </>;
}
