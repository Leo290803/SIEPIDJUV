import React, { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { supabase } from "./data/client.js";
export default function PersonPhoto({ photo, value, onChange, disabled = false }) {
  const input = useRef(null);
  const [preview, setPreview] = useState(""), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true, url;
    setPreview(""); setError(""); setLoading(false);
    if (value instanceof File) { url = URL.createObjectURL(value); setPreview(url); }
    else if (value !== null && photo?.objectPath) {
      setLoading(true);
      supabase.storage.from(photo.bucket).download(photo.objectPath).then(({ data, error }) => {
        if (!active) return;
        if (error) throw error;
        url = URL.createObjectURL(data); setPreview(url);
      }).catch(() => { if (active) setError("Não foi possível carregar a foto. Reabra o cadastro para tentar novamente."); }).finally(() => { if (active) setLoading(false); });
    }
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [photo?.id, value]);
  async function choose(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024) {
      setError("Selecione uma foto PNG ou JPEG de até 5 MB."); return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      bitmap.close();
      onChange(file);
    } catch { setError("Não foi possível ler esta imagem. Escolha outro arquivo PNG ou JPEG."); }
  }
  return <section className="person-photo-field" aria-label="Foto do cadastro">
    <div className="person-photo-preview">{preview ? <img src={preview} alt="Prévia da foto de identificação" /> : <Camera size={30} aria-hidden="true" />}</div>
    <div className="person-photo-details">
      <strong>Foto de identificação</strong>
      <p>Foto usada na identificação da pessoa e nos crachás dos eventos.</p>
      <div className="person-photo-actions">
        <button type="button" className="secondary" disabled={disabled} onClick={() => input.current.click()}>{preview ? "Substituir foto" : "Escolher foto"}</button>
        {(preview || photo && value !== null) && <button type="button" className="text-btn" disabled={disabled} onClick={() => onChange(photo ? null : undefined)}>Remover foto</button>}
        {value !== undefined && photo && <button type="button" className="text-btn" disabled={disabled} onClick={() => onChange(undefined)}>Cancelar alteração</button>}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg" aria-label="Foto de identificação" className="photo-file-input" tabIndex={-1} disabled={disabled} onChange={choose} />
      <small>Opcional · PNG ou JPEG · até 5 MB. A alteração é aplicada ao salvar o cadastro.</small>
      {loading && <p role="status">Carregando foto…</p>}
      {error && <p className="school-error" role="alert">{error}</p>}
    </div>
  </section>;
}
