import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blank,accountBalance,saveTransaction,transactionMonth,type State,type Transaction} from '../src/model.ts';
import {budget} from '../src/budget.ts';
import {estimateSalaryMonth,suggestSalaryPart} from '../src/salaries.ts';
import {backupJson,readBackup,validateState} from '../src/backup.ts';
function fixture(){const s=blank();s.accounts=[{id:'bank',name:'Banco',opening:0,archived:false}];s.jobs=[{id:'one',name:'Trabajo uno',kind:'salary'},{id:'two',name:'Trabajo dos',kind:'salary'}];s.preferences.basePct=0;return s;}
function salary(s:State,id:string,date:string,month:string,amount=100000,jobId='one',part:1|2=1){return saveTransaction(s,{id,kind:'salary',label:'Sueldo',accountId:'bank',date,salaryMonth:month,salaryMonthSource:'manual',amount,jobId,part});}

test('fixed saving from one salary and the full second salary are reserved once without changing the bank',()=>{
  let s=fixture();s.jobs[0].salarySavings={primary:{mode:'fixed',value:50000}};s.jobs[1].salarySavings={primary:{mode:'all',value:0}};
  s=salary(s,'one','2026-10-30','2026-11',150000);s=salary(s,'two','2026-11-02','2026-11',60000,'two');
  s.preferences.baseMode='fixed';s.preferences.baseFixed=90000;
  const b=budget(s,'2026-11','2026-11-04');assert.equal(b.income,210000);assert.equal(b.base,110000);assert.equal(b.free,100000);assert.equal(b.salarySavings.length,2);assert.equal(accountBalance(s,'bank'),210000);
  assert.equal(budget(s,'2026-10').ready,false);
  assert.equal(budget(s,'2026-11','2026-11-29').perWeek,100000);
  assert.equal(budget(s,'2026-11','2026-12-01').perWeek,null);
});

test('per-payment override wins over a job default and survives a backup roundtrip',()=>{
  let s=salary(fixture(),'s','2026-10-30','2026-11');s.jobs[0].salarySavings={primary:{mode:'all',value:0}};
  s=saveTransaction(s,{...s.transactions[0],saving:{mode:'fixed',value:20000}});
  const restored=readBackup(backupJson(s)).state;
  assert.equal(budget(restored,'2026-11').base,20000);assert.equal(transactionMonth(restored.transactions[0]),'2026-11');assert.equal(restored.transactions[0].date,'2026-10-30');
});

test('an investment alone does not define a monthly salary budget',()=>{
  let s=saveTransaction(fixture(),{id:'i',kind:'investment',date:'2026-11-03',amount:25000,label:'Inversión',accountId:'bank'});
  assert.equal(budget(s,'2026-11').ready,false);s=salary(s,'s','2026-10-31','2026-11');assert.equal(budget(s,'2026-11').ready,true);
});

test('a fixed saving target larger than its salary reports the shortage instead of taking it from another salary',()=>{
  let s=salary(fixture(),'one','2026-11-01','2026-11',30000);s.transactions[0].saving={mode:'fixed',value:50000};
  s=salary(s,'two','2026-11-01','2026-11',100000,'two');const b=budget(s,'2026-11');
  assert.equal(b.base,30000);assert.equal(b.baseShort,20000);assert.equal(b.free,100000);
});

test('date estimation needs three labelled salaries of the same job and payment type and handles the month boundary',()=>{
  let s=fixture();s=salary(s,'jan','2026-01-30','2026-02');s=salary(s,'feb','2026-02-28','2026-03');
  assert.equal(estimateSalaryMonth(s,'one',1,'2026-03-31').estimated,false);
  s=salary(s,'mar','2026-03-31','2026-04');
  const end=estimateSalaryMonth(s,'one',1,'2026-04-30');assert.equal(end.estimated,true);assert.equal(end.month,'2026-05');
  assert.equal(estimateSalaryMonth(s,'one',1,'2026-05-02').month,'2026-05');
  assert.equal(estimateSalaryMonth(s,'two',1,'2026-04-30').estimated,false);assert.equal(estimateSalaryMonth(s,'one',2,'2026-04-30').estimated,false);
  s=salary(s,'secondary1','2026-01-10','2026-01',10000,'one',2);s=salary(s,'secondary2','2026-02-11','2026-02',10000,'one',2);s=salary(s,'secondary3','2026-03-10','2026-03',10000,'one',2);
  assert.equal(estimateSalaryMonth(s,'one',2,'2026-04-10').month,'2026-04');
});

test('a new primary payday uses its learned budget month instead of being mistaken for a secondary payment of the month on screen',()=>{
  let s=fixture();s=salary(s,'a','2026-01-30','2026-02');s=salary(s,'b','2026-02-28','2026-03');s=salary(s,'c','2026-03-31','2026-04');
  assert.equal(suggestSalaryPart(s,'one','2026-04-30','2026-04'),1);
  assert.equal(suggestSalaryPart(s,'one','2026-04-10','2026-04'),2);
  assert.equal(suggestSalaryPart(s,'two','2026-04-10','2026-04'),1);
});

test('month corrections move the budget without crediting the bank twice and unlabelled history does not train the estimator',()=>{
  let s=salary(fixture(),'s','2026-10-31','2026-10');const before=accountBalance(s,'bank');
  s=saveTransaction(s,{...s.transactions[0],salaryMonth:'2026-11'});assert.equal(accountBalance(s,'bank'),before);assert.equal(budget(s,'2026-10').income,0);assert.equal(budget(s,'2026-11').income,100000);
  const unlabelled={...s,transactions:[1,2,3].map(n=>({...s.transactions[0],id:String(n),salaryMonth:undefined}))};assert.equal(estimateSalaryMonth(unlabelled,'one',1,'2026-11-30').count,0);
});

test('active deadline goals reserve their monthly need even with a zero flexible-goals slider',()=>{
  let s=salary(fixture(),'s','2026-11-01','2026-11',200000);s.preferences.goalsPct=0;
  s.goals=[{id:'trip',name:'Viaje',kind:'full',target:120000,saved:0,deadline:'2027-04',priority:'media'}];
  const b=budget(s,'2026-11','2026-11-04');assert.equal(b.deadlineNeeded,20000);assert.equal(b.deadlineGiven,20000);assert.equal(b.free,180000);
  s.goals[0].active=false;assert.equal(budget(s,'2026-11').goalsGiven,0);s.goals[0].active=true;s.goals[0].saved=120000;assert.equal(budget(s,'2026-11').goalsGiven,0);
});

test('deadline reservations take priority, report unfunded goals and saving, and never manufacture spendable money',()=>{
  let s=salary(fixture(),'s','2026-11-01','2026-11',100000);s.transactions[0].saving={mode:'all',value:0};s.fixed=[{id:'rent',name:'Alquiler',amount:70000,day:1}];
  s.goals=[{id:'g',name:'Meta',kind:'full',target:50000,saved:0,deadline:'2026-11',priority:'alta'}];
  const b=budget(s,'2026-11');assert.equal(b.deadlineGiven,30000);assert.equal(b.short,20000);assert.equal(b.base,0);assert.equal(b.baseShort,100000);assert.equal(b.free,0);
});

test('a goal reservation already made this month is not deducted again as another planned contribution',()=>{
  let s=salary(fixture(),'s','2026-11-01','2026-11',100000);s.preferences.goalsPct=0;
  s.goals=[{id:'g',name:'Meta',kind:'full',target:120000,saved:0,deadline:'2027-10',priority:'media'}];
  const before=budget(s,'2026-11');assert.equal(before.free,90000);
  s.goals[0].saved=10000;s.sweeps=[{id:'r',month:'2026-11',amount:10000,destination:'g',destinationName:'Meta'}];
  const after=budget(s,'2026-11');assert.equal(after.deadlineGiven,0);assert.equal(after.swept,10000);assert.equal(after.free,90000);assert.equal(after.left,90000);
});

test('invalid new financial preferences and month assignments are rejected while old backups remain valid',()=>{
  const s=salary(fixture(),'s','2026-11-01','2026-11');assert.doesNotThrow(()=>validateState(s));
  for(const bad of [{mode:'pct',value:101},{mode:'fixed',value:-1},{mode:'all',value:10}])assert.throws(()=>validateState({...s,transactions:[{...s.transactions[0],saving:bad}]}));
  assert.throws(()=>validateState({...s,transactions:[{...s.transactions[0],salaryMonth:'2026-13'}]}));
  const old=fixture();assert.doesNotThrow(()=>validateState(old));
});
