import React, {useEffect,useState} from "react";
import { X } from "lucide-react";
import ServerPagination from "./ServerPagination.jsx";
import { readableError } from "./data/client.js";

const roles={athlete:"Atleta",staff:"Comissão técnica",responsible:"Responsável escolar"};
const reasons={
  event_archived:"Evento arquivado",
  school_archived:"Escola arquivada",
  registration_draft:"Concluir e enviar a inscrição",
  registration_correction:"Corrigir e reenviar a inscrição",
  registration_approval:"Aguardando aprovação da inscrição",
  staff_not_submitted:"Inscrever profissional no evento",
  staff_review:"Aguardando conferência do técnico",
  staff_correction:"Corrigir o cadastro do técnico",
  staff_rejected:"Conferência do técnico indeferida",
  inactive_link:"Conferir vínculo do cadastro",
  photo:"Adicionar foto de identificação",
};

export default function BadgeReadiness({api,event,school,role,query,onClose}) {
  const [offset,setOffset]=useState(0);
  const [data,setData]=useState({rows:[],total:0});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);
    setError("");
    api.badgeReadiness(event.id,school.id,role,query,offset,controller.signal)
      .then(result=>{if(!controller.signal.aborted)setData(result);})
      .catch(error=>{if(!controller.signal.aborted)setError(readableError(error));})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[api,event.id,school.id,role,query,offset]);
  return <div className="modal-backdrop">
    <div className="modal athlete-event-modal" role="dialog" aria-modal="true" aria-labelledby="badge-readiness-title">
      <button type="button" className="close" aria-label="Fechar pendências" onClick={onClose}><X/></button>
      <h2 id="badge-readiness-title">Pendências dos crachás</h2>
      <p>{event.name} · {school.name}</p>
      {loading ? <p role="status">Consultando pendências…</p> : error ? <p className="school-error" role="alert">{error}</p> :
        <div className="table-scroll"><table><thead><tr><th>Pessoa</th><th>Perfil</th><th>Situação</th></tr></thead>
          <tbody>{data.rows.map(row=><tr key={row.person_id+":"+row.role}>
            <td>{row.person_name}</td>
            <td>{roles[row.role]}</td>
            <td>{row.reasons.length ? row.reasons.map(reason=><div key={reason}>{reasons[reason]}</div>)
              : <span className="tag live">Pronto para emitir</span>}</td>
          </tr>)}
          {!data.rows.length&&<tr><td colSpan={3} className="table-empty">Nenhuma pessoa encontrada para estes filtros.</td></tr>}
          </tbody></table></div>}
      {!error && <ServerPagination total={data.total} offset={offset} loading={loading} onPage={setOffset}/>}
    </div>
  </div>;
}
