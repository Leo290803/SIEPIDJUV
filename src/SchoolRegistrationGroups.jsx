import React from "react";
import { ChevronRight } from "lucide-react";

function countLabel(count, singular, plural) {
  return count + " " + (count === 1 ? singular : plural);
}

function attention(group) {
  return [group.drafts ? `${group.drafts} a concluir` : "",group.corrections ? `${group.corrections} a corrigir` : ""].filter(Boolean).join(" · ");
}

export default function SchoolRegistrationGroups({event, groups, modality, onModality, onCategory, loading}) {
  if (loading && !groups.length) return <p role="status">Carregando inscrições…</p>;
  const categories = new Map(event.categories.map(item => [item.id,item]));
  let entries;
  if (modality) {
    entries = groups.filter(group => group.modality_id === modality.id).map(group => ({
      ...group,id:group.category_id,name:categories.get(group.category_id)?.name || "Categoria",
      detail:group.proofs ? countLabel(group.proofs,"prova","provas") : countLabel(group.total,"inscrição","inscrições"),
    }));
  } else {
    const modalities = new Map(event.modalities.map(item => [item.id,item]));
    const byModality = new Map();
    for (const group of groups) {
      const item = modalities.get(group.modality_id);
      const summary = byModality.get(group.modality_id) || {
        id:group.modality_id,name:item?.name || "Modalidade",team:item?.classification === "Coletiva",
        total:0,proofs:0,categories:0,drafts:0,corrections:0,
      };
      summary.total += group.total;summary.proofs += group.proofs;summary.categories++;
      summary.drafts += group.drafts;summary.corrections += group.corrections;
      byModality.set(group.modality_id,summary);
    }
    entries = [...byModality.values()].map(group => ({
      ...group,
      detail:group.team ? countLabel(group.total,"equipe","equipes")
        : group.proofs ? countLabel(group.proofs,"prova com inscrição","provas com inscrições")
        : countLabel(group.categories,"categoria com inscrição","categorias com inscrições"),
    }));
  }
  if (!entries.length) return <p className="empty">Nenhuma inscrição encontrada.</p>;
  return <ul className="school-registration-groups">
    {entries.sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")).map(entry => (
      <li key={entry.id}>
        <button type="button" onClick={()=>modality ? onCategory(entry.id) : onModality(entry.id)}
          aria-label={`Ver inscrições de ${entry.name}`}>
          <span><strong>{entry.name}</strong><small>{[entry.detail,attention(entry)].filter(Boolean).join(" · ")}</small></span>
          <ChevronRight size={17} aria-hidden="true"/>
        </button>
      </li>
    ))}
  </ul>;
}
