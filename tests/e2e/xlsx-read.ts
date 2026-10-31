import ExcelJS from "exceljs";
export async function firstSheetRows(buf: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const rows: string[][] = [];
  wb.worksheets[0].eachRow((r) => rows.push((r.values as unknown[]).slice(1).map(String)));
  return rows;
}
