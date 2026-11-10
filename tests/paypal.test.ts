import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blank,savePayPalDebt,saveTransaction,removeTransaction,removeDebtPlan,accountBalance,debtRemaining,instalmentPayment,runAuto,validInstalments,type State,type Transaction} from '../src/model.ts';
import {debtDue} from '../src/budget.ts';
import {backupJson,readBackup,validateState} from '../src/backup.ts';
function purchase(){const s=blank();s.accounts=[{id:'bank',name:'Banco',opening:100000,archived:false}];return savePayPalDebt(s,{id:'paypal',name:'Compra',instalments:[{id:'first',amount:4025,date:'2026-11-04'},{id:'second',amount:6575,date:'2026-12-04'}]});}
function payment(s:State,slot='first',date='2026-11-04',id='payment1'){const p=s.debts[0].instalments!.find(p=>p.id===slot)!;return saveTransaction(s,{id,kind:'debt',label:'PayPal',date,amount:p.amount,accountId:'bank',debtId:'paypal',instalmentId:slot});}

test('a PayPal purchase has two independently sized and dated instalments and does not change the bank when created',()=>{
  const s=purchase();assert.equal(s.debts[0].total,10600);assert.equal(debtRemaining(s,'paypal'),10600);assert.equal(accountBalance(s,'bank'),100000);
  assert.equal(debtDue(s,'2026-11','2026-11-01'),4025);assert.equal(debtDue(s,'2026-12','2026-11-01'),6575);assert.equal(debtDue(s,'2027-01','2026-11-01'),0);
  assert.equal(s.debts[0].monthly,0);assert.equal(s.debts[0].auto,false);
});

test('each instalment debits its own exact amount once, is counted once in the budget, and never creates a third monthly payment',()=>{
  let s=payment(purchase());assert.equal(accountBalance(s,'bank'),95975);assert.equal(debtRemaining(s,'paypal'),6575);assert(instalmentPayment(s,'paypal','first'));
  assert.equal(debtDue(s,'2026-11','2026-11-04'),4025);assert.equal(debtDue(s,'2026-12','2026-11-04'),6575);
  assert.throws(()=>payment(s,'first','2026-11-04','duplicate'),/ya está pagado/);
  s=payment(s,'second','2026-12-04','payment2');assert.equal(accountBalance(s,'bank'),89400);assert.equal(debtRemaining(s,'paypal'),0);
  assert.equal(debtDue(s,'2026-12','2026-12-04'),6575);const later=runAuto(s,'2027-06-01');assert.equal(later.transactions.length,2);assert.equal(accountBalance(later,'bank'),89400);
});

test('an instalment cannot be paid with a different amount or as an unassigned extra payment',()=>{
  const s=purchase(),base:Transaction={id:'wrong',kind:'debt',label:'Pago',date:'2026-11-04',amount:5000,accountId:'bank',debtId:'paypal',instalmentId:'first'};
  assert.throws(()=>saveTransaction(s,base),/importe definido/);assert.throws(()=>saveTransaction(s,{...base,amount:4025,instalmentId:undefined}),/importe definido/);
});

test('undoing a payment restores its balance and due amount; editing an unpaid amount never rewrites paid money',()=>{
  let s=payment(purchase());const slots=s.debts[0].instalments!;
  assert.throws(()=>savePayPalDebt(s,{id:'paypal',name:'Compra',instalments:[{...slots[0],amount:5000},slots[1]]}),/deshaz primero/);
  s=savePayPalDebt(s,{id:'paypal',name:'Compra editada',instalments:[slots[0],{...slots[1],amount:7000}]});assert.equal(debtRemaining(s,'paypal'),7000);assert.equal(accountBalance(s,'bank'),95975);
  s=removeTransaction(s,'payment1');assert.equal(accountBalance(s,'bank'),100000);assert.equal(debtRemaining(s,'paypal'),11025);assert.equal(debtDue(s,'2026-11','2026-11-04'),4025);
});

test('unpaid past instalments reduce the current budget, and an early or late payment follows its actual date without a second reservation',()=>{
  let s=purchase();assert.equal(debtDue(s,'2026-12','2026-12-02'),10600);
  s=payment(s,'second','2026-11-30','early');assert.equal(debtDue(s,'2026-12','2026-12-02'),4025);assert.equal(debtDue(s,'2026-11','2026-12-02'),6575);
  s=payment(s,'first','2026-12-02','late');assert.equal(debtDue(s,'2026-12','2026-12-02'),4025);assert.equal(debtDue(s,'2027-01','2026-12-02'),0);
});

test('exactly two valid dates and positive amounts are required; both dates may be in the same month and amounts may be equal',()=>{
  const slots=purchase().debts[0].instalments!;
  for(const bad of [[slots[0]],[...slots,{id:'third',amount:100,date:'2027-01-04'}],[slots[0],{...slots[1],amount:0}],[slots[0],{...slots[1],date:'2026-11-31'}],[slots[0],{...slots[1],date:'2026-10-01'}],[slots[0],{...slots[1],id:'first'}]])assert.equal(validInstalments(bad),false);
  const s=savePayPalDebt(purchase(),{id:'paypal',name:'Mismo mes',instalments:[slots[0],{...slots[1],amount:4025,date:'2026-11-20'}]});assert.equal(debtDue(s,'2026-11','2026-11-01'),8050);assert.equal(debtDue(s,'2026-12','2026-11-01'),0);
});

test('backups retain both instalments and reject incomplete plans or duplicate paid instalments',()=>{
  const s=payment(purchase()),restored=readBackup(backupJson(s)).state;assert.equal(restored.debts[0].instalments?.length,2);assert.equal(accountBalance(restored,'bank'),95975);assert.equal(debtRemaining(restored,'paypal'),6575);
  assert.throws(()=>validateState({...s,debts:[{...s.debts[0],instalments:[s.debts[0].instalments![0]]}]}));
  assert.throws(()=>validateState({...s,transactions:[...s.transactions,{...s.transactions[0],id:'duplicate'}]}));
  assert.throws(()=>validateState({...s,debts:[{...s.debts[0],auto:true}]}));
});

test('removing a purchase preserves paid bank debits as expenses and clears the schedule references',()=>{
  const s=removeDebtPlan(payment(purchase()),'paypal');assert.equal(s.debts.length,0);assert.equal(accountBalance(s,'bank'),95975);assert.equal(s.transactions[0].kind,'expense');assert.equal(s.transactions[0].instalmentId,undefined);assert.equal(s.transactions[0].debtId,undefined);assert.doesNotThrow(()=>validateState(s));
});
