import React, { useState } from "react";
import { personDataIssues, validCpf } from "./personData.js";
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
}) {
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
  const selectFile = (doc, file) => {
    setError("");
    if (!file) {
      setFiles({ ...files, [doc.id]: undefined });
      return;
    }
    const formats = doc.imageOnly
      ? ["image/png", "image/jpeg"]
      : ["application/pdf", "image/png", "image/jpeg"];
    if (
      !formats.includes(file.type) ||
      file.size > (doc.maxBytes || 5 * 1024 * 1024)
    ) {
      setError(
        `${doc.name}: use ${doc.imageOnly ? "PNG ou JPEG" : "PDF, PNG ou JPEG"} de até 5 MB.`,
      );
      return;
    }
    setFiles({ ...files, [doc.id]: file });
    setRemoved(removed.filter((id) => id !== doc.id));
  };
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
    const form = new FormData(e.currentTarget);
    const complete = e.nativeEvent.submitter?.value === "complete";
    const values = { ...athlete, name: String(form.get("name") || "").trim() };
    for (const [key] of baseDataFields)
      if (required.data[key] && required.data[key] !== "hidden")
        values[key] = String(form.get(key) || "").trim();
    values.cpf = (values.cpf || "").replace(/\D/g, "");
    if (!values.name) {
      setError("Informe o nome completo do atleta.");
      return;
    }
    if (values.cpf && !validCpf(values.cpf)) {
      setError("Informe um CPF válido.");
      return;
    }
    if (
      values.cpf &&
      records.some(
        (r) =>
          r.id !== athlete.id &&
          (!connected || r.personId !== athlete.personId) &&
          r.cpf === values.cpf,
      )
    ) {
      setError(
        "Este CPF já está cadastrado. Edite o atleta existente para vinculá-lo a este evento.",
      );
      return;
    }
    if (
      values.birth &&
      (values.birth > new Date().toISOString().slice(0, 10) ||
        values.birth < "1900-01-01")
    ) {
      setError("Informe uma data de nascimento válida.");
      return;
    }
    const coreIssues = personDataIssues(values);
    if (coreIssues.length) {
      setError(coreIssues.join(" "));
      return;
    }
    const pending = [];
    for (const [key, label] of baseDataFields)
      if (required.data[key] === "required" && !values[key])
        pending.push(label);
    if (!categoryIds.some((id) => categories.some((c) => c.id === id)))
      pending.push("Modalidade e categoria");
    if (categoryIds.some((id) => !eligibleCategories.some((c) => c.id === id)))
      pending.push("Revisar categorias indisponíveis");
    if (
      categoryIds.some((id) => {
        const c = categories.find((row) => row.id === id);
        return c && !categoryAcceptsBirth(c, values.birth);
      })
    )
      pending.push("Revisar categorias incompatíveis com o ano de nascimento");
    const docs = { ...(profile.documents || {}) };
    for (const id of removed) delete docs[id];
    for (const doc of required.documents)
      if (doc.required && !files[doc.id] && !docs[doc.id])
        pending.push(doc.name);
    const sports = sportIssues(values);
    if (complete && sports.length) {
      setError("Revise as participações: " + sports.join(" "));
      return;
    }
    if (complete && pending.length) {
      setError(`Para concluir o cadastro, preencha: ${pending.join(", ")}.`);
      return;
    }
    if (connected) {
      setBusy(true);
      setError("");
      try {
        const entry = {
          ...values,
          id: athlete.id || crypto.randomUUID(),
          schoolId,
          school: schoolName,
          archived: athlete.archived || false,
          eventProfiles: {
            ...(athlete.eventProfiles || {}),
            [String(event.id)]: {
              ...profile,
              categoryIds,
              documents: profile.documents || {},
              status: complete ? "complete" : "draft",
            },
          },
        };
        if (!(await onSave(entry, { event, files, removed, complete })))
          setError(
            "Não foi possível concluir. Os dados já gravados continuam preservados; reabra o cadastro para revisar os anexos.",
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
    for (const [docId, file] of Object.entries(files)) {
      if (!file) continue;
      const id = crypto.randomUUID();
      uploads.push({ id, file });
      if (docs[docId]) oldIds.push(docs[docId].id);
      docs[docId] = { id, name: file.name, type: file.type, size: file.size };
    }
    for (const id of removed)
      if (profile.documents?.[id]) oldIds.push(profile.documents[id].id);
    try {
      await storeDocuments(uploads);
      const entry = {
        ...values,
        id: athlete.id || crypto.randomUUID(),
        schoolId,
        school: schoolName,
        archived: athlete.archived || false,
        eventProfiles: {
          ...(athlete.eventProfiles || {}),
          [String(event.id)]: {
            ...profile,
            categoryIds,
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
        <form onSubmit={save}>
          <h3>1. Dados do atleta</h3>
          <label>
            Nome completo *
            <input
              autoFocus
              name="name"
              required
              maxLength={150}
              defaultValue={athlete.name || ""}
            />
          </label>
          <div className="form-row event-data-fields">
            {baseDataFields
              .filter(
                ([key]) =>
                  required.data[key] && required.data[key] !== "hidden",
              )
              .map(([key, label]) => (
                <label key={key}>
                  {label}
                  {required.data[key] === "required" ? " *" : " (opcional)"}
                  {key === "gender" ? (
                    <select
                      required
                      name={key}
                      value={gender}
                      onChange={(e) => {
                        const value = e.target.value;
                        setGender(value);
                        setCategoryIds((ids) =>
                          ids.filter((id) => {
                            const c = categories.find((c) => c.id === id);
                            return !c?.gender || c.gender === value;
                          }),
                        );
                      }}
                    >
                      <option value="">Selecione</option>
                      <option>Masculino</option>
                      <option>Feminino</option>
                    </select>
                  ) : (
                    <input
                      required={["cpf", "birth"].includes(key)}
                      name={key}
                      type={
                        key === "birth"
                          ? "date"
                          : key === "email"
                            ? "email"
                            : key === "phone"
                              ? "tel"
                              : "text"
                      }
                      maxLength={key === "cpf" ? 14 : 200}
                      defaultValue={
                        key === "birth"
                          ? undefined
                          : (["email", "phone", "address"].includes(key)
                              ? (profile.additionalData?.[key] ?? athlete[key])
                              : athlete[key]) || ""
                      }
                      value={key === "birth" ? birth : undefined}
                      onChange={
                        key === "birth"
                          ? (e) => changeBirth(e.target.value)
                          : undefined
                      }
                      min={key === "birth" ? "1900-01-01" : undefined}
                      max={
                        key === "birth"
                          ? new Date().toISOString().slice(0, 10)
                          : undefined
                      }
                    />
                  )}
                </label>
              ))}
          </div>
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
          <fieldset className="selection-grid">
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
          <h3>3. Documentos solicitados pelo evento</h3>
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
                    aria-label={`Anexar ${doc.name}`}
                    type="file"
                    accept={
                      doc.imageOnly ? ".png,.jpg,.jpeg" : ".pdf,.png,.jpg,.jpeg"
                    }
                    onChange={(e) => selectFile(doc, e.target.files[0])}
                  />
                </label>
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
                      onClick={() => download(existing)}
                    >
                      Baixar {existing.name}
                    </button>
                    <button
                      type="button"
                      className="text-btn"
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
