import PersonPhoto from "./PersonPhoto.jsx";
import FormIssues from "./FormIssues.jsx";
import {eventFormIssues} from "./eventFormIssues.js";
import {guardianFields,guardianPolicy,isMinorAt,guardianRelationships} from "./guardianRequirements.js";
import React, { useState, useId, useEffect } from "react";
import { X, Check } from "lucide-react";
import { requirementsFor, baseDataFields } from "./eventRequirements.js";
import {
  categoryAcceptsBirth,
  hasBirthYearRange,
  birthYearFromDate,
} from "./categoryEligibility.js";
import { validateParticipation } from "./participationRules.js";
import {
  storeDocuments,
  readDocument,
  deleteDocuments,
} from "./localDocuments.js";
export default function EventAthleteForm({
  event,
  schoolId,
  schoolName,
  athlete,
  records,
  onSave,
  onClose,
  connected = false,
  onDocumentDownload,
  focusField,
  correctionNotice,
}) {
  const [photoChange, setPhotoChange] = useState(undefined);
  const prefix=useId();
  const [values,setValues]=useState(()=>({...athlete,...Object.fromEntries(baseDataFields.map(([key])=>[key,athlete.eventProfiles?.[String(event.id)]?.additionalData?.[key] ?? athlete[key] ?? ''])),...Object.fromEntries(guardianFields.map(([key])=>[key,athlete.eventProfiles?.[String(event.id)]?.additionalData?.[key] || '']))}));
  const [attempted,setAttempted]=useState(''),[touched,setTouched]=useState([]),[fileErrors,setFileErrors]=useState({});
  const fieldId=key=>`${prefix}-${encodeURIComponent(key)}`;
  const changeValue=(key,value)=>{setValues(current=>({...current,[key]:value}));setError('');};
  const goTo=key=>{
    setTouched(current=>current.includes(key)?current:[...current,key]);
    requestAnimationFrame(()=>{
      const target=document.getElementById(fieldId(key));
      if(!target)return;
      target.scrollIntoView({block:'center',behavior:'auto'});
      (target.matches('input,select,textarea')?target:target.querySelector('input,select,button')||target).focus({preventScroll:true});
    });
  };
  useEffect(() => { if(focusField) goTo(focusField); }, [focusField]);
  const profile = athlete.eventProfiles?.[String(event.id)] || {};
  const source = requirementsFor(event);
  const required = { ...source, data: { ...source.data } };
  const [categoryIds, setCategoryIds] = useState(profile.categoryIds || []),
    [files, setFiles] = useState({}),
    [removed, setRemoved] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [birth, setBirth] = useState(athlete.birth || ""),
    [birthNotice, setBirthNotice] = useState(""),
    [gender, setGender] = useState(athlete.gender || "");
  const categories = (event.categories || []).filter(
    (c) => c.enabled !== false,
  );
  required.documents = source.documents.filter(
    (d) => !d.categoryId || categoryIds.includes(d.categoryId),
  );
  if (
    (event.validationRules || []).some(
      (r) =>
        r.kind === "age" &&
        r.enabled !== false &&
        !r.proofId &&
        categoryIds.includes(r.categoryId),
    )
  )
    required.data.birth = "required";
  if (categories.some(hasBirthYearRange)) required.data.birth = "required";
  const eligibleCategories = categories.filter(
    (c) => categoryAcceptsBirth(c, birth) && (!c.gender || c.gender === gender),
  );
  const changeBirth = (value) => {
    setBirth(value);
    setError("");
    const invalid = categoryIds.filter((id) => {
      const c = categories.find((row) => row.id === id);
      return c && !categoryAcceptsBirth(c, value);
    });
    if (invalid.length) {
      setCategoryIds(categoryIds.filter((id) => !invalid.includes(id)));
      setBirthNotice(
        "A data de nascimento mudou. As categorias incompatíveis foram retiradas da seleção; confira as opções disponíveis.",
      );
    } else setBirthNotice("");
  };
  const sportIssues = (values) => {
    const athleteId = athlete.id || "cadastro";
    const entries = categoryIds.map((id) => ({
      id: "cadastro-" + id,
      eventId: event.id,
      categoryId: id,
      athleteIds: [athleteId],
    }));
    const filtered = {
      ...event,
      validationRules: (event.validationRules || []).filter(
        (r) =>
          ["modalities", "athleteCategories", "age"].includes(r.kind) &&
          !r.proofId,
      ),
    };
    return [
      ...new Set(
        entries
          .flatMap((entry) =>
            validateParticipation(filtered, entries, entry, {
              athletes: [{ ...values, id: athleteId }],
            }),
          )
          .map((issue) =>
            issue.includes("|") ? issue.split("|").slice(1).join("|") : issue,
          ),
      ),
    ];
  };
  const toggle = (id) =>
    setCategoryIds(
      categoryIds.includes(id)
        ? categoryIds.filter((v) => v !== id)
        : [...categoryIds, id],
    );
  const selectFile = (doc,file,input) => {
    setError('');
    if(!file){setFiles({...files,[doc.id]:undefined});setFileErrors(current=>({...current,[doc.id]:''}));return;}
    const formats=doc.imageOnly?['image/png','image/jpeg']:['application/pdf','image/png','image/jpeg'];
    if(!formats.includes(file.type)||file.size<1||file.size>(doc.maxBytes||5*1024*1024)){
      setFileErrors(current=>({...current,[doc.id]:`${doc.name}: selecione ${doc.imageOnly?'PNG ou JPEG':'PDF, PNG ou JPEG'} de até ${Math.round((doc.maxBytes||5242880)/1048576)} MB.`}));
      input.value='';return;
    }
    setFileErrors(current=>({...current,[doc.id]:''}));setFiles({...files,[doc.id]:file});setRemoved(removed.filter(id=>id!==doc.id));
  };
  const liveValues={...values,birth,gender};
  const currentSports=categoryIds.length?sportIssues(liveValues):[];
  const issues=eventFormIssues({event,values:liveValues,categoryIds,files,removed,profile,fileErrors,sportIssues:currentSports});
  if(liveValues.cpf&&records.some(r=>r.id!==athlete.id&&(!connected||r.personId!==athlete.personId)&&r.cpf===String(liveValues.cpf).replace(/\D/g,'')))issues.push({key:'cpf',message:'Este CPF já está cadastrado. Abra o atleta existente para vinculá-lo ao evento.',blockingDraft:true});
  const messages=key=>issues.filter(issue=>issue.key===key&&(attempted==='complete'||attempted==='draft'&&issue.blockingDraft||touched.includes(key)));
  const attributes=key=>({id:fieldId(key),'aria-invalid':messages(key).length>0||undefined,'aria-describedby':messages(key).length?fieldId(key)+'-error':undefined,onBlur:()=>setTouched(current=>current.includes(key)?current:[...current,key])});
  const inline=key=>messages(key).length>0&&<span className="field-error" id={fieldId(key)+'-error'}>{messages(key).map(issue=>issue.message).join(' ')}</span>;
  const download = async (attachment) => {
    try {
      const stored = connected
        ? { file: await onDocumentDownload(attachment) }
        : await readDocument(attachment.id);
      if (!stored) {
        setError("Arquivo não encontrado neste navegador. Anexe novamente.");
        return;
      }
      const url = URL.createObjectURL(stored.file);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Não foi possível abrir o arquivo local.");
    }
  };
  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    const complete=e.nativeEvent.submitter?.value==='complete';
    setAttempted(complete?'complete':'draft');
    const blocking=issues.filter(issue=>complete||issue.blockingDraft);
    if(blocking.length){
      setError('');
      if(complete)requestAnimationFrame(()=>{const summary=document.getElementById(fieldId('issues'));summary?.scrollIntoView({block:'start',behavior:'auto'});summary?.focus({preventScroll:true});});
      else goTo(blocking[0].key);
      return;
    }
    const values={...liveValues,name:String(liveValues.name||'').trim(),cpf:String(liveValues.cpf||'').replace(/\D/g,'')};
    const personValues={...values};
    for(const [key] of guardianFields)delete personValues[key];
    const docs={...(profile.documents||{})};
    const pending=issues.map(issue=>issue.message),sports=[];
    const additionalData={...(profile.additionalData||{})};
    for(const [key] of baseDataFields)if(required.data[key]&&required.data[key]!=='hidden'&&!['cpf','birth','gender'].includes(key))additionalData[key]=String(values[key]||'').trim();
    if(guardianPolicy(event).enabled&&isMinorAt(values.birth,guardianPolicy(event).referenceDate))for(const [key] of guardianFields)if(guardianPolicy(event).fields[key]!=='hidden')additionalData[key]=key==='guardian_cpf'?String(values[key]||'').replace(/\D/g,''):String(values[key]||'').trim();
    const visibleDocs=new Set(required.documents.map(doc=>doc.id));
    const activeFiles=Object.fromEntries(Object.entries(files).filter(([id,file])=>visibleDocs.has(id)&&file));
    const activeRemoved=removed.filter(id=>visibleDocs.has(id));
    for(const id of activeRemoved)delete docs[id];
    if (connected) {
      setBusy(true);
      setError("");
      try {
        const entry = {
          ...personValues,
          id: athlete.id || crypto.randomUUID(),
          schoolId,
          school: schoolName,
          archived: athlete.archived || false,
          eventProfiles: {
            ...(athlete.eventProfiles || {}),
            [String(event.id)]: {
              ...profile,
              categoryIds,
              additionalData,
              documents: profile.documents || {},
              status: complete ? "complete" : "draft",
            },
          },
        };
        if (!(await onSave(entry, { event, files:activeFiles, removed:activeRemoved, complete, photo: photoChange })))
          setError(
            "Não foi possível concluir. Os dados já gravados continuam preservados; reabra o cadastro para revisar os dados e os anexos.",
          );
      } catch (error) {
        setError(error.message);
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    setError("");
    const uploads = [],
      oldIds = [];
    for (const [docId, file] of Object.entries(activeFiles)) {
      if (!file) continue;
      const id = crypto.randomUUID();
      uploads.push({ id, file });
      if (docs[docId]) oldIds.push(docs[docId].id);
      docs[docId] = { id, name: file.name, type: file.type, size: file.size };
    }
    for (const id of activeRemoved)
      if (profile.documents?.[id]) oldIds.push(profile.documents[id].id);
    try {
      await storeDocuments(uploads);
      const entry = {
        ...personValues,
        id: athlete.id || crypto.randomUUID(),
        schoolId,
        school: schoolName,
        archived: athlete.archived || false,
        eventProfiles: {
          ...(athlete.eventProfiles || {}),
          [String(event.id)]: {
            ...profile,
            categoryIds,
            additionalData,
            documents: docs,
            status: complete ? "complete" : "draft",
            pending: [...pending, ...sports],
            updatedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date().toISOString(),
      };
      if (!(await onSave(entry)))
        throw Error("Não foi possível salvar o cadastro.");
      deleteDocuments(oldIds).catch(() => {});
    } catch {
      await deleteDocuments(uploads.map((u) => u.id)).catch(() => {});
      setError(
        "Não foi possível salvar os dados e anexos neste navegador. Tente novamente ou libere espaço.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop">
      <div
        className="modal athlete-event-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="athlete-title"
      >
        <button
          className="close"
          aria-label="Fechar cadastro"
          disabled={busy}
          onClick={onClose}
        >
          <X />
        </button>
        <h2 id="athlete-title">
          {athlete.id
            ? "Revisar atleta no evento"
            : "Cadastrar atleta no evento"}
        </h2>
        <div className="info-box">
          <div>
            <strong>
              {event.name} · {event.year}
            </strong>
            <br />
            {schoolName}
            <br />
            Evento e escola definidos automaticamente. Troque o evento fora
            deste formulário.
          </div>
        </div>
        <form onSubmit={save} noValidate>
          {correctionNotice && <p className="participation-issues" role="status">{correctionNotice}</p>}
          {attempted==='complete'&&issues.length>0&&<FormIssues id={fieldId('issues')} issues={issues} onGo={goTo} disabled={busy}/>}
          <h3>1. Dados do atleta</h3>
          {connected && <PersonPhoto photo={athlete.photo} value={photoChange} onChange={setPhotoChange} disabled={busy} />}
          <label>Nome completo *<input {...attributes('name')} aria-label="Nome completo *" autoFocus name="name" required maxLength={150} disabled={busy} value={values.name||''} onChange={e=>changeValue('name',e.target.value)}/>{inline('name')}</label>
          <div className="form-row event-data-fields">{baseDataFields.filter(([key])=>required.data[key]&&required.data[key]!=='hidden').map(([key,label])=><label key={key}>{label}{required.data[key]==='required'?' *':' (opcional)'}
            {key==='gender'?<select {...attributes(key)} aria-label={label+(required.data[key]==='required'?' *':' (opcional)')} required name={key} disabled={busy} value={gender} onChange={e=>{const value=e.target.value;setGender(value);setError('');setCategoryIds(ids=>ids.filter(id=>{const c=categories.find(c=>c.id===id);return !c?.gender||c.gender===value;}));}}><option value="">Selecione</option><option>Masculino</option><option>Feminino</option></select>:
            <input {...attributes(key)} aria-label={label+(required.data[key]==='required'?' *':' (opcional)')} required={required.data[key]==='required'} disabled={busy} name={key} type={key==='birth'?'date':key==='email'?'email':key==='phone'?'tel':'text'} inputMode={key==='cpf'?'numeric':undefined} maxLength={key==='cpf'?14:200} value={key==='birth'?birth:values[key]||''} onChange={e=>key==='birth'?changeBirth(e.target.value):changeValue(key,e.target.value)} min={key==='birth'?'1900-01-01':undefined} max={key==='birth'?new Date().toISOString().slice(0,10):undefined}/>} {inline(key)}
          </label>)}</div>
          <h3>2. Modalidades e categorias deste evento</h3>
          <p className="form-note">
            As opções são filtradas automaticamente pelo ano de nascimento.
            Marque as participações pretendidas; vagas e provas serão
            preenchidas nas inscrições.
          </p>
          <p className="form-note">
            {birthYearFromDate(birth) !== null
              ? `Nascimento: ${birthYearFromDate(birth)}. Exibindo as categorias compatíveis e as sem restrição de nascimento.`
              : categories.some(hasBirthYearRange)
                ? "Preencha a data de nascimento para exibir as categorias com faixa de anos."
                : "Este evento ainda não definiu faixas de anos nas categorias."}
          </p>
          {birthNotice && (
            <p className="info-box" role="status">
              {birthNotice}
            </p>
          )}
          <fieldset {...attributes('categories')} aria-label="Modalidades e categorias deste evento" tabIndex={-1} className="selection-grid" disabled={busy}>
            {eligibleCategories.map((c) => (
              <label className="checkbox" key={c.id}>
                <input
                  type="checkbox"
                  checked={categoryIds.includes(c.id)}
                  onChange={() => toggle(c.id)}
                />
                <span>
                  {c.modality} · {c.name}
                  {hasBirthYearRange(c) && (
                    <small className="field-help">
                      Nascidos de {c.birthYearStart} a {c.birthYearEnd}
                    </small>
                  )}
                </span>
              </label>
            ))}
            {categoryIds
              .filter((id) => !eligibleCategories.some((c) => c.id === id))
              .map((id) => (
                <label className="checkbox" key={id}>
                  <input type="checkbox" checked onChange={() => toggle(id)} />
                  Categoria indisponível — remover seleção
                </label>
              ))}
            {!categories.length ? (
              <p className="form-note">
                A secretaria ainda não configurou categorias para este evento.
                Você pode salvar um rascunho.
              </p>
            ) : (
              !eligibleCategories.length && (
                <p className="form-note">
                  {birthYearFromDate(birth) !== null
                    ? "Nenhuma modalidade/categoria aceita este ano de nascimento. Confira a data ou consulte a secretaria."
                    : "Nenhuma categoria disponível até informar uma data de nascimento válida."}
                </p>
              )
            )}
          </fieldset>
          {inline('categories')}
          {guardianPolicy(event).enabled&&(isMinorAt(birth,guardianPolicy(event).referenceDate)||issues.some(issue=>issue.key==='guardian_config'))&&<section className="guardian-fields" id={fieldId('guardian_config')} tabIndex={-1} aria-label="Dados do responsável legal">
            <h3>3. Dados do responsável legal</h3><p className="form-note">Solicitado para menores de 18 anos no início do evento ({guardianPolicy(event).referenceDate?.split('-').reverse().join('/')}). Informe os dados do pai, mãe ou tutor.</p>
            <div className="form-row event-data-fields">{guardianFields.filter(([key])=>guardianPolicy(event).fields[key]!=='hidden').map(([key,label])=><label key={key}>{label}{guardianPolicy(event).fields[key]==='required'?' *':' (opcional)'}
              {key==='guardian_relationship'?<select {...attributes(key)} aria-label={label+(guardianPolicy(event).fields[key]==='required'?' *':' (opcional)')} name={key} aria-required={guardianPolicy(event).fields[key]==='required'} disabled={busy} value={values[key]||''} onChange={e=>changeValue(key,e.target.value)}><option value="">Selecione</option>{guardianRelationships.map(value=><option key={value}>{value}</option>)}</select>:<input {...attributes(key)} aria-label={label+(guardianPolicy(event).fields[key]==='required'?' *':' (opcional)')} disabled={busy} aria-required={guardianPolicy(event).fields[key]==='required'} name={key} type={key==='guardian_email'?'email':key==='guardian_phone'?'tel':'text'} inputMode={key==='guardian_cpf'?'numeric':undefined} maxLength={key==='guardian_cpf'?14:key==='guardian_phone'?32:key==='guardian_name'?150:200} value={values[key]||''} onChange={e=>changeValue(key,e.target.value)}/>} {inline(key)}
            </label>)}</div>
            {inline('guardian_config')}
          </section>}
          <h3>{guardianPolicy(event).enabled&&isMinorAt(birth,guardianPolicy(event).referenceDate)?'4':'3'}. Documentos solicitados pelo evento</h3>
          <p className="form-note">
            {connected
              ? "Anexos são enviados ao armazenamento privado da instituição. Cada arquivo: até 5 MB."
              : "Anexos ficam somente neste navegador. Não são enviados à secretaria. Cada arquivo: até 5 MB."}
          </p>
          {required.documents.map((doc) => {
            const existing =
              !removed.includes(doc.id) && profile.documents?.[doc.id];
            return (
              <div className="document-field" key={doc.id}>
                <label>
                  {doc.name}
                  {doc.required ? " *" : " (opcional)"}
                  <input
                    {...attributes('document:'+doc.id)}
                    aria-label={`Anexar ${doc.name}`}
                    disabled={busy}
                    aria-required={doc.required}
                    type="file"
                    accept={
                      doc.imageOnly ? ".png,.jpg,.jpeg" : ".pdf,.png,.jpg,.jpeg"
                    }
                    onChange={(e) => selectFile(doc, e.target.files[0],e.target)}
                  />
                </label>
                {inline('document:'+doc.id)}
                {(files[doc.id]||fileErrors[doc.id])&&<button type="button" className="text-btn" disabled={busy} onClick={()=>{setFiles({...files,[doc.id]:undefined});setFileErrors({...fileErrors,[doc.id]:''});const input=document.getElementById(fieldId('document:'+doc.id));if(input)input.value='';}}>Cancelar novo arquivo</button>}
                {files[doc.id] && (
                  <p className="form-note">
                    Novo arquivo: {files[doc.id].name}
                  </p>
                )}
                {existing && !files[doc.id] && (
                  <div className="staff-actions">
                    <button
                      type="button"
                      className="text-btn"
                      disabled={busy}
                      onClick={() => download(existing)}
                    >
                      Baixar {existing.name}
                    </button>
                    <button
                      type="button"
                      className="text-btn"
                      disabled={busy}
                      onClick={() => setRemoved([...removed, doc.id])}
                    >
                      Remover anexo
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {!required.documents.length && (
            <p className="info-box">Este evento não solicita anexos.</p>
          )}
          <p className="form-note">
            Nome completo, nascimento, CPF e sexo são obrigatórios, inclusive
            para salvar rascunho. “Concluir cadastro” também verifica os demais
            dados e documentos exigidos. Não envia inscrição nem ocupa vaga na
            prova. Limites de modalidades, categorias e idade já são conferidos
            neste cadastro quando configurados. Limites de provas e equipes são
            verificados ao montar as inscrições.
          </p>
          {error && (
            <p className="school-error" role="alert">
              {error}
            </p>
          )}
          <div className="school-form-footer sticky-form-footer">
            <button
              type="submit"
              value="draft"
              className="secondary"
              disabled={busy}
            >
              Salvar rascunho
            </button>
            <button
              type="submit"
              value="complete"
              className="primary"
              disabled={busy}
            >
              <Check size={15} />
              {busy ? "Salvando..." : "Concluir cadastro"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
