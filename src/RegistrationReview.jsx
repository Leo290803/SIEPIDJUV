import SchoolCorrections from "./SchoolCorrections.jsx";
import React, {useEffect, useState} from "react";
import {registrationStatusLabel} from "./data/peopleMapping.js";
import {guardianFields as guardianFieldPairs, guardianPolicy, isMinorAt} from "./guardianRequirements.js";

const guardianFields = guardianFieldPairs.map(([key,label]) => ({key,label}));

function PrivateFile({attachment, api, photo = false}) {
  const [url, setUrl] = useState(""), [type, setType] = useState(""), [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true, objectUrl;
    setUrl(""); setError("");
    api.download(attachment).then(blob => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob); setType(blob.type); setUrl(objectUrl);
    }).catch(() => { if (active) setError("Não foi possível carregar o arquivo."); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachment.id, attachment.objectPath, api, attempt]);
  return <div className="review-file">
    {!url && !error && <span role="status">Carregando {photo ? "foto" : "documento"}…</span>}
    {url && (photo || ["image/png","image/jpeg"].includes(type) ? <img className={photo ? "review-photo" : "review-document-image"} src={url} alt={photo ? "Foto de identificação do cadastro" : attachment.name || "Documento enviado"} /> : type === "application/pdf" ? <iframe className="review-document-pdf" title={attachment.name || "Documento PDF"} src={url} /> : <p>Prévia indisponível para este formato.</p>)}
    {url && !photo && <a href={url} download={attachment.name || "documento"}>Baixar {attachment.name || "documento"}</a>}
    {error && <p role="alert" className="school-error">{error} <button className="secondary" onClick={() => setAttempt(attempt+1)}>Tentar novamente</button></p>}
  </div>;
}

export default function RegistrationReview({history, event, school, data, api, manager, onDecision, onContinue, navigation, savedNotes, onNotesChange, onCorrect, onResend}) {
  const [tab, setTab] = useState("review"), [notes, setNotes] = useState(savedNotes || {}), [athleteIndex, setAthleteIndex] = useState(0), [staffOpen, setStaffOpen] = useState(false);
  const r = history.r;
  const category = event?.categories.find(c => c.id === r.category_id);
  const proof = category?.proofs.find(p => p.id === r.proof_id);
  const roster = data.allocations.filter(a => a.registration_id === r.id && a.active !== false);
  const currentIndex = Math.min(athleteIndex, Math.max(0, roster.length-1));
  const latest = [...history.decisions].sort((a,b) => b.created_at.localeCompare(a.created_at))[0];
  const policy = event ? guardianPolicy(event) : null;
  const canReview = manager && r.status === "submitted";
  const correctionReason = Object.entries(notes).filter(([,value]) => value.trim()).map(([label,value]) => `${label}: ${value.trim()}`).join("\n");
  function note(label) {
    return canReview && <label className="review-note">O que precisa de correção em {label}?
      <textarea aria-label={`O que precisa de correção em ${label}?`} rows={2} maxLength={300} value={notes[label] || ""} onChange={e => { const next = {...notes,[label]:e.target.value}; setNotes(next); onNotesChange?.(next); }} />
    </label>;
  }
  return <>
    {navigation}
    <div className="review-heading"><div><strong>{event?.name}</strong><p>{school?.name}</p><p>{category?.modality} · {category?.name}{proof ? ` · ${proof.name}` : ""}</p></div><span className="tag">{registrationStatusLabel[r.status]}</span></div>
    {!manager && r.status === "correction_requested" && onCorrect && <SchoolCorrections history={history} event={event} data={data} onCorrect={onCorrect} onResend={onResend} onContinue={onContinue} />}
    {latest && latest.to_status !== "submitted" && !(!manager && r.status === "correction_requested" && onCorrect) && <div className={r.status === "correction_requested" ? "participation-issues" : "panel"}><strong>Última decisão · {registrationStatusLabel[latest.to_status]}</strong><p className="review-reason">{latest.reason}</p>{r.status === "correction_requested" && r.correction_deadline && <p>Corrigir até {new Date(r.correction_deadline).toLocaleString("pt-BR")}</p>}{["draft","correction_requested"].includes(r.status) && <button className="secondary" onClick={onContinue}>Continuar inscrição</button>}</div>}
    <div className="review-tabs" role="tablist" aria-label="Detalhes da inscrição"><button role="tab" aria-selected={tab === "review"} className="secondary" onClick={() => setTab("review")}>Conferência</button><button role="tab" aria-selected={tab === "history"} className="secondary" onClick={() => setTab("history")}>Histórico</button></div>
    {tab === "review" ? <div role="tabpanel" aria-label="Conferência">
      <h3>Atletas · {roster.length}</h3>
      {roster.length > 1 && <div className="review-athlete-navigation">
        <button className="secondary" disabled={currentIndex === 0} onClick={() => setAthleteIndex(currentIndex-1)}>Atleta anterior</button>
        <label>Atleta {currentIndex+1} de {roster.length}<select aria-label="Atleta em conferência" value={currentIndex} onChange={e => setAthleteIndex(Number(e.target.value))}>{roster.map((a,index) => <option value={index} key={a.id || a.person_id}>{data.athletes.find(p => p.personId === a.person_id && p.schoolId === r.school_id)?.name || "Atleta indisponível"}</option>)}</select></label>
        <button className="secondary" disabled={currentIndex+1 >= roster.length} onClick={() => setAthleteIndex(currentIndex+1)}>Próximo atleta</button>
      </div>}
      {roster.slice(currentIndex,currentIndex+1).map(allocation => {
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
      <details className="review-staff" onToggle={e => setStaffOpen(e.currentTarget.open)}><summary>Comissão técnica · {data.registrationStaff.filter(s => s.registration_id === r.id).length}</summary>
      {staffOpen && data.registrationStaff.filter(s => s.registration_id === r.id).map(assignment => {
        const person = data.staff.find(p => p.personId === assignment.person_id && p.schoolId === r.school_id);
        return <section className="panel" key={assignment.id || assignment.person_id}><strong>{person?.name || "Profissional indisponível"}</strong><p>{event?._staffRoles?.find(role => role.id === assignment.staff_role_id)?.name}</p>{person?.photo && <PrivateFile key={person.photo.id} attachment={person.photo} api={api} photo />}{person && note(person.name)}</section>;
      })}
      {!data.registrationStaff.some(s => s.registration_id === r.id) && <p>Nenhum profissional vinculado.</p>}
      </details>
      {canReview && <div className="review-decisions"><p>As orientações serão enviadas à escola na justificativa. Confira e confirme a decisão na próxima etapa.</p><div className="staff-actions"><button className="primary" onClick={() => onDecision("approved", "Aprovar")}>Aprovar</button><button className="secondary" onClick={() => onDecision("correction_requested", "Solicitar correção", correctionReason)}>Solicitar correção</button><button className="secondary" onClick={() => onDecision("rejected", "Indeferir")}>Indeferir</button></div></div>}
    </div> : <div role="tabpanel" aria-label="Histórico">
      <p>As versões abaixo preservam os dados enviados em cada etapa. A conferência mostra o cadastro atual.</p>
      {[...history.versions].sort((a,b) => b.revision-a.revision).map(version => <details className="panel" key={version.id}><summary>Versão {version.revision} · {registrationStatusLabel[version.status]} · {new Date(version.created_at).toLocaleString("pt-BR")}</summary><h3>Atletas</h3>{version.snapshot.athletes?.map(a => <p key={a.person.id}>{a.person.full_name} · Vaga {a.allocation.slot_number}</p>)}<h3>Comissão técnica</h3>{version.snapshot.staff?.map(s => <p key={s.person.id}>{s.person.full_name}</p>)}</details>)}
      {[...history.decisions].sort((a,b) => a.created_at.localeCompare(b.created_at)).map(d => <p className="review-reason" key={d.id}>{new Date(d.created_at).toLocaleString("pt-BR")} · {registrationStatusLabel[d.to_status]}: {d.reason}</p>)}
    </div>}
  </>;
}
