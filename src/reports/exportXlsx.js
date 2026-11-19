import writeExcelFile from "write-excel-file/universal";

export function createReportXlsx({columns, rows}) {
  const header = columns.map(column => ({
    value:column.label, fontWeight:"bold", backgroundColor:"#1F4D7F", color:"#FFFFFF",
  }));
  const data = rows.map(({cells}) => columns.map(({key}) => {
    const value = cells[key];
    if (value === null || value === undefined) return null;
    if (key !== "cpf" && typeof value === "number" && Number.isFinite(value)) return value;
    return {type:String,value:String(value)};
  }));
  return writeExcelFile([header,...data],{
    sheet:"Relatório",
    columns:columns.map(({label}) => ({width:Math.max(18,label.length+4)})),
    stickyRowsCount:1,
  }).toBlob();
}
