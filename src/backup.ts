import { blank, type State, type Transaction, type Category, CATEGORIES, validDate, validMonth, validSavingRule, validInstalments, transactionMonth, id, sum, monthOf } from './model.ts';

const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const cents = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) : 0;
const integer = (n: unknown, signed = false) => typeof n === 'number' && Number.isSafeInteger(n) && Math.abs(n) <= 10 ** 12 && (signed || n >= 0);
const text = (v: unknown) => typeof v === 'string' && v.length <= 20000;
const fail = (): never => { throw new Error('La copia no contiene un registro válido de Cuentas claras.'); };
export function validateState(value: unknown): State {
  if (!object(value) || value.schema !== 2) return fail();
  const s = value as State;
  for (const key of ['accounts', 'transactions', 'jobs', 'fixed', 'goals', 'debts', 'sweeps', 'payslips'] as const) if (!Array.isArray(s[key]) || s[key].length > 100000) return fail();
  const ensureIds = (list: { id: string }[]) => { const ids = new Set<string>(); for (const x of list) { if (!object(x) || !text(x.id) || !x.id || ids.has(x.id)) return fail(); ids.add(x.id); } };
  for (const key of ['accounts', 'transactions', 'jobs', 'fixed', 'goals', 'debts', 'sweeps', 'payslips'] as const) ensureIds(s[key]);
  for (const a of s.accounts) if (!text(a.name) || !a.name.trim() || !integer(a.opening, true) || typeof a.archived !== 'boolean') return fail();
  const hasAccount = (key: unknown) => key === null || s.accounts.some(a => a.id === key);
  for (const j of s.jobs) if (!text(j.name) || !['salary','investment'].includes(j.kind) || (j.investmentType !== undefined && !text(j.investmentType))) return fail();
  for (const j of s.jobs) if (j.salarySavings!==undefined && (j.kind!=='salary' || !object(j.salarySavings) || Object.entries(j.salarySavings).some(([key,r])=>!['primary','secondary'].includes(key)||!validSavingRule(r)))) return fail();
  for (const f of s.fixed) if (!text(f.name) || !integer(f.amount) || !Number.isInteger(f.day) || f.day < 1 || f.day > 31) return fail();
  for (const g of s.goals) if (!text(g.name) || !integer(g.target) || !integer(g.saved) || !['full','nodate','open'].includes(g.kind) || !['alta','media','baja'].includes(g.priority) || (g.deadline !== '' && !validMonth(g.deadline))) return fail();
  for (const g of s.goals) if (g.active!==undefined && typeof g.active!=='boolean') return fail();
  for (const d of s.debts) {
    if (!text(d.name) || !integer(d.total) || !integer(d.openingRemaining) || !integer(d.monthly) || !Number.isInteger(d.day) || d.day < 1 || d.day > 31 || typeof d.auto !== 'boolean' || !hasAccount(d.accountId) || !validMonth(d.autoFrom) || !['loan','plan','paypal'].includes(d.kind)) return fail();
    if(d.kind==='paypal'){
      if(!validInstalments(d.instalments)||d.total!==sum(d.instalments,p=>p.amount)||d.openingRemaining!==d.total||d.auto||d.monthly!==0||d.accountId!==null)return fail();
    }else if(!d.monthly||d.instalments!==undefined)return fail();
  }
  for (const t of s.transactions) {
    if (!text(t.label) || !validDate(t.date) || !integer(t.amount) || !t.amount || !['salary','investment','expense','debt'].includes(t.kind) || !hasAccount(t.accountId)) return fail();
    if (t.kind === 'expense' && !CATEGORIES.includes(t.category!)) return fail();
    if (t.salaryMonth!==undefined && (t.kind!=='salary'||!validMonth(t.salaryMonth))) return fail();
    if (t.salaryMonthSource!==undefined && (t.kind!=='salary'||!['manual','estimated'].includes(t.salaryMonthSource))) return fail();
    if (t.saving!==undefined && (t.kind!=='salary'||!validSavingRule(t.saving))) return fail();
    if (t.part!==undefined && t.part!==1 && t.part!==2) return fail();
    if (t.note !== undefined && !text(t.note) || t.investmentType !== undefined && !text(t.investmentType)) return fail();
    if (t.budgetKind !== undefined && !['variable','fixed'].includes(t.budgetKind) || t.categorySource !== undefined && !['auto','manual'].includes(t.categorySource)) return fail();
    if (t.jobId && !s.jobs.some(j => j.id === t.jobId)) return fail();
    if (t.debtId && !s.debts.some(d => d.id === t.debtId)) return fail();
    if(t.instalmentId!==undefined){
      const debt=s.debts.find(d=>d.id===t.debtId),slot=debt?.instalments?.find(p=>p.id===t.instalmentId);
      if(!text(t.instalmentId)||t.kind!=='debt'||debt?.kind!=='paypal'||!slot||slot.amount!==t.amount)return fail();
    }
    if(s.debts.some(d=>d.id===t.debtId&&d.kind==='paypal')&&(t.kind!=='debt'||!t.instalmentId))return fail();
    if (t.fixedId && !s.fixed.some(f => f.id === t.fixedId)) return fail();
    if (!t.accountId && !t.legacy) return fail();
  }
  for (const d of s.debts) {
    if (sum(s.transactions.filter(t => t.debtId === d.id), t => t.amount) > d.openingRemaining) return fail();
    if(d.kind==='paypal'&&d.instalments?.some(p=>s.transactions.filter(t=>t.debtId===d.id&&t.instalmentId===p.id).length>1))return fail();
  }
  for (const x of s.sweeps) if (!validMonth(x.month) || !integer(x.amount) || !text(x.destinationName) || !text(x.destination)) return fail();
  for (const p of s.payslips) {
    if (!s.jobs.some(j => j.id === p.jobId) || !validMonth(p.month) || !integer(p.net) || !integer(p.gross) || !text(p.company) || !text(p.note) || !Array.isArray(p.acc) || !Array.isArray(p.ded)) return fail();
    for (const line of [...p.acc, ...p.ded]) if (!object(line) || !text(line.concept) || !text(line.type) || !integer(line.amount)) return fail();
    if (p.ocrText !== undefined && !text(p.ocrText)) return fail();
  }
  if (!integer(s.generalSaved) || !object(s.legacySpent) || !object(s.noSecond) || !object(s.categoryMemory) || !object(s.preferences)) return fail();
  for (const [m, v] of Object.entries(s.legacySpent)) if (!validMonth(m) || !integer(v)) return fail();
  for (const v of Object.values(s.noSecond)) if (typeof v !== 'boolean') return fail();
  for (const v of Object.values(s.categoryMemory)) if (!CATEGORIES.includes(v as Category)) return fail();
  const p = s.preferences;
  if (!hasAccount(p.salaryAccountId) || !hasAccount(p.expenseAccountId) || typeof p.askExpenseAlways !== 'boolean' || !['pct','fixed'].includes(p.baseMode) || !['system','light','dark'].includes(p.theme) || !integer(p.baseFixed) || typeof p.basePct !== 'number' || p.basePct < 0 || p.basePct > 100 || typeof p.goalsPct !== 'number' || p.goalsPct < 0 || p.goalsPct > 100) return fail();
  return s;
}

export function migrateLegacy(raw: unknown): State {
  if (!object(raw) || !(Array.isArray(raw.accounts) || object(raw.income))) return fail();
  const s = blank();
  s.accounts = (raw.accounts ?? []).map((a: any) => ({ id: String(a.id || id()), name: String(a.name || 'Cuenta importada'), opening: cents(a.amount), archived: false }));
  s.jobs = (raw.jobs ?? []).map((j: any) => ({ id: String(j.id || id()), name: String(j.name || 'Trabajo importado'), kind: j.kind === 'inv' ? 'investment' : 'salary', investmentType: j.itype }));
  s.fixed = (raw.fixed ?? []).map((f: any) => ({ id: String(f.id || id()), name: String(f.name || 'Fijo'), amount: Math.max(0, cents(f.amount)), day: Math.min(31, Math.max(1, Number(f.day) || 1)) }));
  s.goals = (raw.goals ?? []).map((g: any) => ({ id: String(g.id || id()), name: String(g.name || 'Meta'), kind: ['full','nodate','open'].includes(g.kind) ? g.kind : !g.target ? 'open' : g.deadline ? 'full' : 'nodate', target: Math.max(0, cents(g.target)), saved: Math.max(0, cents(g.saved)), deadline: validMonth(g.deadline ?? '') ? g.deadline : '', priority: ['alta','media','baja'].includes(g.prio) ? g.prio : 'media' }));
  const addLegacy = (t: Transaction) => { if (t.amount > 0) s.transactions.push({ ...t, accountId: null, legacy: true }); };
  for (const [month, entries] of Object.entries(raw.income ?? {})) {
    if (!validMonth(month) || !Array.isArray(entries)) continue;
    entries.forEach((e: any) => {
      let job = s.jobs.find(j => j.id === e.job);
      const inv = !!e.inv || job?.kind === 'investment';
      if (!inv && !job) { job = { id: id(), name: String(e.label || 'Trabajo importado'), kind: 'salary' }; s.jobs.push(job); }
      addLegacy({ id: `income-${e.id || id()}`, kind: inv ? 'investment' : 'salary', label: String(e.label || e.inv?.name || 'Ingreso'), amount: Math.max(0, cents(e.amount)), date: validDate(e.date ?? '') ? e.date : month + '-01', accountId: null, jobId: job?.id, investmentType: e.inv?.type ?? job?.investmentType, part: e.part === 2 ? 2 : 1, salaryMonth: inv?undefined:month, salaryMonthSource: inv?undefined:'manual' });
    });
  }
  for (const [month, entries] of Object.entries(raw.expenses ?? {})) {
    if (!validMonth(month) || !Array.isArray(entries)) continue;
    entries.forEach((e: any) => addLegacy({ id: `expense-${e.id || id()}`, kind: 'expense', label: String(e.concept || 'Gasto'), amount: Math.max(0, cents(e.amount)), date: validDate(e.date ?? '') ? e.date : month + '-01', accountId: null, category: CATEGORIES.includes(e.cat) ? e.cat : 'Otros', note: e.note, budgetKind: 'variable' }));
  }
  for (const d of raw.debts ?? []) {
    const debtId = String(d.id || id());
    const payments = Array.isArray(d.payments) ? d.payments : [];
    const paid = sum(payments, (p: any) => Math.max(0, cents(p.amount)));
    s.debts.push({ id: debtId, name: String(d.name || 'Deuda'), kind: d.kind === 'plan' ? 'plan' : 'loan', total: Math.max(cents(d.total), cents(d.remaining) + paid), openingRemaining: Math.max(0, cents(d.remaining)) + paid, monthly: Math.max(1, cents(d.monthly)), day: Math.min(31, Math.max(1, Number(d.day) || 1)), auto: false, autoFrom: monthOf(), accountId: null });
    payments.forEach((p: any) => addLegacy({ id: `debt-${debtId}-${p.id || id()}`, kind: 'debt', label: String(d.name || 'Deuda'), date: validDate(p.date ?? '') ? p.date : monthOf() + '-01', amount: Math.max(0, cents(p.amount)), accountId: null, debtId, auto: !!p.auto }));
  }
  for (const [month, entries] of Object.entries(raw.sweeps ?? {})) if (validMonth(month) && Array.isArray(entries)) entries.forEach((x: any) => s.sweeps.push({ id: String(x.id || id()), month, amount: Math.max(0, cents(x.amount)), destination: String(x.dest || 'general'), destinationName: String(x.destName || 'Ahorro general') }));
  for (const p of raw.payslips ?? []) {
    if (!s.jobs.some(j => j.id === p.job) || !validMonth(p.ym ?? '')) continue;
    const lines = (list: any[]) => (Array.isArray(list) ? list : []).map(x => ({ concept: String(x.concept || 'Concepto'), amount: Math.max(0, cents(x.amount)), type: String(x.type || 'otros') }));
    s.payslips.push({ id: String(p.id || id()), jobId: p.job, month: p.ym, gross: Math.max(0, cents(p.gross)), net: Math.max(0, cents(p.net)), company: String(p.company || ''), acc: lines(p.acc), ded: lines(p.ded), note: String(p.note || '') });
  }
  for (const [month, value] of Object.entries(raw.spent ?? {})) if (validMonth(month)) s.legacySpent[month] = Math.max(0, cents(value));
  s.generalSaved = Math.max(0, cents(raw.generalSaved));
  s.noSecond = Object.fromEntries(Object.entries(raw.noSecond ?? {}).filter(([, v]) => typeof v === 'boolean')) as Record<string, boolean>;
  s.preferences.baseMode = raw.baseMode === 'fixed' ? 'fixed' : 'pct';
  s.preferences.basePct = typeof raw.basePct === 'number' ? Math.min(100, Math.max(0, raw.basePct)) : 10;
  s.preferences.baseFixed = Math.max(0, cents(raw.baseFixed));
  s.preferences.goalsPct = typeof raw.goalsPct === 'number' ? Math.min(100, Math.max(0, raw.goalsPct)) : 50;
  return validateState(s);
}
export function readBackup(text: string): { state: State; migrated: boolean } {
  const raw = JSON.parse(text);
  const data = raw?.format === 'cuentas-claras' ? raw.state : raw;
  if (data?.schema === 2) return { state: validateState(data), migrated: false };
  return { state: migrateLegacy(data), migrated: true };
}
export const backupJson = (state: State) => JSON.stringify({ format: 'cuentas-claras', version: 2, exportedAt: new Date().toISOString(), state }, null, 2);
function csvCell(value: unknown) { let s = String(value ?? ''); if (/^\s*[=+@-]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
export function movementsCsv(s: State): string {
  const names: Record<string, string> = { salary: 'Salario', investment: 'Inversión', expense: 'Gasto', debt: 'Pago de deuda' };
  const rows: unknown[][] = [['Fecha','Tipo','Concepto','Importe EUR','Cuenta','Categoría','Aplicado al saldo','Mes de presupuesto']];
  s.transactions.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(t => rows.push([t.date, names[t.kind], t.label, (t.amount / 100).toFixed(2).replace('.', ','), s.accounts.find(a => a.id === t.accountId)?.name ?? '', t.category ?? '', t.accountId ? 'Sí' : 'No: registro anterior',transactionMonth(t)]));
  return '\uFEFF' + rows.map(r => r.map(csvCell).join(';')).join('\r\n');
}
