import { type Payslip, type SlipLine, euro, id, normalize, parseMoney, validMonth } from './model.ts';
export type OcrLine = { text: string; x: number; y: number; w: number; h: number; page: number };
type Source = { text: string; lines: OcrLine[]; words?: OcrLine[] };
type Band = { page: number; y: number; h: number; cells: OcrLine[]; text: string };
const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const cx = (c: OcrLine) => c.x + c.w / 2;
const cy = (c: OcrLine) => c.y + c.h / 2;
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

function bands(lines: OcrLine[]): Band[] {
  const rows: Band[] = [];
  for (const cell of [...lines].filter(c => c.text.trim() && c.w > 0 && c.h > 0).sort((a,b) => a.page-b.page || cy(a)-cy(b) || a.x-b.x)) {
    const row = rows.find(r => r.page === cell.page && Math.abs(r.y-cy(cell)) <= Math.max(3, Math.min(r.h,cell.h)*.6));
    if (row) row.cells.push(cell);
    else rows.push({page:cell.page,y:cy(cell),h:cell.h,cells:[cell],text:''});
  }
  return rows.sort((a,b) => a.page-b.page || a.y-b.y).map(r => ({...r,cells:r.cells.sort((a,b)=>a.x-b.x),text:clean(r.cells.map(c=>c.text).join(' '))}));
}
export function ocrRows(lines: OcrLine[]): string[] { return bands(lines).map(r=>r.text); }

function moneyIn(text: string): number[] {
  // The final separator is the decimal mark. Tolerate OCR mixing thousands marks,
  // but require two decimal digits and never accept an integer or a percentage.
  const out: number[] = [];
  for (const match of text.matchAll(/(?:^|[^\d.,])(-?\d{1,3}(?:[.,]\d{3})+[.,]\d{2}|-?\d+[,.]\d{2})(?![\d.,]|\s*%)/g)) {
    const value=match[1], split=Math.max(value.lastIndexOf(','),value.lastIndexOf('.'));
    try {
      const cents=Math.abs(parseMoney(value.slice(0,split).replace(/[.,]/g,'')+','+value.slice(split+1),true));
      if (cents>0) out.push(cents);
    } catch {}
  }
  return out;
}
function payrollMonth(text: string): string {
  const dates=[...text.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2}|\d{2})\b/g)];
  // A date range belongs to the month of its final day, not to the hiring date.
  for (const m of dates.reverse()) {
    const year=m[3].length===2?2000+Number(m[3]):Number(m[3]), month=Number(m[2]), day=Number(m[1]);
    const d=new Date(Date.UTC(year,month-1,day));
    if (d.getUTCFullYear()===year && d.getUTCMonth()===month-1 && d.getUTCDate()===day) return `${year}-${String(month).padStart(2,'0')}`;
  }
  const iso=text.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2,'0')}`;
  const normalized=normalize(text), named=MONTHS.findIndex(m=>normalized.includes(m)), year=text.match(/\b20\d{2}\b/)?.[0];
  return named>=0 && year ? `${year}-${String(named+1).padStart(2,'0')}` : '';
}
function lineType(concept: string, deduction: boolean): string {
  const s=normalize(concept);
  if (deduction) return /\b(irpf|retencion)\b/.test(s)?'irpf':/\b(seguridad social|contingencias|desempleo|formacion|equidad|mei|solidaridad|cotizacion)\b/.test(s)?'ss':'otros_d';
  if (/\b(salario base|sueldo base)\b/.test(s)) return 'base';
  if (/\b(prorrata|pagas? extra|gratificacion extraordinaria)\b/.test(s)) return 'paga_extra';
  if (/\b(horas? extra)\b/.test(s)) return 'horas_extra';
  if (/\b(plus|complemento|antiguedad|nocturnidad|turnicidad|incentivos|productividad|madrugue|jornada fracc)\b/.test(s)) return 'plus';
  return 'otros';
}

// Locate a field in a header row, then read only the cells below that field.
// Adjacent NIF, employee and hiring-date columns must never become field values.
function fieldBelow(rows: Band[], label: RegExp, read: (text:string)=>string): string {
  for (const row of rows) {
    for (let a=0;a<row.cells.length;a++) for (let b=a;b<Math.min(row.cells.length,a+6);b++) {
      const cells=row.cells.slice(a,b+1), text=normalize(cells.map(c=>c.text).join(' '));
      if (!label.test(text)) continue;
      const left=cells[0].x-row.h*.5, right=row.cells[b+1]?.x ?? cells.at(-1)!.x+cells.at(-1)!.w+row.h*3;
      for (const next of rows.filter(r=>r.page===row.page && r.y>row.y+row.h*.7 && r.y<row.y+row.h*5)) {
        const value=read(next.cells.filter(c=>cx(c)>=left && cx(c)<right).map(c=>c.text).join(' '));
        if (value) return value;
      }
    }
  }
  return '';
}
function belowAmount(rows: Band[], anchor: OcrLine, left: number, right: number): number {
  for (const r of rows.filter(r=>r.page===anchor.page && r.y>cy(anchor)+anchor.h*.6 && r.y<cy(anchor)+anchor.h*8)) {
    const values=r.cells.filter(c=>cx(c)>=left && cx(c)<right).flatMap(c=>moneyIn(c.text));
    if (values.length===1) return values[0];
    if (values.length>1) return 0;
  }
  return 0;
}
function columnTable(rows: Band[]): {acc:SlipLine[];ded:SlipLine[];gross:number;deductionTotal:number;found:boolean;unclear:boolean} {
  const acc:SlipLine[]=[],ded:SlipLine[]=[];
  let gross=0,deductionTotal=0,found=false,unclear=false;
  for (const header of rows) {
    const dev=header.cells.find(c=>/^devengos$/.test(normalize(c.text))), deduction=header.cells.find(c=>/^deducciones$/.test(normalize(c.text)));
    if (!dev || !deduction || deduction.x<=dev.x) continue;
    found=true;
    const width=cx(deduction)-cx(dev), split=(cx(dev)+cx(deduction))/2, left=cx(dev)-width/2, right=cx(deduction)+width/2+header.h;
    const following=rows.filter(r=>r.page===header.page && r.y>header.y+header.h*.7);
    const stop=following.find(r=>/\b(coste total|total devengado|total devengos|liquido a percibir|determinacion de las bases)\b/.test(normalize(r.text)) || r.cells.some(c=>/^(devengado|deducir)$/.test(normalize(c.text))))?.y ?? Infinity;
    let pending='';
    for (const row of following.filter(r=>r.y<stop)) {
      const concept=clean(row.cells.filter(c=>cx(c)<left && /[a-záéíóúñ]/i.test(c.text) && !/^%$/.test(c.text)).map(c=>c.text).join(' '));
      const values=(from:number,to:number)=>row.cells.filter(c=>cx(c)>=from && cx(c)<to).flatMap(c=>moneyIn(c.text));
      const income=values(left,split),expense=values(split,right);
      if (!income.length && !expense.length) {
        if (row.cells.some(c=>moneyIn(c.text).length)) { pending='';unclear=true; }
        else pending=concept;
        continue;
      }
      const name=clean([pending,concept].filter(Boolean).join(' '));pending='';
      if (!name || income.length>1 || expense.length>1) { unclear=true;continue; }
      if (income.length) acc.push({concept:name.slice(0,100),amount:income[0],type:lineType(name,false)});
      if (expense.length) ded.push({concept:name.slice(0,100),amount:expense[0],type:lineType(name,true)});
    }
    // Totals may have TOTAL / DEVENGADO and TOTAL A / DEDUCIR on separate lines.
    for (const row of following.filter(r=>r.y>=stop)) for (const cell of row.cells) {
      if (/^devengado$/.test(normalize(cell.text))) gross=belowAmount(rows,cell,left,split)||gross;
      if (/^deducir$/.test(normalize(cell.text))) deductionTotal=belowAmount(rows,cell,split,right)||deductionTotal;
    }
  }
  return {acc,ded,gross,deductionTotal,found,unclear};
}

export function parsePayroll(result: Source, jobId: string, company: string, month: string): { slip: Payslip; warnings: string[] } {
  const geometry=bands(result.words?.length?result.words:result.lines), rows=geometry.length?geometry.map(r=>r.text):result.text.split('\n').filter(Boolean);
  const table=columnTable(geometry), acc:SlipLine[]=table.acc, ded:SlipLine[]=table.ded;
  let net=0,gross=table.gross,detectedMonth='';
  const warnings:string[]=[];
  if (geometry.length) {
    detectedMonth=fieldBelow(geometry,/^periodo(?: de)? liquidacion$/,payrollMonth);
  }
  const nextMoney=(i:number)=>moneyIn(rows[i]).at(-1) ?? (rows[i+1] && !/[a-záéíóúñ]{4}/i.test(rows[i+1])?moneyIn(rows[i+1]).at(-1)??0:0);
  let employerSection=false;
  rows.forEach((row,i)=>{
    const s=normalize(row),amount=nextMoney(i);
    if (/\b(determinacion de las bases|aportacion de la empresa|aportacion empresarial|aport\. empresa)\b/.test(s)) employerSection=true;
    if (/\b(liquido a percibir|liquido total|total liquido|neto a cobrar|total a percibir|liquido a cobrar)\b/.test(s)) { if(amount)net=amount;return; }
    if (!gross && /\b(total devengado|total devengos|salario bruto|total bruto|remuneracion total)\b/.test(s)) { if(amount)gross=amount;return; }
    if (!detectedMonth && /\b(nomina|periodo|liquidacion|mes)\b/.test(s)) detectedMonth=payrollMonth(row) || (/periodo|liquidacion/.test(s)?payrollMonth(rows.slice(i+1,i+3).join(' ')):'');
    if (table.found || employerSection || !amount || /\b(total|base cotizacion|base irpf|base sujeta|coste empresa)\b/.test(s)) return;
    const deduction=/\b(irpf|retencion|seguridad social|contingencias|desempleo|formacion|equidad|mei|solidaridad|cotizacion|anticipo|embargo|otros descuentos)\b/.test(s);
    const type=lineType(row,deduction);
    if (type==='otros' && !/\b(manutencion|hhcc|enfermedad|dietas)\b/.test(s)) return;
    const concept=clean(row.replace(/\s*-?\d[\d.,]*(?:\s*%)?/g,'').replace(/\s*€\s*/g,' ')).slice(0,100);
    (deduction?ded:acc).push({concept:concept||row.slice(0,60),amount,type});
  });
  const accruals=acc.reduce((n,l)=>n+l.amount,0),deductions=ded.reduce((n,l)=>n+l.amount,0);
  if (!net) warnings.push('No se ha detectado con seguridad el líquido a percibir. Completa el neto.');
  if (!gross) warnings.push('No se ha detectado con seguridad el total devengado. Comprueba el bruto.');
  if (!acc.length) warnings.push('No se ha reconocido el desglose de devengos. Puedes añadir sus líneas manualmente.');
  if (!detectedMonth || !validMonth(detectedMonth)) warnings.push('Se ha conservado el mes seleccionado; comprueba el periodo de la nómina.');
  if (table.unclear) warnings.push('Hay filas de la tabla que no se han podido separar con seguridad. Revisa el desglose.');
  if (gross && accruals!==gross) warnings.push(`Los devengos reconocidos suman ${euro(accruals)} y el bruto leído es ${euro(gross)}. Revisa las líneas.`);
  if (table.deductionTotal && deductions!==table.deductionTotal) warnings.push(`Los descuentos reconocidos suman ${euro(deductions)} y el total a deducir es ${euro(table.deductionTotal)}. Revisa las líneas.`);
  if (net && acc.length && accruals-deductions!==net) warnings.push('El desglose reconocido no coincide con el líquido a percibir. Revisa los importes antes de guardar.');
  return {slip:{id:id(),jobId,month:validMonth(detectedMonth)?detectedMonth:month,company,gross,net,acc,ded,note:'',ocrText:result.text},warnings};
}
