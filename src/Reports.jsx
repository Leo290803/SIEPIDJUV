import React, { useMemo, useState, useEffect, useRef } from "react";
import { Download, FileText, Filter, RotateCcw } from "lucide-react";
import { registrationStatusLabel } from "./data/peopleMapping.js";
import { validateFilters, columnsFor, DEFAULT_FILTERS, describeFilters, filterOptions, GROUP_COLUMNS, PROFILE_TYPES, REPORT_TYPES } from "./reports/model.js";
import { exportPages } from "./reports/exportPages.js";
import {readableError} from "./data/client.js";
export default function Reports({ api, events, schools, institution }) {
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS }), [groupBy, setGroupBy] = useState(""), [sortKey, setSortKey] = useState("name"), [direction, setDirection] = useState("asc"), [selected, setSelected] = useState(columnsFor(DEFAULT_FILTERS.type).filter(c => c.visible).map(c => c.key)), [orientation, setOrientation] = useState("auto"), [exporting, setExporting] = useState(false), [exportError, setExportError] = useState("");
  const [lastExport,setLastExport]=useState(null),[progress,setProgress]=useState("");
  const exportTask=useRef(null);
  const report = {type:filters.type,title:REPORT_TYPES[filters.type].label,hint:REPORT_TYPES[filters.type].hint,
    columns:columnsFor(filters.type,!!(filters.gender||filters.yearFrom||filters.yearTo||filters.photo)),error:validateFilters(filters)};
  const options = useMemo(() => filterOptions(events, schools, filters), [events, schools, filters]);
  const groupOptions = report.columns.filter(c => c.group);
  const groupColumn = groupOptions.find(c => c.key === groupBy);
  const columns = groupColumn ? GROUP_COLUMNS.map(c => c.key === "name" ? { ...c, label: groupColumn.label } : c) : report.columns.filter(c => selected.includes(c.key));
  const sortColumns = groupColumn ? columns : report.columns;
  const activeSort = sortColumns.some(c => c.key === sortKey) ? sortKey : sortColumns[0].key;
  const request={filters,groupBy:groupColumn ? groupBy : "",sort:activeSort,direction,offset:0,limit:500};
  const requestKey=JSON.stringify(request);
  // Alterar filtros é local: nenhuma listagem ou contagem é consultada aqui.
  useEffect(()=>{setExportError("");setLastExport(null);},[requestKey]);
  useEffect(()=>()=>{exportTask.current?.controller.abort();exportTask.current?.worker.terminate();},[]);
  const filterLabels = describeFilters(events, schools, filters);
  const title = report.title + (groupColumn ? ` — resumo por ${groupColumn.label.toLocaleLowerCase("pt-BR")}` : "");
  const canExport = !report.error && columns.length > 0 && !exporting;
  function change(key, value) {
    setFilters(current => ({ ...current, [key]: value, ...(key === "eventId" ? { modalityId: "", categoryId: "", proofId: "" } : key === "modalityId" ? { categoryId: "", proofId: "" } : key === "categoryId" ? { proofId: "" } : {}), ...(key === "profileStatus" && value === "Encerrado" ? { includeArchived: true } : {}) }));
    setExportError("");
  }
  function changeType(type) {
    const nextColumns = columnsFor(type); setFilters(current => ({ ...current, type, profileStatus: "" })); setSelected(nextColumns.filter(c => c.visible).map(c => c.key)); setSortKey(nextColumns[0].key); setGroupBy(""); setExportError("");
  }
  function clear() { setFilters({ ...DEFAULT_FILTERS, type: filters.type }); setExportError(""); }
  async function exportFile(format) {
    if(!canExport || exportTask.current)return;
    setExporting(true);setExportError("");setLastExport(null);setProgress("Consultando os dados do arquivo…");
    const controller=new AbortController();
    const worker=new Worker(new URL('./reports/export.worker.js',import.meta.url),{type:'module'});
    exportTask.current={controller,worker};
    const timeout=setTimeout(()=>controller.abort(Error('A exportação demorou demais. Use mais filtros ou tente novamente.')),120000);
    try {
      const generated=new Promise((resolve,reject)=>{
        worker.onmessage=({data})=>data.error?reject(Error(data.error)):resolve(data.blob);
        worker.onerror=()=>reject(Error('Não foi possível gerar o arquivo. Tente uma seleção menor.'));
        controller.signal.addEventListener('abort',()=>reject(new DOMException('Cancelado','AbortError')),{once:true});
      });
      // A rejeição pode ocorrer enquanto o próximo lote ainda está sendo consultado.
      generated.catch(()=>{});
      // Primeiro lote só é solicitado ao gerar; é reaproveitado na exportação.
      const first=await api.reportPage(institution.id,{...request,offset:0,limit:500},controller.signal);
      controller.signal.throwIfAborted();
      if(!first.total)throw Error('Nenhum registro encontrado para estes filtros. Ajuste a seleção e gere novamente.');
      worker.postMessage({action:'start',settings:{format,title,institution:institution.name,columns,
        filters:[...filterLabels,`Ordenação: ${sortColumns.find(c=>c.key===activeSort)?.label} (${direction==='asc'?'crescente':'decrescente'})`],summary:first.summary,orientation}});
      const completed=await exportPages({fetchPage:(options,signal)=>options.offset===0 ? Promise.resolve(first) : api.reportPage(institution.id,options,signal),options:request,snapshot:first.snapshot,signal:controller.signal,
        onBatch:batch=>worker.postMessage({action:'append',rows:batch.map(r=>({cells:Object.fromEntries(columns.map(c=>[c.key,r.cells[c.key]]))}))}),
        onProgress:(done,count)=>setProgress(`Preparando ${done.toLocaleString('pt-BR')} de ${count.toLocaleString('pt-BR')} linhas…`)});
      controller.signal.throwIfAborted();setProgress("Gerando arquivo…");worker.postMessage({action:'finish'});
      const blob=await generated;controller.signal.throwIfAborted();
      const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`siep-${filters.type}${groupColumn?'-resumo':''}.${format}`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setLastExport({format:format.toUpperCase(),total:completed.total});
    }catch(error){if(controller.signal.aborted && controller.signal.reason?.name!=='AbortError')setExportError(controller.signal.reason.message);else if(!controller.signal.aborted)setExportError(error.code==='40001'?'Os dados mudaram durante a geração. Tente gerar o arquivo novamente.':readableError(error));}
    finally{clearTimeout(timeout);controller.abort();worker.terminate();exportTask.current=null;setExporting(false);setProgress("");}
  }
  const select = (key, label, values, all, disabled = false) => <label>{label}<select aria-label={label} value={filters[key]} disabled={disabled || exporting} onChange={e => change(key, e.target.value)}><option value="">{all}</option>{values.map(value => <option key={value.id} value={value.id}>{value.label}</option>)}</select></label>;
  const advancedCount = [filters.from, filters.to, filters.yearFrom, filters.yearTo, filters.photo, filters.profileStatus, filters.includeArchived && [...PROFILE_TYPES, "schools", "events"].includes(filters.type)].filter(Boolean).length;
  return <section className="reports-workspace">
    <div className="panel report-filters">
      <div className="section-title"><div><h2><Filter size={18} aria-hidden="true" /> Relatórios e filtros</h2><p className="panel-desc">Escolha o tipo de relatório, combine os filtros e gere o arquivo em PDF ou CSV.</p></div><button type="button" className="secondary" disabled={exporting} onClick={clear}><RotateCcw size={14} />Limpar filtros</button></div>
      <div className="report-kind"><label>Tipo de relatório<select aria-label="Tipo de relatório" value={filters.type} disabled={exporting} onChange={e => changeType(e.target.value)}>{Object.entries(REPORT_TYPES).map(([key, type]) => <option key={key} value={key}>{type.label}</option>)}</select></label><p className="form-note">{report.hint}</p></div>
      <div className="report-filter-grid">
        {select("eventId", "Evento do relatório", events.map(e => ({ id: e.id, label: `${e.name} · ${e.year}` })), "Todos os eventos")}
        {select("schoolId", "Escola do relatório", schools.map(s => ({ id: s.id, label: s.name })), "Todas as escolas")}
        {select("gender", "Sexo", [{ id: "Masculino", label: "Masculino" }, { id: "Feminino", label: "Feminino" }, { id: "unknown", label: "Não informado" }], "Todos os sexos")}
        {select("modalityId", "Modalidade", options.modalities, "Todas as modalidades", !options.modalities.length)}
        {select("categoryId", "Categoria", options.categories, "Todas as categorias", !options.categories.length)}
        {select("proofId", "Prova", options.proofs, "Todas as provas", !options.proofs.length)}
        {select("city", "Município", options.cities.map(city => ({ id: city, label: city })), "Todos os municípios")}
        {select("status", "Situação da inscrição", Object.entries(registrationStatusLabel).map(([id, label]) => ({ id, label })), "Todas as situações")}
        <label>Pesquisar nome, escola ou CPF<input aria-label="Pesquisar no relatório" type="search" value={filters.query} disabled={exporting} onChange={e => change("query", e.target.value)} /></label>
      </div>
      <details className="report-advanced"><summary>Mais filtros{advancedCount ? ` · ${advancedCount} ativo(s)` : ""}</summary><div className="report-filter-grid">
        <label>Inscrições criadas de<input aria-label="Inscrições criadas de" type="date" value={filters.from} disabled={exporting} onChange={e => change("from", e.target.value)} /></label>
        <label>Inscrições criadas até<input aria-label="Inscrições criadas até" type="date" value={filters.to} disabled={exporting} onChange={e => change("to", e.target.value)} /></label>
        <label>Ano de nascimento inicial<input aria-label="Ano de nascimento inicial" type="number" min="1900" max={new Date().getFullYear()} value={filters.yearFrom} disabled={exporting} onChange={e => change("yearFrom", e.target.value)} /></label>
        <label>Ano de nascimento final<input aria-label="Ano de nascimento final" type="number" min="1900" max={new Date().getFullYear()} value={filters.yearTo} disabled={exporting} onChange={e => change("yearTo", e.target.value)} /></label>
        {select("photo", "Foto de identificação", [{ id: "with", label: "Com foto" }, { id: "without", label: "Sem foto" }], "Com e sem foto")}
        {PROFILE_TYPES.includes(filters.type) && select("profileStatus", "Situação do cadastro", ["Pendente", "Aprovado", "Recusado", "Encerrado"].map(id => ({ id, label: id })), "Todas")}
        {[...PROFILE_TYPES, "schools", "events"].includes(filters.type) && <label className="report-checkbox"><input type="checkbox" checked={filters.includeArchived} disabled={exporting} onChange={e => change("includeArchived", e.target.checked)} />Incluir cadastros arquivados</label>}
      </div></details>
    </div>
    <div className="panel report-results">
      <div className="section-title"><div><h2>{report.title}</h2><p className="panel-desc">O arquivo inclui todos os registros filtrados e as colunas selecionadas. Os nomes aparecem somente no arquivo gerado.</p></div><div className="report-export-actions"><button className="secondary" disabled={!canExport} onClick={() => exportFile("csv")}><Download size={15} />Exportar CSV</button><button className="primary" disabled={!canExport} onClick={() => exportFile("pdf")}><FileText size={15} />Exportar PDF</button></div></div>
      <div className="report-filter-grid report-view-options">
        <label>Apresentação<select aria-label="Apresentação do relatório" value={groupBy} disabled={exporting} onChange={e => { setGroupBy(e.target.value); setSortKey(e.target.value ? "name" : report.columns[0].key); }}><option value="">Listagem detalhada</option>{groupOptions.map(c => <option key={c.key} value={c.key}>Resumo por {c.label.toLocaleLowerCase("pt-BR")}</option>)}</select></label>
        <label>Ordenar por<select aria-label="Ordenar relatório por" value={activeSort} disabled={exporting} onChange={e => { setSortKey(e.target.value); }}>{sortColumns.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
        <label>Ordem<select aria-label="Ordem do relatório" value={direction} disabled={exporting} onChange={e => { setDirection(e.target.value); }}><option value="asc">Crescente</option><option value="desc">Decrescente</option></select></label>
        <label>Orientação do PDF<select aria-label="Orientação do PDF" value={orientation} disabled={exporting} onChange={e => setOrientation(e.target.value)}><option value="auto">Automática</option><option value="portrait">Retrato</option><option value="landscape">Paisagem</option></select></label>
      </div>
      {!groupColumn && <details className="report-columns"><summary>Personalizar colunas · {columns.length} selecionada(s)</summary><div className="report-column-grid">{report.columns.map(c => <label key={c.key} className="report-checkbox"><input type="checkbox" aria-label={`Coluna ${c.label}`} checked={selected.includes(c.key)} disabled={exporting || selected.length === 1 && selected.includes(c.key)} onChange={e => setSelected(e.target.checked ? [...selected, c.key] : selected.filter(key => key !== c.key))} />{c.label}</label>)}</div></details>}
      <div className="report-applied" aria-label="Filtros aplicados">{filterLabels.map(label => <span key={label}>{label}</span>)}</div>
      {lastExport && <p className="school-success" role="status">Arquivo {lastExport.format} gerado com {lastExport.total.toLocaleString("pt-BR")} linha(s).</p>}
      {exporting && <div className="report-progress" role="status"><span>{progress}</span><button className="secondary" onClick={()=>{exportTask.current?.controller.abort();exportTask.current?.worker.terminate();}}>Cancelar exportação</button></div>}
      {(report.error || exportError) && <p className="school-error" role="alert">{report.error || exportError}</p>}

    </div>
  </section>;
}
