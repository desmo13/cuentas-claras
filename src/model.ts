export const CATEGORIES = ['Comida', 'Ocio', 'Transporte', 'Casa', 'Ropa', 'Salud', 'Otros'] as const;
export type Category = typeof CATEGORIES[number];
export type Kind = 'salary' | 'investment' | 'expense' | 'debt';
export type Priority = 'alta' | 'media' | 'baja';
export type Account = { id: string; name: string; opening: number; archived: boolean };
export type SavingRule = { mode: 'general' | 'fixed' | 'pct' | 'all'; value: number };
export type Job = { id: string; name: string; kind: 'salary' | 'investment'; investmentType?: string; salarySavings?: { primary?: SavingRule; secondary?: SavingRule } };
export type Transaction = {
  id: string; kind: Kind; date: string; label: string; amount: number; accountId: string | null;
  category?: Category; categorySource?: 'auto' | 'manual'; jobId?: string; part?: 1 | 2;
  investmentType?: string; debtId?: string; instalmentId?: string; fixedId?: string; budgetKind?: 'variable' | 'fixed';
  legacy?: boolean; auto?: boolean; note?: string;
  salaryMonth?: string; salaryMonthSource?: 'manual' | 'estimated'; saving?: SavingRule;
};
export type Fixed = { id: string; name: string; amount: number; day: number };
export type Goal = { id: string; name: string; kind: 'full' | 'nodate' | 'open'; target: number; saved: number; deadline: string; priority: Priority; active?: boolean };
export type Instalment = { id: string; amount: number; date: string };
export type Debt = { id: string; name: string; kind: 'loan' | 'plan' | 'paypal'; total: number; openingRemaining: number; monthly: number; day: number; auto: boolean; autoFrom: string; accountId: string | null; instalments?: [Instalment,Instalment] };
export type Sweep = { id: string; month: string; amount: number; destination: string; destinationName: string };
export type SlipLine = { concept: string; amount: number; type: string };
export type Payslip = { id: string; jobId: string; month: string; gross: number; net: number; company: string; acc: SlipLine[]; ded: SlipLine[]; note: string; ocrText?: string };
export type State = {
  schema: 2; accounts: Account[]; transactions: Transaction[]; jobs: Job[]; fixed: Fixed[];
  goals: Goal[]; debts: Debt[]; sweeps: Sweep[]; payslips: Payslip[];
  generalSaved: number; legacySpent: Record<string, number>; noSecond: Record<string, boolean>;
  preferences: { salaryAccountId: string | null; expenseAccountId: string | null; askExpenseAlways: boolean; baseMode: 'pct' | 'fixed'; basePct: number; baseFixed: number; goalsPct: number; theme: 'system' | 'light' | 'dark' };
  categoryMemory: Record<string, Category>;
};
export function blank(): State {
  return { schema: 2, accounts: [], transactions: [], jobs: [], fixed: [], goals: [], debts: [], sweeps: [], payslips: [], generalSaved: 0, legacySpent: {}, noSecond: {}, categoryMemory: {},
    preferences: { salaryAccountId: null, expenseAccountId: null, askExpenseAlways: false, baseMode: 'pct', basePct: 10, baseFixed: 0, goalsPct: 50, theme: 'system' } };
}
export const id = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
export const normalize = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const euro = (cents: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(cents / 100);
export const inputMoney = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
export const sum = <T>(list: T[], get: (x: T) => number) => list.reduce((a, x) => a + get(x), 0);
// Strict decimal parsing; no floating point is used for ledger balances.
export function parseMoney(input: string, signed = false): number {
  let value = input.trim().replace(/[\s€]/g, '');
  if (!value) throw new Error('Escribe un importe.');
  const negative = value.startsWith('-');
  if (negative) value = value.slice(1);
  if (negative && !signed) throw new Error('El importe debe ser positivo.');
  if (value.includes(',')) {
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(value)) throw new Error('Revisa el importe: por ejemplo, 1.234,56.');
    value = value.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(value)) value = value.replace(/\./g, '');
  else if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('Revisa el importe: usa como máximo dos decimales.');
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > 10 ** 12) throw new Error('El importe es demasiado grande.');
  return negative ? -cents : cents;
}
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export const monthOf = (date = new Date()) => localDate(date).slice(0, 7);
export function validMonth(s: string): boolean { return /^\d{4}-(0[1-9]|1[0-2])$/.test(s); }
export const transactionMonth = (t: Transaction) => t.kind === 'salary' && t.salaryMonth ? t.salaryMonth : t.date.slice(0,7);
export function validSavingRule(v: unknown): v is SavingRule {
  if (!v || typeof v !== 'object') return false;
  const r=v as SavingRule;
  return ['general','fixed','pct','all'].includes(r.mode) && Number.isFinite(r.value) && r.value>=0 &&
    (r.mode==='fixed'?Number.isSafeInteger(r.value)&&r.value<=10**12:r.mode==='pct'?r.value<=100:r.value===0);
}
export function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}
export function addMonth(month: string, offset: number): string { const [y, m] = month.split('-').map(Number); return monthOf(new Date(y, m - 1 + offset, 1, 12)); }
export function monthDistance(a: string, b: string) { const x = a.split('-').map(Number), y = b.split('-').map(Number); return (y[0] - x[0]) * 12 + y[1] - x[1]; }
export function daysInMonth(month: string) { const [y, m] = month.split('-').map(Number); return new Date(y, m, 0).getDate(); }
export function monthLabel(month: string) { const [y, m] = month.split('-').map(Number); const s = new Date(y, m - 1, 1, 12).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); }
export function accountBalance(s: State, accountId: string): number {
  const account = s.accounts.find(a => a.id === accountId);
  if (!account) return 0;
  return account.opening + sum(s.transactions.filter(t => t.accountId === accountId), t => ['salary', 'investment'].includes(t.kind) ? t.amount : -t.amount);
}
export const accountName = (s: State, accountId: string | null) => s.accounts.find(a => a.id === accountId)?.name ?? 'Sin cuenta · registro anterior';
export const activeAccounts = (s: State) => s.accounts.filter(a => !a.archived);
export function debtRemaining(s: State, debtId: string) { const debt = s.debts.find(d => d.id === debtId); return debt ? Math.max(0, debt.openingRemaining - sum(s.transactions.filter(t => t.debtId === debtId), t => t.amount)) : 0; }
export function validInstalments(value: unknown): value is [Instalment,Instalment] {
  if(!Array.isArray(value)||value.length!==2)return false;
  const good=value.every(p=>p&&typeof p==='object'&&typeof p.id==='string'&&p.id.length>0&&p.id.length<=20000&&Number.isSafeInteger(p.amount)&&p.amount>0&&p.amount<=10**12&&typeof p.date==='string'&&validDate(p.date));
  return good&&value[0].id!==value[1].id&&value[1].date>=value[0].date&&sum(value,p=>p.amount)<=10**12;
}
export function instalmentPayment(s:State,debtId:string,instalmentId:string){return s.transactions.find(t=>t.kind==='debt'&&t.debtId===debtId&&t.instalmentId===instalmentId);}
export function savePayPalDebt(s:State,input:{id:string;name:string;instalments:[Instalment,Instalment]}):State {
  if(!input.name.trim())throw new Error('Escribe el nombre de la compra.');
  if(!validInstalments(input.instalments))throw new Error('Define dos plazos con importes mayores que cero y fechas válidas. El segundo no puede ser anterior al primero.');
  const existing=s.debts.find(d=>d.id===input.id);
  if(existing&&existing.kind!=='paypal')throw new Error('Crea una compra PayPal nueva para definir sus dos plazos.');
  for(const payment of s.transactions.filter(t=>t.debtId===input.id)){
    const slot=input.instalments.find(p=>p.id===payment.instalmentId);
    if(!slot||slot.amount!==payment.amount)throw new Error('Para cambiar el importe de un plazo pagado, deshaz primero ese pago.');
  }
  const total=sum(input.instalments,p=>p.amount);
  const debt:Debt={id:input.id,name:input.name.trim(),kind:'paypal',total,openingRemaining:total,monthly:0,day:1,auto:false,autoFrom:input.instalments[0].date.slice(0,7),accountId:null,instalments:input.instalments.map(p=>({...p})) as [Instalment,Instalment]};
  return {...s,debts:existing?s.debts.map(d=>d.id===debt.id?debt:d):[...s.debts,debt]};
}
export function removeDebtPlan(s:State,debtId:string):State {
  return {...s,debts:s.debts.filter(d=>d.id!==debtId),transactions:s.transactions.map(t=>t.debtId===debtId?{...t,kind:'expense',category:'Otros',budgetKind:'variable',debtId:undefined,instalmentId:undefined}:t)};
}
function ensureAccount(s: State, accountId: string | null): asserts accountId is string {
  if (!accountId || !s.accounts.some(a => a.id === accountId && !a.archived)) throw new Error('Elige una cuenta antes de guardar.');
}
export function saveTransaction(s: State, input: Transaction, options: { learn?: boolean; rememberSalary?: boolean } = {}): State {
  if (!input.label.trim()) throw new Error('Escribe un concepto.');
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > 10 ** 12) throw new Error('El importe debe ser mayor que cero.');
  if (!validDate(input.date)) throw new Error('La fecha no es válida.');
  const existing = s.transactions.find(t => t.id === input.id);
  if (!existing || existing.accountId !== input.accountId) ensureAccount(s, input.accountId);
  else if (!input.accountId || !s.accounts.some(a => a.id === input.accountId)) throw new Error('Elige una cuenta antes de guardar.');
  if (input.kind === 'salary' && !s.jobs.some(j => j.id === input.jobId && j.kind === 'salary')) throw new Error('Elige un trabajo.');
  if (input.kind === 'salary' && input.salaryMonth!==undefined && !validMonth(input.salaryMonth)) throw new Error('Elige un mes válido para el salario.');
  if (input.saving!==undefined && (input.kind!=='salary' || !validSavingRule(input.saving))) throw new Error('Revisa la regla de ahorro del salario.');
  if (input.kind === 'expense' && !CATEGORIES.includes(input.category!)) throw new Error('Elige una categoría.');
  if (input.kind === 'debt') {
    const remaining = debtRemaining(s, input.debtId ?? '') + (existing?.amount ?? 0);
    if (!s.debts.some(d => d.id === input.debtId) || input.amount > remaining) throw new Error('El pago supera lo que queda de la deuda.');
    const debt=s.debts.find(d=>d.id===input.debtId)!;
    if(debt.kind==='paypal'){
      const slot=debt.instalments?.find(p=>p.id===input.instalmentId);
      if(!slot||slot.amount!==input.amount)throw new Error('Registra el importe definido para ese plazo de PayPal.');
      if(s.transactions.some(t=>t.id!==input.id&&t.debtId===debt.id&&t.instalmentId===slot.id))throw new Error('Este plazo de PayPal ya está pagado.');
    }else if(input.instalmentId)throw new Error('Este plazo no pertenece a la deuda.');
  }
  if(input.instalmentId&&input.kind!=='debt')throw new Error('El plazo debe ser un pago de deuda.');
  if (input.fixedId && s.transactions.some(t => t.id !== input.id && t.fixedId === input.fixedId && t.date.slice(0, 7) === input.date.slice(0, 7))) throw new Error('Este gasto fijo ya está marcado como pagado en ese mes.');
  const tx = { ...input, label: input.label.trim(), legacy: false };
  const transactions = existing ? s.transactions.map(t => t.id === tx.id ? tx : t) : [...s.transactions, tx];
  const preferences = { ...s.preferences };
  if (tx.kind === 'salary' && (!preferences.salaryAccountId || options.rememberSalary)) preferences.salaryAccountId = tx.accountId;
  if (tx.kind === 'expense') preferences.expenseAccountId = tx.accountId;
  const categoryMemory = { ...s.categoryMemory };
  if (options.learn && tx.kind === 'expense' && tx.category) categoryMemory[normalize(tx.label)] = tx.category;
  return { ...s, transactions, preferences, categoryMemory };
}
export function removeTransaction(s: State, transactionId: string): State {
  // Balances are derived, so deleting or editing a record reverses exactly its own effect.
  return { ...s, transactions: s.transactions.filter(t => t.id !== transactionId) };
}
export function setAccountBalance(s: State, accountId: string, desired: number): State {
  if (!Number.isSafeInteger(desired) || Math.abs(desired) > 10 ** 12) throw new Error('Saldo no válido.');
  const delta = desired - accountBalance(s, accountId);
  return { ...s, accounts: s.accounts.map(a => a.id === accountId ? { ...a, opening: a.opening + delta } : a) };
}
export function archiveAccount(s: State, accountId: string): State {
  return { ...s, accounts: s.accounts.map(a => a.id === accountId ? { ...a, archived: true } : a), preferences: { ...s.preferences, salaryAccountId: s.preferences.salaryAccountId === accountId ? null : s.preferences.salaryAccountId, expenseAccountId: s.preferences.expenseAccountId === accountId ? null : s.preferences.expenseAccountId } };
}
const RULES: [Category, RegExp][] = [
  ['Salud', /\b(farmacia|medicamentos?|dentista|medico|clinica|fisioterapia|optica|hospital|parafarmacia)\b/],
  ['Transporte', /\b(gasolina|gasolinera|combustible|diesel|repsol|cepsa|bp|parking|aparcamiento|taxi|uber|cabify|guagua|titsa|metro|renfe|bus|peaje|tranvia|billete de tren)\b/],
  ['Ropa', /\b(zara|mango|primark|h m|ropa|camiseta|pantalon|zapatos|zapatillas|calzado|bershka|stradivarius)\b/],
  ['Casa', /\b(alquiler|hipoteca|luz|electricidad|agua|internet|fibra|movil|telefono|fontanero|ferreteria|ikea|leroy merlin|suministros|comunidad|muebles|reparacion)\b/],
  ['Ocio', /\b(cafe|cafeteria|bar|restaurante|tostada|desayuno|cena|almuerzo|cine|netflix|spotify|disney|hbo|concierto|cerveza|copas|pizza|hamburguesa|vacaciones|videojuego|gimnasio)\b/],
  ['Comida', /\b(mercadona|lidl|aldi|carrefour|hiperdino|superdino|alcampo|supermercado|super|compra|fruteria|carniceria|pescaderia|panaderia|alimentacion)\b/],
];
export function suggestCategory(label: string, memory: Record<string, Category>): { category: Category; reason: string } {
  const text = normalize(label);
  if (Object.prototype.hasOwnProperty.call(memory, text) && CATEGORIES.includes(memory[text])) return { category: memory[text], reason: 'Según tu última elección' };
  for (const [category, rule] of RULES) if (rule.test(text)) return { category, reason: 'Sugerida por el concepto' };
  return { category: 'Otros', reason: 'Puedes elegir otra categoría' };
}
export function parseQuick(text: string) {
  const candidates = [...text.matchAll(/(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/g)].filter(m => !/[a-záéíóúñ]/i.test(text[(m.index ?? 0)-1] ?? '')).map(m => {
    const start=m.index!,end=start+m[0].length,before=text.slice(0,start),after=text.slice(end);
    const prefix=/€\s*$/.exec(before),suffix=/^\s*(?:€|euros?\b|eur\b)/i.exec(after);
    return { value:m[1],start:prefix?start-prefix[0].length:start,end:suffix?end+suffix[0].length:end,currency:!!prefix||!!suffix };
  });
  const currency = candidates.filter(m=>m.currency);
  const possible = currency.length ? currency : candidates;
  if (!possible.length) throw new Error('Escribe el importe con números, por ejemplo: 12,50 café.');
  if (possible.length!==1) throw new Error('Hay varios números. Añade € junto al importe que quieres registrar.');
  const match=possible[0];
  const label = (text.slice(0, match.start) + ' ' + text.slice(match.end)).replace(/\s+/g, ' ').trim();
  if (!label) throw new Error('Añade también el concepto del gasto.');
  return { amount: parseMoney(match.value), label };
}
export function runAuto(s: State, today = localDate()): State {
  let next = s;
  for (const original of s.debts) {
    if(original.kind==='paypal')continue;
    if (!original.auto || !original.accountId || !s.accounts.some(a => a.id === original.accountId && !a.archived)) continue;
    let month = original.autoFrom;
    for (let n = 0; n < 120 && validMonth(month); n++) {
      const date = `${month}-${String(Math.min(original.day, daysInMonth(month))).padStart(2, '0')}`;
      if (date > today) break;
      const already = next.transactions.some(t => t.debtId === original.id && t.date.slice(0, 7) === month);
      const amount = Math.min(original.monthly, debtRemaining(next, original.id));
      if (!already && amount > 0) next = saveTransaction(next, { id: `auto-${original.id}-${month}`, kind: 'debt', label: original.name, date, amount, accountId: original.accountId, debtId: original.id, auto: true });
      month = addMonth(month, 1);
      if (!amount) break;
    }
    if (month !== original.autoFrom) next = { ...next, debts: next.debts.map(d => d.id === original.id ? { ...d, autoFrom: month } : d) };
  }
  return next;
}
