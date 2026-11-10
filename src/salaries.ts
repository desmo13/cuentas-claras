import { type State, type SavingRule, type Transaction, addMonth, daysInMonth, euro, monthDistance, validDate, validMonth } from './model.ts';
export const GENERAL_SAVING:SavingRule={mode:'general',value:0};
export function salarySaving(s:State,jobId:string|undefined,part:1|2):SavingRule {
  const job=s.jobs.find(j=>j.id===jobId);
  return job?.salarySavings?.[part===2?'secondary':'primary']??GENERAL_SAVING;
}
export function savingLabel(rule:SavingRule):string {
  return rule.mode==='all'?'Ahorrar el sueldo completo':rule.mode==='fixed'?`Ahorrar ${euro(rule.value)}`:rule.mode==='pct'?`Ahorrar el ${rule.value}%`:'Usar el ahorro general';
}
export function requestedSaving(rule:SavingRule,amount:number):number {
  return rule.mode==='all'?amount:rule.mode==='fixed'?rule.value:rule.mode==='pct'?Math.round(amount*rule.value/100):0;
}
// Compare payday positions around the month boundary: the last day is -1,
// the first day is +1. This keeps February and delayed weekend payments close.
function payday(date:string){const day=Number(date.slice(8));return day<=15?day:day-daysInMonth(date.slice(0,7))-1;}
function cycleMonth(date:string){return addMonth(date.slice(0,7),payday(date)<0?1:0);}
export function estimateSalaryMonth(s:State,jobId:string,part:1|2,date:string,excludeId?:string) {
  const fallback=validDate(date)?date.slice(0,7):'';
  const samples=s.transactions.filter(t=>t.id!==excludeId && t.kind==='salary' && t.jobId===jobId && (t.part??1)===part && t.salaryMonth && validDate(t.date) && validMonth(t.salaryMonth))
    .sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)).slice(0,12);
  const count=samples.length;
  if (count<3 || !validDate(date)) return {month:fallback,estimated:false,count,reason:`Llevas ${count} de 3 cobros ${part===2?'secundarios':'principales'} de este trabajo. Confirma el mes al que pertenece.`};
  const nearby=samples.map(t=>({t,distance:Math.abs(payday(t.date)-payday(date)),offset:monthDistance(cycleMonth(t.date),t.salaryMonth!)}))
    .filter(x=>Math.abs(x.offset)<=1).sort((a,b)=>a.distance-b.distance).slice(0,3);
  const votes=new Map<number,number>();nearby.forEach(x=>votes.set(x.offset,(votes.get(x.offset)??0)+1));
  const winner=[...votes].sort((a,b)=>b[1]-a[1])[0];
  if (nearby.length<3 || !winner || winner[1]<2 || nearby[1].distance>7) return {month:fallback,estimated:false,count,reason:'Las fechas de los cobros anteriores varían demasiado para proponer un mes seguro. Confírmalo manualmente.'};
  return {month:addMonth(cycleMonth(date),winner[0]),estimated:true,count,reason:`Mes estimado a partir de ${count} cobros ${part===2?'secundarios':'principales'} de este trabajo. Puedes corregirlo.`};
}
export function salaryReservations(s:State,entries:Transaction[]) {
  let generalIncome=0,customWanted=0,customCap=0;
  const details: {id:string;label:string;amount:number;wanted:number;rule:SavingRule}[]=[];
  for (const t of entries) {
    if (t.kind==='investment') {generalIncome+=t.amount;continue;}
    if (t.kind!=='salary') continue;
    const rule=t.saving??salarySaving(s,t.jobId,t.part??1);
    if (rule.mode==='general') {generalIncome+=t.amount;continue;}
    const wanted=requestedSaving(rule,t.amount);
    customWanted+=wanted;customCap+=Math.min(t.amount,wanted);
    details.push({id:t.id,label:`${s.jobs.find(j=>j.id===t.jobId)?.name??t.label} · ${t.part===2?'secundario':'principal'}`,amount:t.amount,wanted,rule});
  }
  const generalWanted=generalIncome>0?(s.preferences.baseMode==='fixed'?s.preferences.baseFixed:Math.round(generalIncome*s.preferences.basePct/100)):0;
  return {wanted:generalWanted+customWanted,cap:Math.min(generalIncome,generalWanted)+customCap,generalIncome,details};
}
export function suggestSalaryPart(s:State,jobId:string,date:string,fallbackMonth:string,excludeId?:string):1|2 {
  const first=estimateSalaryMonth(s,jobId,1,date,excludeId),month=first.estimated?first.month:fallbackMonth;
  return s.transactions.some(t=>t.id!==excludeId&&t.kind==='salary'&&t.jobId===jobId&&(t.part??1)===1&&(t.salaryMonth??t.date.slice(0,7))===month)?2:1;
}
