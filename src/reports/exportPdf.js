export async function createReportPdf({ title, institution, columns, rows, filters, summary, orientation = "auto", generatedAt = new Date() }) {
  if (!columns.length || !rows.length) throw Error("Não há resultados ou colunas para exportar.");
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const direction = orientation === "auto" ? (columns.length > 6 ? "landscape" : "portrait") : orientation;
  const doc = new jsPDF({ orientation: direction, unit: "mm", format: "a4", putOnlyUsedFonts: true });
  doc.setProperties({ title: `SIEP · ${title}`, subject: filters.join("; "), author: institution });
  const width = doc.internal.pageSize.getWidth(), margin = 14, textWidth = width - margin * 2;
  let y = 16;
  doc.setTextColor(24, 55, 87); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  for (const line of doc.splitTextToSize(title, textWidth)) { doc.text(line, margin, y); y += 7; }
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  for (const line of doc.splitTextToSize(institution, textWidth)) { doc.text(line, margin, y); y += 5; }
  doc.setTextColor(90, 108, 128); doc.setFontSize(8);
  doc.text(`Gerado em ${generatedAt.toLocaleString("pt-BR", { timeZone: "America/Manaus" })}`, margin, y); y += 7;
  const lines = [...filters, `Linhas: ${summary.records} | Pessoas distintas: ${summary.people} | Escolas: ${summary.schools} | Inscrições: ${summary.registrations}`];
  for (const text of lines) for (const line of doc.splitTextToSize(text, textWidth)) {
    if (y > doc.internal.pageSize.getHeight() - 25) { doc.addPage(); y = 18; }
    doc.text(line, margin, y); y += 4;
  }
  y += 4;
  autoTable(doc, {
    startY: y, margin: { top: 17, right: margin, bottom: 16, left: margin },
    head: [columns.map(c => c.label)], body: rows.map(r => columns.map(c => String(r.cells[c.key] ?? ""))),
    theme: "striped", styles: { font: "helvetica", fontSize: 8, cellPadding: 2.5, overflow: "linebreak", minCellWidth: 20, textColor: [43, 61, 81] },
    headStyles: { fillColor: [31, 77, 127], textColor: 255, fontStyle: "bold" }, alternateRowStyles: { fillColor: [243, 247, 251] },
    rowPageBreak: "avoid", horizontalPageBreak: true, horizontalPageBreakRepeat: 0,
  });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(100, 117, 137);
    doc.text(`SIEP · ${page} de ${pages}`, doc.internal.pageSize.getWidth() - margin, doc.internal.pageSize.getHeight() - 8, { align: "right" });
  }
  return doc;
}
