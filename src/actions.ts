import { Alert } from 'react-native';
import { type State, type Transaction, type Job, type Account, type Fixed, type Goal, type Debt, type Payslip, type SavingRule, savePayPalDebt, instalmentPayment, transactionMonth, id, activeAccounts, accountBalance, accountName, inputMoney, parseMoney, localDate, monthOf, addMonth, daysInMonth, debtRemaining, saveTransaction, removeTransaction, setAccountBalance, archiveAccount, CATEGORIES, suggestCategory, validMonth } from './model';
import { budget } from './budget';
import { GENERAL_SAVING, estimateSalaryMonth, suggestSalaryPart, salarySaving } from './salaries';
import type { EditorSpec, FieldSpec, Option } from './ui';
export const INVESTMENTS: Option[] = [{ value:'acciones',label:'Acciones' },{ value:'oro',label:'Oro' },{ value:'fondos',label:'Fondos / ETF' },{ value:'cripto',label:'Cripto' },{ value:'inmueble',label:'Inmueble' },{ value:'otros',label:'Otra inversión' }];
const amountField = (key='amount',label='Importe (€)'): FieldSpec => ({ key,label,type:'money' });
const optionalMoney = (value: string) => value.trim() ? parseMoney(value) : 0;
const dayNumber = (value: string) => { const day=Number(value); if (!Number.isInteger(day)||day<1||day>31) throw new Error('El día debe estar entre 1 y 31.'); return day; };
const notEmpty = (value: string, label: string) => { if(!value.trim()) throw new Error(`Escribe ${label}.`); return value.trim(); };
const SAVING_MODES:Option[]=[{value:'general',label:'Usar el ahorro general'},{value:'fixed',label:'Ahorrar una cantidad fija'},{value:'pct',label:'Ahorrar un porcentaje'},{value:'all',label:'Ahorrar el sueldo completo'}];
function savingFields(prefix:string,label:string,visible:(v:Record<string,string>)=>boolean):FieldSpec[]{return [
  {key:prefix+'Mode',label,type:'select',options:SAVING_MODES,visibleWhen:visible},
  {key:prefix+'Amount',label:'Cantidad fija de este cobro (€)',type:'money',visibleWhen:v=>visible(v)&&v[prefix+'Mode']==='fixed'},
  {key:prefix+'Pct',label:'Porcentaje de este cobro (0–100)',type:'number',visibleWhen:v=>visible(v)&&v[prefix+'Mode']==='pct'}
];}
function savingValues(prefix:string,r:SavingRule):Record<string,string>{return {[prefix+'Mode']:r.mode,[prefix+'Amount']:inputMoney(r.mode==='fixed'?r.value:0),[prefix+'Pct']:String(r.mode==='pct'?r.value:10)};}
function readSaving(v:Record<string,string>,prefix:string):SavingRule{
  const mode=v[prefix+'Mode'];
  if(mode==='fixed')return {mode,value:parseMoney(v[prefix+'Amount'])};
  if(mode==='pct'){const value=Number(v[prefix+'Pct']);if(!v[prefix+'Pct'].trim()||!Number.isFinite(value)||value<0||value>100)throw new Error('El porcentaje debe estar entre 0 y 100.');return {mode,value};}
  if(mode==='all'||mode==='general')return {mode,value:0};
  throw new Error('Elige cómo quieres ahorrar este salario.');
}

type Context = { get: () => State; commit: (fn:(s:State)=>State)=>Promise<void>; month:()=>string; setMonth:(m:string)=>void; editor:(spec:EditorSpec)=>void; openPayroll:(jobId:string,p?:Payslip)=>void; navigate:(s:string)=>void };
export function makeActions(ctx: Context) {
  const accountOptions=()=>activeAccounts(ctx.get()).map(a=>({label:a.name,value:a.id}));
  const accountField: FieldSpec = { key:'accountId',label:'Cuenta',type:'select',options:accountOptions(),placeholder:'Elige una cuenta' };
  const dateDefault=()=>ctx.month()===monthOf()?localDate():ctx.month()+'-01';
  const safely=(fn:()=>Promise<unknown>)=>void fn().catch(e=>Alert.alert('No se ha guardado',e instanceof Error?e.message:'No se pudo completar la operación.'));
  function openAccount(existing?: Account, then?:()=>void) {
    ctx.editor({title:existing?'Editar cuenta':'Añadir cuenta',description:existing?'Puedes corregir el saldo registrado sin borrar el historial.':'Introduce el saldo inicial anterior a los movimientos que vas a registrar. La app no se conecta al banco.',fields:[{key:'name',label:'Nombre de la cuenta',placeholder:'BBVA'}, {key:'balance',label:existing?'Saldo actual registrado (€)':'Saldo inicial (€)',type:'text',placeholder:'0,00'}],values:{name:existing?.name??'',balance:inputMoney(existing?accountBalance(ctx.get(),existing.id):0)},onSave:async v=>{
      const name=notEmpty(v.name,'el nombre de la cuenta'),desired=parseMoney(v.balance,true);
      await ctx.commit(s=>existing?setAccountBalance({...s,accounts:s.accounts.map(a=>a.id===existing.id?{...a,name}:a)},existing.id,desired):{...s,accounts:[...s.accounts,{id:id(),name,opening:desired,archived:false}]});
      if(then)requestAnimationFrame(then);
    }});
  }
  function needAccount(then:()=>void):boolean {
    if(activeAccounts(ctx.get()).length)return false;
    Alert.alert('Primero, una cuenta','Añade la cuenta donde entrará o saldrá el dinero. Después podrás guardar el movimiento.',[{text:'Cancelar',style:'cancel'},{text:'Añadir cuenta',onPress:()=>openAccount(undefined,then)}]);return true;
  }
  function openJob(existing?:Job,then?:(jobId:string)=>void) {
    const fields:FieldSpec[]=[{key:'name',label:'Nombre',placeholder:'Empresa o trabajo'}];
    if(!existing)fields.push({key:'kind',label:'Tipo de ingreso',type:'select',options:[{value:'salary',label:'Trabajo / salario'},{value:'investment',label:'Inversión habitual'}]},{key:'investmentType',label:'Tipo si es una inversión',type:'select',options:INVESTMENTS,visibleWhen:v=>v.kind==='investment'});
    ctx.editor({title:existing?'Editar trabajo o fuente':'Añadir trabajo o fuente',fields,values:{name:existing?.name??'',kind:existing?.kind??'salary',investmentType:existing?.investmentType??'otros'},onSave:async v=>{
      const name=notEmpty(v.name,'el nombre'),jobId=existing?.id??id(),kind=existing?.kind??(v.kind==='investment'?'investment':'salary');
      const job:Job={...existing,id:jobId,name,kind,investmentType:v.investmentType};
      await ctx.commit(s=>({...s,jobs:existing?s.jobs.map(j=>j.id===jobId?job:j):[...s.jobs,job]}));
      if(then)requestAnimationFrame(()=>then(jobId));
    }});
  }
  function jobSavings(jobId:string) {
    const job=ctx.get().jobs.find(j=>j.id===jobId&&j.kind==='salary');if(!job)return;
    ctx.editor({title:`Ahorro de ${job.name}`,description:'Define lo que quieres ahorrar del salario principal y del secundario en los próximos cobros. Al registrar un salario podrás ajustar su ahorro individual.',
      fields:[...savingFields('primary','Ahorro del salario principal',()=>true),...savingFields('secondary','Ahorro del salario secundario',()=>true)],
      values:{...savingValues('primary',job.salarySavings?.primary??GENERAL_SAVING),...savingValues('secondary',job.salarySavings?.secondary??GENERAL_SAVING)},onSave:async v=>{
        const salarySavings={primary:readSaving(v,'primary'),secondary:readSaving(v,'secondary')};
        await ctx.commit(s=>({...s,jobs:s.jobs.map(j=>j.id===jobId?{...j,salarySavings}:j)}));
      }});
  }
  function openIncome(kind:'salary'|'investment',jobId?:string,existing?:Transaction) {
    if(needAccount(()=>openIncome(kind,jobId,existing)))return;
    const s=ctx.get();
    if(kind==='salary'&&!s.jobs.some(j=>j.kind==='salary')){openJob(undefined,newId=>openIncome(kind,newId));return;}
    const defaultSalary=activeAccounts(s).find(a=>a.id===s.preferences.salaryAccountId)?.id??'';
    const firstSalary=kind==='salary'&&!existing&&!defaultSalary,showAccount=kind==='investment'||firstSalary||!!existing;
    const targetJob=existing?.jobId??jobId??s.jobs.find(j=>j.kind==='salary')?.id??'';
    const job=s.jobs.find(j=>j.id===(jobId??existing?.jobId));
    const date=existing?.date??localDate(),part=existing?.part??suggestSalaryPart(s,targetJob,date,ctx.month());
    const hasFirst=part===2;
    const estimate=estimateSalaryMonth(s,targetJob,part,date,existing?.id);
    const fields:FieldSpec[]=[];
    if(kind==='salary')fields.push({key:'jobId',label:'Trabajo',type:'select',options:s.jobs.filter(j=>j.kind==='salary').map(j=>({value:j.id,label:j.name}))});
    fields.push({key:'label',label:'Concepto',placeholder:kind==='salary'?'Salario':'Beneficio de la inversión'},amountField());
    if(kind==='salary')fields.push({key:'part',label:'Tipo de salario',type:'select',options:[{value:'1',label:'Salario principal'},{value:'2',label:'Salario secundario'}]});
    else fields.push({key:'investmentType',label:'Tipo de inversión',type:'select',options:INVESTMENTS});
    if(showAccount)fields.push({...accountField,label:kind==='investment'?'¿A qué cuenta entra esta inversión?':'¿En qué cuenta cobras el salario?',options:accountOptions()});
    fields.push({key:'date',label:'Fecha de cobro',type:'date'});
    if(kind==='salary')fields.push({key:'salaryMonth',label:'Mes al que pertenece',type:'month',help:'El presupuesto usa este mes. La cuenta conserva la fecha real del cobro.'},...savingFields('saving','Ahorro de este salario',()=>true));
    ctx.editor({title:existing?'Editar ingreso':kind==='salary'?'Añadir salario':'Añadir ingreso de inversión',description:existing?.legacy?'Este movimiento anterior no está aplicado a ninguna cuenta. Al elegir una y guardar, su importe se añadirá al saldo.':kind==='investment'?'Elige la cuenta de destino para este ingreso. Se te preguntará en cada inversión.':firstSalary?'Solo te preguntamos la primera vez. Recordaremos esta cuenta; podrás cambiarla en Cuentas.':`Se añadirá a ${accountName(s,defaultSalary)}. Puedes cambiar la cuenta de los próximos salarios en Cuentas.`,fields,
      values:{label:existing?.label??(kind==='salary'?(hasFirst?'Salario secundario':'Salario'):(job?.name??'')),amount:existing?inputMoney(existing.amount):'',jobId:targetJob,part:String(part),accountId:existing?.accountId??(kind==='salary'?defaultSalary:''),investmentType:existing?.investmentType??job?.investmentType??'otros',date,salaryMonth:existing?transactionMonth(existing):estimate.estimated?estimate.month:ctx.month(),_monthManual:existing?'1':'0',_savingManual:existing?'1':'0',_partManual:existing?'1':'0',...savingValues('saving',existing?.saving??salarySaving(s,targetJob,part))},
      message:kind==='salary'?v=>v._monthManual==='1'?'Usaremos el mes que has elegido. Puedes corregirlo antes de guardar.':estimateSalaryMonth(ctx.get(),v.jobId,v.part==='2'?2:1,v.date,existing?.id).reason:undefined,
      onChange:(key,value,all)=>{
        const next={...all,[key]:value};if(kind!=='salary')return next;
        if(key==='salaryMonth')next._monthManual='1';if(key.startsWith('saving'))next._savingManual='1';if(key==='part')next._partManual='1';if(['jobId','date'].includes(key)&&next._partManual!=='1')next.part=String(suggestSalaryPart(ctx.get(),next.jobId,next.date,ctx.month(),existing?.id));
        if(['jobId','part','date'].includes(key)&&next._monthManual!=='1'){const suggestion=estimateSalaryMonth(ctx.get(),next.jobId,next.part==='2'?2:1,next.date,existing?.id);next.salaryMonth=suggestion.estimated?suggestion.month:ctx.month();}
        if((['jobId','part'].includes(key)||next.part!==all.part)&&next._savingManual!=='1')Object.assign(next,savingValues('saving',salarySaving(ctx.get(),next.jobId,next.part==='2'?2:1)));
        return next;
      },onSave:async v=>{
        if(kind==='salary'&&!validMonth(v.salaryMonth))throw new Error('Elige el mes al que pertenece el salario.');
        const accountId=showAccount?v.accountId:defaultSalary,estimate=estimateSalaryMonth(ctx.get(),v.jobId,v.part==='2'?2:1,v.date,existing?.id);
        const tx:Transaction={...existing,id:existing?.id??id(),kind,label:v.label,amount:parseMoney(v.amount),date:v.date,accountId:accountId||null,jobId:kind==='salary'?v.jobId:jobId,investmentType:kind==='investment'?v.investmentType:undefined,part:kind==='salary'?(v.part==='2'?2:1):undefined,salaryMonth:kind==='salary'?v.salaryMonth:undefined,salaryMonthSource:kind==='salary'?(v._monthManual==='1'||!estimate.estimated?'manual':'estimated'):undefined,saving:kind==='salary'?readSaving(v,'saving'):undefined};
        await ctx.commit(state=>saveTransaction(state,tx));ctx.setMonth(transactionMonth(tx));
      }});
  }
  function openExpense(existing?:Transaction,fixed?:Fixed,prefill?:{label:string;amount:number}) {
    if(needAccount(()=>openExpense(existing,fixed,prefill)))return;
    const s=ctx.get(),label=existing?.label??fixed?.name??prefill?.label??'';
    const category=existing?.category??(fixed?'Casa':suggestCategory(label,s.categoryMemory).category);
    ctx.editor({title:existing?'Editar gasto':fixed?'Registrar pago del gasto fijo':'Añadir gasto',description:existing?.legacy?'Al elegir una cuenta y guardar, este gasto anterior se aplicará al saldo.':fixed?'Este pago sale de la cuenta elegida. No se resta dos veces del presupuesto libre: ya está previsto en Fijos.':'La categoría se sugiere al escribir el concepto. Puedes cambiarla y se recordará tu elección.',fields:[{key:'label',label:'Concepto',placeholder:'Mercadona, café, gasolina…'},amountField(),{key:'category',label:'Categoría',type:'select',options:CATEGORIES.map(c=>({value:c,label:c}))},{...accountField,label:'Cuenta de pago',options:accountOptions()},{key:'date',label:'Fecha del gasto',type:'date'},{key:'note',label:'Notas',type:'textarea',optional:true}],values:{label,amount:existing?inputMoney(existing.amount):fixed?inputMoney(fixed.amount):prefill?inputMoney(prefill.amount):'',category,accountId:existing?.accountId??(!s.preferences.askExpenseAlways?s.preferences.expenseAccountId??'':''),date:existing?.date??dateDefault(),note:existing?.note??'',manual:existing?.categorySource==='manual'?'1':'0'},onChange:(key,value,all)=>{
      const next={...all,[key]:value};if(key==='category')next.manual='1';if(key==='label'&&all.manual!=='1')next.category=suggestCategory(value,ctx.get().categoryMemory).category;return next;
    },onSave:async v=>{
      const tx:Transaction={...existing,id:existing?.id??id(),kind:'expense',label:v.label,amount:parseMoney(v.amount),date:v.date,accountId:v.accountId||null,category:v.category as any,categorySource:v.manual==='1'?'manual':'auto',note:v.note,budgetKind:existing?.budgetKind??(fixed?'fixed':'variable'),fixedId:existing?.fixedId??fixed?.id};
      await ctx.commit(state=>saveTransaction(state,tx,{learn:v.manual==='1'}));ctx.setMonth(v.date.slice(0,7));
    }});
  }
  function deleteTransaction(t:Transaction) { Alert.alert('Eliminar movimiento',`Se quitará «${t.label}» y se corregirá automáticamente el saldo de su cuenta.`,[{text:'Cancelar',style:'cancel'},{text:'Eliminar',style:'destructive',onPress:()=>safely(()=>ctx.commit(s=>removeTransaction(s,t.id)))}]); }
  function defaults(kind:'salary'|'expense') {
    if(needAccount(()=>defaults(kind)))return;
    const s=ctx.get();
    ctx.editor({title:kind==='salary'?'Cuenta de los salarios':'Cuenta de los gastos',description:'Este cambio se aplica a los próximos movimientos. Los ya registrados conservan su cuenta.',fields:[{...accountField,label:kind==='salary'?'Ingresar los salarios en':'Cuenta de pago por defecto',options:accountOptions()}],values:{accountId:(kind==='salary'?s.preferences.salaryAccountId:s.preferences.expenseAccountId)??''},onSave:async v=>{if(!accountOptions().some(a=>a.value===v.accountId))throw new Error('Elige una cuenta.');await ctx.commit(state=>({...state,preferences:{...state.preferences,[kind==='salary'?'salaryAccountId':'expenseAccountId']:v.accountId}}));}});
  }
  function openFixed(existing?:Fixed) {
    ctx.editor({title:existing?'Editar gasto fijo':'Añadir gasto fijo',description:'Los fijos reservan presupuesto. El saldo bancario solo cambia cuando registres el pago.',fields:[{key:'name',label:'Nombre',placeholder:'Alquiler, internet…'},amountField(),{key:'day',label:'Día del cobro (1–31)',type:'number'}],values:{name:existing?.name??'',amount:existing?inputMoney(existing.amount):'',day:String(existing?.day??1)},onSave:async v=>{
      const f:Fixed={id:existing?.id??id(),name:notEmpty(v.name,'el nombre'),amount:parseMoney(v.amount),day:dayNumber(v.day)};if(f.amount<=0)throw new Error('El importe debe ser mayor que cero.');
      await ctx.commit(s=>({...s,fixed:existing?s.fixed.map(x=>x.id===f.id?f:x):[...s.fixed,f]}));
    }});
  }
  function deleteFixed(f:Fixed) { Alert.alert('Quitar gasto fijo',`Se quitará la previsión de «${f.name}». Los pagos registrados se conservarán como gastos.`,[{text:'Cancelar',style:'cancel'},{text:'Quitar',style:'destructive',onPress:()=>safely(()=>ctx.commit(s=>({...s,fixed:s.fixed.filter(x=>x.id!==f.id),transactions:s.transactions.map(t=>t.fixedId===f.id?{...t,fixedId:undefined,budgetKind:'variable'}:t)})))}]); }
  function openGoal(existing?:Goal) {
    ctx.editor({title:existing?'Editar meta':'Añadir meta de ahorro',fields:[{key:'name',label:'Nombre de la meta'},{key:'kind',label:'Tipo de meta',type:'select',options:[{value:'full',label:'Con importe y fecha límite'},{value:'nodate',label:'Con importe, sin fecha'},{value:'open',label:'Sin límite'}]},amountField('target','Importe objetivo (€)'),amountField('saved','Ya ahorrado (€)'),{key:'deadline',label:'Mes límite',type:'month',visibleWhen:v=>v.kind==='full'},{key:'active',label:'Estado',type:'select',options:[{value:'1',label:'Activa'},{value:'0',label:'En pausa'}]},{key:'priority',label:'Prioridad',type:'select',options:[{value:'alta',label:'Alta'},{value:'media',label:'Media'},{value:'baja',label:'Baja'}]}],values:{name:existing?.name??'',kind:existing?.kind??'full',target:existing?.target?inputMoney(existing.target):'',saved:inputMoney(existing?.saved??0),deadline:existing?.deadline??addMonth(monthOf(),12),priority:existing?.priority??'media',active:existing?.active===false?'0':'1'},onSave:async v=>{
      const kind=v.kind as Goal['kind'],target=kind==='open'?0:parseMoney(v.target);if(kind!=='open'&&target<=0)throw new Error('El objetivo debe ser mayor que cero.');if(kind==='full'&&!validMonth(v.deadline))throw new Error('Escribe un mes válido con formato AAAA-MM.');
      const g:Goal={id:existing?.id??id(),name:notEmpty(v.name,'el nombre'),kind,target,saved:optionalMoney(v.saved),deadline:kind==='full'?v.deadline:'',priority:v.priority as Goal['priority'],active:v.active!=='0'};await ctx.commit(s=>({...s,goals:existing?s.goals.map(x=>x.id===g.id?g:x):[...s.goals,g]}));
    }});
  }
  function addGoalMoney(goal:Goal) {
    ctx.editor({title:`Sumar a ${goal.name}`,description:'Es una reserva de dinero que ya tienes; no cambia los saldos de tus cuentas.',fields:[amountField()],values:{amount:''},onSave:async v=>{const amount=parseMoney(v.amount);if(amount<=0)throw new Error('Escribe un importe mayor que cero.');await ctx.commit(s=>({...s,goals:s.goals.map(g=>g.id===goal.id?{...g,saved:g.saved+amount}:g)}));}});
  }
  function openDebt(existing?:Debt,paypal=false) {
    const s=ctx.get(),isPayPal=existing?.kind==='paypal'||paypal,slots=existing?.instalments;
    const nextMonth=addMonth(monthOf(),1),nextDate=`${nextMonth}-${String(Math.min(Number(localDate().slice(8)),daysInMonth(nextMonth))).padStart(2,'0')}`;
    const regular=(v:Record<string,string>)=>v.kind!=='paypal',two=(v:Record<string,string>)=>v.kind==='paypal';
    const kinds=[{value:'loan',label:'Préstamo'},{value:'plan',label:'Compra a plazos'},...(!existing||existing.kind==='paypal'?[{value:'paypal',label:'Compras PayPal'}]:[])];
    const fields:FieldSpec[]=[{key:'name',label:'Nombre',placeholder:'Nombre de la deuda o compra'}];
    if(existing?.kind!=='paypal')fields.push({key:'kind',label:'Tipo',type:'select',options:kinds});
    fields.push({...amountField('amount1','Importe del primer plazo (€)'),visibleWhen:two},{key:'date1',label:'Fecha del primer plazo',type:'date',visibleWhen:two},
      {...amountField('amount2','Importe del segundo plazo (€)'),visibleWhen:two},{key:'date2',label:'Fecha del segundo plazo',type:'date',visibleWhen:two},
      {...amountField('total','Importe total (€)'),visibleWhen:regular},{...amountField('remaining','Pendiente de pagar (€)'),visibleWhen:regular},{...amountField('monthly','Cuota mensual (€)'),visibleWhen:regular},
      {key:'day',label:'Día del cobro (1–31)',type:'number',visibleWhen:regular},{key:'auto',label:'Registro de cuotas',type:'select',options:[{value:'0',label:'Registrar los pagos manualmente'},{value:'1',label:'Descontar automáticamente al abrir la app'}],visibleWhen:regular},
      {...accountField,label:'Cuenta para cuotas automáticas',optional:true,options:accountOptions(),visibleWhen:v=>regular(v)&&v.auto==='1'});
    ctx.editor({title:existing?(isPayPal?'Editar compra PayPal':'Editar deuda'):isPayPal?'Añadir compra PayPal':'Añadir deuda',description:'En Compras PayPal defines exactamente dos plazos, cada uno con su importe y fecha. Registra cada pago cuando se cargue en tu cuenta.',fields,
      message:v=>{if(v.kind!=='paypal')return 'Las cuotas automáticas requieren activar la opción y elegir una cuenta.';try{return `Total de la compra: ${inputMoney(optionalMoney(v.amount1)+optionalMoney(v.amount2))} €. Dos plazos independientes.`;}catch{return 'Indica el importe y la fecha de los dos plazos.';}},
      values:{name:existing?.name??'',kind:existing?.kind??(isPayPal?'paypal':'loan'),total:existing?inputMoney(existing.total):'',remaining:existing?inputMoney(debtRemaining(s,existing.id)):'',monthly:existing?inputMoney(existing.monthly):'',day:String(existing?.day??1),auto:existing?.auto?'1':'0',accountId:existing?.accountId??s.preferences.expenseAccountId??'',amount1:slots?inputMoney(slots[0].amount):'',amount2:slots?inputMoney(slots[1].amount):'',date1:slots?.[0].date??localDate(),date2:slots?.[1].date??nextDate},onSave:async v=>{
        if(v.kind==='paypal'){
          const instalments:[NonNullable<Debt['instalments']>[0],NonNullable<Debt['instalments']>[1]]=[{id:slots?.[0].id??id(),amount:parseMoney(v.amount1),date:v.date1},{id:slots?.[1].id??id(),amount:parseMoney(v.amount2),date:v.date2}];
          await ctx.commit(state=>savePayPalDebt(state,{id:existing?.id??id(),name:notEmpty(v.name,'el nombre'),instalments}));return;
        }
        const total=parseMoney(v.total),remaining=parseMoney(v.remaining),monthly=parseMoney(v.monthly),day=dayNumber(v.day),auto=v.auto==='1';
        if(monthly<=0||remaining>total)throw new Error('Revisa la cuota y el importe pendiente.');if(auto&&!accountOptions().some(x=>x.value===v.accountId))throw new Error('Elige la cuenta para las cuotas automáticas.');
        await ctx.commit(state=>{const paid=existing?state.transactions.filter(t=>t.debtId===existing.id).reduce((a,t)=>a+t.amount,0):0;const current=monthOf(),due=`${current}-${String(Math.min(day,daysInMonth(current))).padStart(2,'0')}`;const d:Debt={id:existing?.id??id(),name:notEmpty(v.name,'el nombre'),kind:v.kind==='plan'?'plan':'loan',total,openingRemaining:remaining+paid,monthly,day,auto,autoFrom:existing?.auto&&auto&&existing.day===day?existing.autoFrom:due>=localDate()?current:addMonth(current,1),accountId:auto?v.accountId:null};return {...state,debts:existing?state.debts.map(x=>x.id===d.id?d:x):[...state.debts,d]};});
      }});
  }
  function payDebt(debt:Debt,instalmentId?:string) {
    if(needAccount(()=>payDebt(debt,instalmentId)))return;const s=ctx.get();
    if(debt.kind==='paypal'){
      const slot=debt.instalments?.find(p=>p.id===instalmentId),index=debt.instalments?.findIndex(p=>p.id===instalmentId)??-1;
      if(!slot||instalmentPayment(s,debt.id,slot.id)){Alert.alert('Plazo ya pagado','Elige uno de los plazos pendientes.');return;}
      ctx.editor({title:`Pagar plazo ${index+1} de 2`,description:`${debt.name} · ${inputMoney(slot.amount)} €. Se registrará el importe definido para este plazo.`,fields:[{...accountField,label:'Cuenta de pago',options:accountOptions()},{key:'date',label:'Fecha real del pago',type:'date'}],values:{accountId:s.preferences.expenseAccountId??'',date:localDate()},onSave:async v=>{
        await ctx.commit(state=>saveTransaction(state,{id:id(),kind:'debt',label:`PayPal · ${debt.name} · plazo ${index+1} de 2`,amount:slot.amount,date:v.date,accountId:v.accountId||null,debtId:debt.id,instalmentId:slot.id}));
      }});return;
    }
    ctx.editor({title:`Registrar pago: ${debt.name}`,fields:[amountField(),{...accountField,label:'Cuenta de pago',options:accountOptions()},{key:'date',label:'Fecha',type:'date'}],values:{amount:inputMoney(Math.min(debt.monthly,debtRemaining(s,debt.id))),accountId:debt.accountId??s.preferences.expenseAccountId??'',date:localDate()},onSave:async v=>{await ctx.commit(state=>saveTransaction(state,{id:id(),kind:'debt',label:debt.name,amount:parseMoney(v.amount),date:v.date,accountId:v.accountId||null,debtId:debt.id}));}});
  }
  function sweep() {
    const s=ctx.get(),b=budget(s,ctx.month());if(!b.ready){Alert.alert('Presupuesto pendiente','Registra al menos un salario asignado a este mes antes de reservar su presupuesto.');return;}
    ctx.editor({title:'Reservar lo que sobra',description:'Reserva parte del presupuesto libre para ahorro. No es una transferencia entre bancos ni un gasto.',fields:[amountField(),{key:'destination',label:'Destino del ahorro',type:'select',options:[{value:'general',label:'Ahorro general'},...s.goals.map(g=>({value:g.id,label:g.name}))]}],values:{amount:inputMoney(Math.max(0,b.left)),destination:'general'},onSave:async v=>{
      const amount=parseMoney(v.amount);await ctx.commit(state=>{if(amount<=0||amount>Math.max(0,budget(state,ctx.month()).left))throw new Error('El importe supera el presupuesto libre que queda.');const g=state.goals.find(x=>x.id===v.destination);if(v.destination!=='general'&&!g)throw new Error('Elige una meta válida.');return {...state,generalSaved:state.generalSaved+(g?0:amount),goals:state.goals.map(x=>x.id===v.destination?{...x,saved:x.saved+amount}:x),sweeps:[...state.sweeps,{id:id(),month:ctx.month(),amount,destination:v.destination,destinationName:g?.name??'Ahorro general'}]};});
    }});
  }
  function settings() {
    const p=ctx.get().preferences;
    ctx.editor({title:'Ajustes del presupuesto',fields:[{key:'baseMode',label:'Ahorro base',type:'select',options:[{value:'pct',label:'Porcentaje de los ingresos'},{value:'fixed',label:'Importe fijo al mes'}]},{key:'basePct',label:'Porcentaje de ahorro base (0–100)',type:'number'},amountField('baseFixed','Importe fijo de ahorro (€)'),{key:'goalsPct',label:'Tope para metas sin fecha (0–100)',type:'number'},{key:'theme',label:'Apariencia',type:'select',options:[{value:'system',label:'Seguir el móvil'},{value:'light',label:'Claro'},{value:'dark',label:'Oscuro'}]}],values:{baseMode:p.baseMode,basePct:String(p.basePct),baseFixed:inputMoney(p.baseFixed),goalsPct:String(p.goalsPct),theme:p.theme},onSave:async v=>{const basePct=Number(v.basePct),goalsPct=Number(v.goalsPct);if(!Number.isFinite(basePct)||!Number.isFinite(goalsPct)||basePct<0||basePct>100||goalsPct<0||goalsPct>100)throw new Error('Los porcentajes deben estar entre 0 y 100.');await ctx.commit(s=>({...s,preferences:{...s.preferences,baseMode:v.baseMode==='fixed'?'fixed':'pct',basePct,baseFixed:optionalMoney(v.baseFixed),goalsPct,theme:v.theme as any}}));}});
  }
  return {openAccount,openJob,jobSavings,openIncome,openExpense,deleteTransaction,defaults,openFixed,deleteFixed,openGoal,addGoalMoney,openDebt,payDebt,sweep,settings,
    editTransaction:(t:Transaction)=>t.kind==='expense'?openExpense(t):t.kind==='debt'?Alert.alert('Pago de deuda','Para corregir este pago, elimínalo y registra el correcto. El saldo se ajustará en ambas operaciones.'):openIncome(t.kind,t.jobId,t),
    archive:(a:Account)=>Alert.alert('Archivar cuenta',`Los movimientos y el saldo de ${a.name} se conservan. Ya no aparecerá como destino de nuevos movimientos.`,[{text:'Cancelar',style:'cancel'},{text:'Archivar',onPress:()=>safely(()=>ctx.commit(s=>archiveAccount(s,a.id)))}]),
    unarchive:(a:Account)=>safely(()=>ctx.commit(s=>({...s,accounts:s.accounts.map(x=>x.id===a.id?{...x,archived:false}:x)}))),
  };
}
export type Actions = ReturnType<typeof makeActions>;
