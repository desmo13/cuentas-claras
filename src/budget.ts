import { type State, type Goal, sum, debtRemaining, instalmentPayment, monthOf, monthDistance, daysInMonth, localDate, transactionMonth } from './model.ts';
import { salaryReservations } from './salaries.ts';
const WEIGHT = { alta: 3, media: 2, baja: 1 };
export function debtDue(s: State, month: string, today = localDate()): number {
  const current = today.slice(0, 7);
  return sum(s.debts, d => {
    const paid = (m: string) => sum(s.transactions.filter(t => t.debtId === d.id && t.date.slice(0, 7) === m), t => t.amount);
    if(d.kind==='paypal'){
      if(month<current)return paid(month);
      return paid(month)+sum(d.instalments??[],p=>!instalmentPayment(s,d.id,p.id)&&(p.date.slice(0,7)===month||month===current&&p.date.slice(0,7)<current)?p.amount:0);
    }
    if (month < current) return paid(month);
    const paidNow = paid(current);
    if (month === current) return Math.max(paidNow, Math.min(d.monthly, debtRemaining(s, d.id) + paidNow));
    const remaining = debtRemaining(s, d.id) - (paidNow > 0 ? 0 : Math.min(d.monthly, debtRemaining(s, d.id))) - d.monthly * (monthDistance(current, month) - 1);
    return Math.max(0, Math.min(d.monthly, remaining));
  });
}
export function goalInfo(goal: Goal, month: string, contributed=0) {
  const open = goal.kind === 'open';
  const active=goal.active!==false;
  const required = active && goal.kind === 'full' && !!goal.deadline;
  const remaining = open ? Infinity : Math.max(0, goal.target - goal.saved);
  const months = required ? Math.max(1, monthDistance(month, goal.deadline) + 1) : 0;
  const monthlyNeed=required?Math.ceil((remaining+contributed)/months):0;
  return { ...goal, active, open, required, remaining, months, contributed, monthlyNeed, overdue: required && goal.deadline < month && remaining > 0,
    need: required ? Math.min(remaining,Math.max(0,monthlyNeed-contributed)) : 0, give: 0, requiredGive: 0, weight: WEIGHT[goal.priority] };
}
export function budget(s: State, month = monthOf(), today = localDate()) {
  const entries = s.transactions.filter(t => transactionMonth(t) === month);
  const ready=entries.some(t=>t.kind==='salary');
  const income = sum(entries.filter(t => t.kind === 'salary' || t.kind === 'investment'), t => t.amount);
  const debt = debtDue(s, month, today);
  const fixed = sum(s.fixed, f => f.amount) + debt;
  const swept = sum(s.sweeps.filter(x => x.month === month), x => x.amount);
  const savings=salaryReservations(s,entries),baseWanted=savings.wanted;
  const available = (ready?income:0) - fixed - swept;
  const goals = s.goals.map(g => goalInfo(g, month,sum(s.sweeps.filter(x=>x.month===month&&x.destination===g.id),x=>x.amount)));
  let rest = Math.max(0,available);
  goals.filter(g => g.need > 0).sort((a, b) => b.weight - a.weight || b.need - a.need).forEach(g => {
    g.give = Math.min(g.need, rest); g.requiredGive = g.give; rest -= g.give;
  });
  const deadlineGiven=sum(goals,g=>g.requiredGive),deadlineNeeded=sum(goals,g=>g.need);
  const base=Math.min(savings.cap,rest),baseShort=baseWanted-base;
  const pool=rest-base,limit=Math.round(pool*s.preferences.goalsPct/100);
  rest=limit;
  let flexible = goals.filter(g => g.active && !g.required && g.remaining > 0);
  // Integer allocation preserves every cent, including weighted rounding remainders.
  for (let pass = 0; rest > 0 && flexible.length && pass <= goals.length + 1; pass++) {
    const weights = sum(flexible, g => g.weight);
    const before = rest;
    const shares = flexible.map(g => ({ g, raw: before * g.weight / weights, cents: Math.min(Math.floor(before * g.weight / weights), g.remaining - g.give) }));
    shares.forEach(({ g, cents }) => { g.give += cents; rest -= cents; });
    shares.sort((a, b) => (b.raw % 1) - (a.raw % 1) || b.g.weight - a.g.weight).forEach(({ g }) => { if (rest > 0 && g.give < g.remaining) { g.give++; rest--; } });
    flexible = flexible.filter(g => g.give < g.remaining);
    if (rest === before) break;
  }
  const goalsGiven = sum(goals, g => g.give);
  const flexibleGiven=goalsGiven-deadlineGiven;
  const free = pool - flexibleGiven;
  const spent = sum(entries.filter(t => t.kind === 'expense' && t.budgetKind !== 'fixed'), t => t.amount) + (s.legacySpent[month] ?? 0);
  const left = free - spent;
  const remainingDays = month === today.slice(0, 7) ? daysInMonth(month) - Number(today.slice(8)) + 1 : month > today.slice(0, 7) ? daysInMonth(month) : 0;
  return { ready,income, fixed, debt, base, baseWanted,baseShort,salarySavings:savings.details,generalIncome:savings.generalIncome,pool, limit, goals, goalsGiven,deadlineGiven,deadlineNeeded,flexibleGiven, free, spent, swept, left, remainingDays,
    perDay: remainingDays ? Math.floor(Math.max(0, left) / remainingDays) : null,
    perWeek: remainingDays ? Math.min(Math.max(0,left),Math.floor(Math.max(0,left)/remainingDays*7)) : null, deficit: Math.max(0, -available),
    short: sum(goals, g => g.need - g.requiredGive) };
}
