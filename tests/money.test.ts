import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blank, parseMoney, parseQuick, accountBalance, saveTransaction, removeTransaction, suggestCategory, runAuto, debtRemaining, setAccountBalance, type State, type Transaction } from '../src/model.ts';
import { budget } from '../src/budget.ts';
import { backupJson, migrateLegacy, readBackup, validateState, movementsCsv } from '../src/backup.ts';
function fixture(): State { const s=blank(); s.accounts=[{id:'bbva',name:'BBVA',opening:10000,archived:false},{id:'ahorro',name:'Ahorro',opening:0,archived:false}];s.jobs=[{id:'trabajo',name:'Trabajo',kind:'salary'}];return s; }
const salary=(id='salario',amount=100000,accountId='bbva'): Transaction=>({id,kind:'salary',label:'Nómina',amount,accountId,jobId:'trabajo',part:1,date:'2026-11-02'});
const investment=(id='inversion',amount=20000,accountId='bbva'): Transaction=>({id,kind:'investment',label:'Fondos',amount,accountId,date:'2026-11-02'});
test('salary and investment credit the selected bank account; expenses debit that same ledger',()=>{
  let s=saveTransaction(fixture(),salary());s=saveTransaction(s,investment());
  s=saveTransaction(s,{id:'gasto',kind:'expense',label:'Mercadona',amount:1234,category:'Comida',accountId:'bbva',date:'2026-11-02'});
  assert.equal(accountBalance(s,'bbva'),128766);assert.equal(accountBalance(s,'ahorro'),0);
});
test('salary remembers first choice; later preference changes affect only new payments',()=>{
  let s=saveTransaction(fixture(),salary());assert.equal(s.preferences.salaryAccountId,'bbva');
  s={...s,preferences:{...s.preferences,salaryAccountId:'ahorro'}};
  s=saveTransaction(s,salary('siguiente',10000,'ahorro'));
  assert.equal(accountBalance(s,'bbva'),110000);assert.equal(accountBalance(s,'ahorro'),10000);
});
test('investment rejects omitted account even when a salary default exists',()=>{
  const s=saveTransaction(fixture(),salary());
  assert.throws(()=>saveTransaction(s,{...investment(),accountId:null}),/Elige una cuenta/);
});
test('edits, moves, deletions and a restart-shaped JSON roundtrip never double count',()=>{
  let s=saveTransaction(fixture(),investment());
  s=saveTransaction(s,investment('inversion',30000));assert.equal(accountBalance(s,'bbva'),40000);
  s=saveTransaction(s,investment('inversion',30000,'ahorro'));assert.equal(accountBalance(s,'bbva'),10000);assert.equal(accountBalance(s,'ahorro'),30000);
  s=validateState(JSON.parse(JSON.stringify(s)));assert.equal(accountBalance(s,'ahorro'),30000);
  s=removeTransaction(s,'inversion');assert.equal(accountBalance(s,'ahorro'),0);
});
test('decimal parsing preserves cents, Spanish groups and negative opening balances; rejects malformed input',()=>{
  assert.equal(parseMoney('1.234,56 €'),123456);assert.equal(parseMoney('12.50'),1250);assert.equal(parseMoney('0,01'),1);assert.equal(parseMoney('-35,75',true),-3575);
  for(const bad of ['12abc','12,345','1.2.3','Infinity','-10','']) assert.throws(()=>parseMoney(bad));
});
test('category suggestions use local rules and remember explicit user corrections',()=>{
  assert.equal(suggestCategory('MERCADONA',{}).category,'Comida');assert.equal(suggestCategory('Café y tostada',{}).category,'Ocio');assert.equal(suggestCategory('Repsol gasóleo',{}).category,'Transporte');
  assert.equal(suggestCategory('Mercadona',{'mercadona':'Casa'}).category,'Casa');assert.equal(suggestCategory('Desconocido',{}).category,'Otros');
});
test('quick expense distinguishes a marked price from other numbers instead of recording the wrong amount',()=>{
  assert.deepEqual(parseQuick('12,50 café'),{amount:1250,label:'café'});
  assert.deepEqual(parseQuick('Gasolina 95 20 €'),{amount:2000,label:'Gasolina 95'});
  assert.deepEqual(parseQuick('€ 12,50 desayuno'),{amount:1250,label:'desayuno'});
  assert.throws(()=>parseQuick('Gasolina 95 20'),/varios números/);
});
test('last expense account can change without modifying earlier expenses',()=>{
  let s=saveTransaction(fixture(),{id:'a',kind:'expense',label:'Café',amount:100,accountId:'bbva',category:'Ocio',date:'2026-11-02'});
  s=saveTransaction(s,{id:'b',kind:'expense',label:'Farmacia',amount:200,accountId:'ahorro',category:'Salud',date:'2026-11-02'});
  assert.equal(s.preferences.expenseAccountId,'ahorro');assert.equal(accountBalance(s,'bbva'),9900);assert.equal(accountBalance(s,'ahorro'),-200);
});
test('legacy migration preserves current balances and history without replaying old bank movements',()=>{
  const s=migrateLegacy({accounts:[{id:'bbva',name:'BBVA',amount:1000}],jobs:[{id:'j',name:'Trabajo'}],income:{'2026-11':[{id:'i',job:'j',label:'Salario',amount:500,date:'2026-11-01'},{id:'inv',inv:{name:'Oro',type:'oro'},amount:200,date:'2026-11-02'}]},expenses:{'2026-11':[{id:'e',concept:'Café',cat:'Ocio',amount:12.5,date:'2026-11-02'}]}});
  assert.equal(accountBalance(s,'bbva'),100000);assert.equal(s.transactions.length,3);assert(s.transactions.every(t=>t.accountId===null&&t.legacy));
  const inv=s.transactions.find(t=>t.kind==='investment')!; const linked=saveTransaction(s,{...inv,accountId:'bbva'});
  assert.equal(accountBalance(linked,'bbva'),120000);
});
test('auto debt payments debit once, clamp month-end and reverse on deletion',()=>{
  let s=fixture();s.debts=[{id:'d',name:'Móvil',kind:'plan',total:10000,openingRemaining:10000,monthly:3000,day:31,auto:true,autoFrom:'2026-02',accountId:'bbva'}];
  s=runAuto(s,'2026-02-28');assert.equal(debtRemaining(s,'d'),7000);assert.equal(accountBalance(s,'bbva'),7000);assert.equal(s.transactions[0].date,'2026-02-28');
  s=runAuto(s,'2026-02-28');assert.equal(s.transactions.length,1);
  s=removeTransaction(s,s.transactions[0].id);assert.equal(accountBalance(s,'bbva'),10000);assert.equal(debtRemaining(s,'d'),10000);
});
test('month budgeting keeps planning reservations separate from actual fixed account debits',()=>{
  let s=fixture();s.fixed=[{id:'f',name:'Alquiler',amount:50000,day:1}];s=saveTransaction(s,salary('s',200000));
  s=saveTransaction(s,{id:'fijo',kind:'expense',label:'Alquiler',amount:50000,accountId:'bbva',category:'Casa',fixedId:'f',budgetKind:'fixed',date:'2026-11-02'});
  s=saveTransaction(s,{id:'variable',kind:'expense',label:'Comida',amount:10000,accountId:'bbva',category:'Comida',date:'2026-11-02'});
  const b=budget(s,'2026-11','2026-11-02');assert.equal(b.free,130000);assert.equal(b.spent,10000);assert.equal(b.left,120000);assert.equal(accountBalance(s,'bbva'),150000);
  assert.throws(()=>saveTransaction(s,{...s.transactions[1],id:'duplicado'}),/ya está marcado/);
});
test('weighted goals conserve cents, respect priorities and never over-allocate',()=>{
  let s=saveTransaction(fixture(),salary('s',10001));s.preferences.basePct=0;s.preferences.goalsPct=100;
  s.goals=[{id:'a',name:'Alta',kind:'open',target:0,saved:0,deadline:'',priority:'alta'},{id:'b',name:'Baja',kind:'open',target:0,saved:0,deadline:'',priority:'baja'}];
  const b=budget(s,'2026-11','2026-11-02');assert.equal(b.goalsGiven,10001);assert.equal(b.free,0);assert(b.goals[0].give>b.goals[1].give);
});
test('balance reconciliation preserves transactions and calculates the right opening adjustment',()=>{
  let s=saveTransaction(fixture(),salary());s=setAccountBalance(s,'bbva',250000);assert.equal(accountBalance(s,'bbva'),250000);assert.equal(s.transactions.length,1);
});
test('changing savings forecasts never changes recorded transactions or bank balances',()=>{
  const s=saveTransaction(fixture(),salary());const snapshot=JSON.stringify(s.transactions),before=accountBalance(s,'bbva');
  const adjusted={...s,preferences:{...s.preferences,basePct:30,goalsPct:75}};
  assert.notEqual(budget(s,'2026-11').free,budget(adjusted,'2026-11').free);
  assert.equal(accountBalance(adjusted,'bbva'),before);assert.equal(JSON.stringify(adjusted.transactions),snapshot);
});
test('backup roundtrip retains all balances and CSV escapes spreadsheet formulas',()=>{
  const s=saveTransaction(fixture(),{...investment(),label:'=SUM(1;2)'});const restored=readBackup(backupJson(s));
  assert.equal(restored.migrated,false);assert.equal(accountBalance(restored.state,'bbva'),30000);assert(movementsCsv(s).includes("'=SUM(1;2)"));
  const invalid={...s,transactions:[{...s.transactions[0],amount:Infinity}]};assert.throws(()=>validateState(invalid));
});
