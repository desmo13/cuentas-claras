import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, Modal, Pressable, Text, View, useColorScheme } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { type State, type Payslip, addMonth, blank, id, localDate, monthLabel, monthOf, runAuto } from './src/model';
import { validateState, readBackup } from './src/backup';
import { exportData, loadState, persistState, pickBackup } from './src/storage';
import { makeActions } from './src/actions';
import { PayrollEditor } from './src/PayrollEditor';
import { AccountDetail, Accounts, Debts, Expenses, FixedCosts, Goals, Incomes, JobDetail, More, Settings, Summary, type ScreenProps } from './src/screens';
import { Body, Button, Card, Editor, type EditorSpec, Heading, Icon, PaletteContext, dark, light, spacing } from './src/ui';

const errorText=(e:unknown)=>e instanceof Error?e.message:'No se ha podido completar la operación.';
function Main(){
  const systemTheme=useColorScheme();
  const [state,setState]=useState<State|null>(null),latest=useRef<State|null>(null),queue=useRef(Promise.resolve()),pending=useRef(0);
  const [saving,setSaving]=useState(false),[saveError,setSaveError]=useState(''),[loadError,setLoadError]=useState('');
  const [route,setRoute]=useState('resumen'),[month,setMonth]=useState(monthOf()),[today,setToday]=useState(localDate());
  const [editor,setEditor]=useState<EditorSpec|null>(null),[payroll,setPayroll]=useState<Payslip|null>(null),[busy,setBusy]=useState('');
  const preference=state?.preferences.theme??'system',isDark=preference==='dark'||preference==='system'&&systemTheme==='dark',c=isDark?dark:light;
  const monthRef=useRef(month);monthRef.current=month;
  async function boot(){
    setLoadError('');
    try{const loaded=await loadState(),processed=runAuto(loaded,localDate());await persistState(processed);latest.current=processed;setState(processed);}
    catch(e){setLoadError(errorText(e));}
  }
  useEffect(()=>{void boot();},[]);
  function commit(fn:(s:State)=>State):Promise<void>{
    pending.current++;setSaving(true);
    const operation=queue.current.catch(()=>{}).then(async()=>{
      if(!latest.current)throw new Error('Todavía se está abriendo el registro.');
      const before=latest.current,proposed=validateState(fn(before)),next=validateState(runAuto(proposed,localDate()));
      if(next!==before){await persistState(next);latest.current=next;setState(next);}
      setSaveError('');
    });
    const finished=operation.catch(e=>{setSaveError(errorText(e));throw e;}).finally(()=>{pending.current--;setSaving(pending.current>0);});
    queue.current=finished.catch(()=>{});return finished;
  }
  useEffect(()=>{
    const sub=AppState.addEventListener('change',next=>{if(next==='active'){const date=localDate();setToday(date);if(latest.current)void commit(s=>runAuto(s,date)).catch(()=>{});}});
    return()=>sub.remove();
  },[]);
  useEffect(()=>{const sub=BackHandler.addEventListener('hardwareBackPress',()=>{
    if(busy)return true;
    if(editor){setEditor(null);return true;}
    if(payroll){setPayroll(null);return true;}
    if(route.startsWith('job/')){setRoute('ingresos');return true;}
    if(route.startsWith('account/')){setRoute('cuentas');return true;}
    if(!['resumen','gastos','ingresos','mas'].includes(route)){setRoute('mas');return true;}
    if(route!=='resumen'){setRoute('resumen');return true;}
    return false;
  });return()=>sub.remove();},[route,editor,payroll,busy]);
  function openPayroll(jobId:string,p?:Payslip){
    const job=latest.current?.jobs.find(j=>j.id===jobId);if(!job)return;
    setPayroll(p?{...p,company:job.name}:{id:id(),jobId,month:monthRef.current,gross:0,net:0,company:job.name,acc:[],ded:[],note:''});
  }
  const actions=makeActions({get:()=>latest.current??blank(),commit,month:()=>monthRef.current,setMonth,editor:setEditor,openPayroll,navigate:setRoute});
  async function confirmImport(parsed:ReturnType<typeof readBackup>):Promise<boolean>{
    const detail=parsed.migrated?'Los registros antiguos se conservan sin volver a sumarlos o restarlos a las cuentas. Podrás vincularlos al editar. Las cuotas automáticas quedan en modo manual hasta que elijas su cuenta.':'Se conservarán las cuentas y las preferencias guardadas en la copia.';
    return new Promise(resolve=>Alert.alert('Revisar importación',`${parsed.state.accounts.length} cuentas, ${parsed.state.transactions.length} movimientos y ${parsed.state.payslips.length} nóminas.\n\n${detail}\n\nSe sustituirá el registro actual de esta app.`,[{text:'Cancelar',style:'cancel',onPress:()=>resolve(false)},{text:'Importar y sustituir',style:'destructive',onPress:()=>resolve(true)}],{cancelable:true,onDismiss:()=>resolve(false)}));
  }
  async function applyImport(parsed:ReturnType<typeof readBackup>){if(await confirmImport(parsed)){setBusy('Guardando importación…');try{await commit(()=>parsed.state);setRoute('cuentas');}finally{setBusy('');}}}
  async function importFile(){setBusy('Leyendo copia…');try{const parsed=await pickBackup();setBusy('');if(parsed)await applyImport(parsed);}catch(e){Alert.alert('No se pudo importar',errorText(e));}finally{setBusy('');}}
  async function exportFile(kind:'json'|'csv'){setBusy('Preparando archivo…');try{await queue.current;if(latest.current)await exportData(latest.current,kind);}catch(e){Alert.alert('No se pudo exportar',errorText(e));}finally{setBusy('');}}
  function paste(){setEditor({title:'Pegar copia JSON',description:'Pega una copia de Cuentas claras. Se revisará antes de sustituir los datos.',fields:[{key:'json',label:'Datos JSON',type:'textarea'}],values:{json:''},saveLabel:'Revisar importación',onSave:async v=>{const parsed=readBackup(v.json);await applyImport(parsed);}});}
  const primary=route==='resumen'?'resumen':route==='gastos'?'gastos':route==='ingresos'||route.startsWith('job/')?'ingresos':'mas';
  const nested=!['resumen','gastos','ingresos','mas'].includes(route);
  const monthly=['resumen','gastos','ingresos','fijos','metas'].includes(route);
  const props:ScreenProps|undefined=state?{state,month,today,actions,navigate:setRoute,commit,openPayroll,onExport:kind=>void exportFile(kind),onImport:()=>void importFile(),onPaste:paste}:undefined;
  function content(){if(!props)return null;
    if(route.startsWith('job/'))return <JobDetail {...props} jobId={route.slice(4)} />;
    if(route.startsWith('account/'))return <AccountDetail {...props} accountId={route.slice(8)} />;
    const Screen=({resumen:Summary,gastos:Expenses,ingresos:Incomes,mas:More,cuentas:Accounts,fijos:FixedCosts,deudas:Debts,metas:Goals,ajustes:Settings} as Record<string,React.ComponentType<ScreenProps>>)[route]??Summary;
    return <Screen key={route} {...props}/>;
  }
  return <PaletteContext.Provider value={c}><SafeAreaView style={{flex:1,backgroundColor:c.bg}} edges={['top','left','right']}><StatusBar style={isDark?'light':'dark'}/>
    <View style={{paddingHorizontal:18,minHeight:58,borderBottomWidth:1,borderColor:c.line,...spacing.between}}>{nested?<Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={()=>setRoute(route.startsWith('job/')?'ingresos':route.startsWith('account/')?'cuentas':'mas')} style={{paddingVertical:14,paddingRight:20}}><Text style={{color:c.accent,fontSize:14,fontWeight:'600'}}>‹ Volver</Text></Pressable>:<Text style={{fontSize:20,color:c.ink,fontWeight:'700',letterSpacing:-.5}}>Cuentas claras</Text>}<Text style={{fontSize:10,color:saveError?c.bad:c.muted}}>{saveError?'No guardado':saving?'Guardando…':'En este móvil'}</Text></View>
    {saveError&&<View style={{padding:11,backgroundColor:c.tint}}><Body small tone="bad">La operación no se ha guardado. {saveError}</Body></View>}
    {!state?<View style={{flex:1,padding:25,gap:18,justifyContent:'center'}}>{loadError?<><Heading>No se pudo abrir el registro</Heading><Body>{loadError}</Body><Button title="Reintentar" onPress={()=>void boot()}/></>:<ActivityIndicator color={c.accent} size="large"/>}</View>:<>
      {monthly&&<View style={{paddingHorizontal:18,paddingVertical:10,...spacing.between}}><Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" onPress={()=>setMonth(m=>addMonth(m,-1))} style={{height:42,width:42,borderRadius:21,backgroundColor:c.surface,borderWidth:1,borderColor:c.line,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:24,color:c.ink}}>‹</Text></Pressable><Text style={{color:c.ink,fontSize:15,fontWeight:'600'}}>{monthLabel(month)}</Text><Pressable accessibilityRole="button" accessibilityLabel="Mes siguiente" onPress={()=>setMonth(m=>addMonth(m,1))} style={{height:42,width:42,borderRadius:21,backgroundColor:c.surface,borderWidth:1,borderColor:c.line,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:24,color:c.ink}}>›</Text></Pressable></View>}
      <View style={{flex:1}}>{content()}</View><SafeAreaView edges={['bottom']} style={{backgroundColor:c.surface,borderTopWidth:1,borderColor:c.line}}><View style={{flexDirection:'row'}}>{[{id:'resumen',label:'Resumen',icon:'home'},{id:'gastos',label:'Gastos',icon:'expense'},{id:'ingresos',label:'Ingresos',icon:'income'},{id:'mas',label:'Más',icon:'more'}].map(x=><Pressable key={x.id} accessibilityRole="tab" accessibilityState={{selected:primary===x.id}} onPress={()=>setRoute(x.id)} style={{flex:1,alignItems:'center',paddingVertical:10,gap:4,backgroundColor:primary===x.id?c.tint:c.surface}}><Icon name={x.icon} color={primary===x.id?c.accent:c.muted} size={22}/><Text style={{fontSize:10,color:primary===x.id?c.accent:c.muted,fontWeight:primary===x.id?'700':'500'}}>{x.label}</Text></Pressable>)}</View></SafeAreaView>
    </>}
    {editor&&<Editor key={editor.title+Object.keys(editor.values).join('-')} spec={editor} onClose={()=>setEditor(null)} />}
    {payroll&&<PayrollEditor key={payroll.id} initial={payroll} onClose={()=>setPayroll(null)} onSave={async p=>{
      const existing=latest.current?.payslips.find(x=>x.jobId===p.jobId&&x.month===p.month&&x.id!==p.id);
      if(existing){const yes=await new Promise<boolean>(resolve=>Alert.alert('Ya hay una nómina de este mes','¿Quieres sustituir su desglose por el que acabas de revisar? Los cobros no se modificarán.',[{text:'Cancelar',style:'cancel',onPress:()=>resolve(false)},{text:'Sustituir',onPress:()=>resolve(true)}]));if(!yes)throw new Error('No se ha sustituido la nómina anterior.');}
      await commit(s=>({...s,payslips:[...s.payslips.filter(x=>x.id!==p.id&&!(x.jobId===p.jobId&&x.month===p.month)),p]}));
    }} />}
    <Modal transparent visible={!!busy} onRequestClose={()=>{}}><View style={{flex:1,backgroundColor:'#07151CB3',alignItems:'center',justifyContent:'center',padding:30}}><Card><ActivityIndicator color={c.accent} size="large"/><Heading>{busy}</Heading></Card></View></Modal>
  </SafeAreaView></PaletteContext.Provider>;
}
export default function App(){return <SafeAreaProvider><Main/></SafeAreaProvider>;}
