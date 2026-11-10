import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { readPayroll } from '../modules/payroll-ocr';
import { parsePayroll } from './payroll';
import { type Payslip, type SlipLine, id, inputMoney, parseMoney, euro, validMonth } from './model';
import { Body, Button, Card, Field, Heading, Link, spacing, usePalette } from './ui';
const ACC = [{value:'base',label:'Salario base'},{value:'plus',label:'Plus / complemento'},{value:'paga_extra',label:'Paga extra / prorrata'},{value:'horas_extra',label:'Horas extra'},{value:'otros',label:'Otro devengo'}];
const DED = [{value:'ss',label:'Seguridad Social'},{value:'irpf',label:'IRPF'},{value:'otros_d',label:'Otro descuento'}];
type DraftLine = { key: string; concept: string; amount: string; type: string };
const makeLines = (lines: SlipLine[]) => lines.map(x=>({key:id(),concept:x.concept,amount:inputMoney(x.amount),type:x.type}));
export function PayrollEditor({ initial, onClose, onSave }: { initial: Payslip; onClose:()=>void; onSave:(p:Payslip)=>Promise<void> }) {
  const c=usePalette();
  const company=initial.company;
  const [month,setMonth]=useState(initial.month),[gross,setGross]=useState(initial.gross?inputMoney(initial.gross):''),[net,setNet]=useState(initial.net?inputMoney(initial.net):'');
  const [acc,setAcc]=useState<DraftLine[]>(makeLines(initial.acc)),[ded,setDed]=useState<DraftLine[]>(makeLines(initial.ded));
  const [ocrText,setOcrText]=useState(initial.ocrText??''),[warnings,setWarnings]=useState<string[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(''),[showText,setShowText]=useState(false);
  const busyRef=useRef(false);
  const parseLine=(x:DraftLine):SlipLine=>({concept:x.concept.trim(),amount:parseMoney(x.amount),type:x.type});
  const total=(lines:DraftLine[])=>lines.reduce((a,x)=>{try{return a+parseMoney(x.amount);}catch{return a;}},0);
  const computed=total(acc)-total(ded);
  const shownNet=(()=>{try{return parseMoney(net);}catch{return 0;}})();
  async function read(source:'camera'|'gallery'|'pdf') {
    if(busyRef.current)return;
    busyRef.current=true;setError('');
    try {
      let uri='',pdf=false;
      if(source==='pdf') { const result=await DocumentPicker.getDocumentAsync({type:'application/pdf',copyToCacheDirectory:true});if(result.canceled)return;uri=result.assets[0].uri;pdf=true; }
      else {
        if(source==='camera'){const result=await ImagePicker.requestCameraPermissionsAsync();if(!result.granted)throw new Error('Activa el permiso de cámara o elige una foto guardada.');}
        const options:ImagePicker.ImagePickerOptions={mediaTypes:['images'],quality:1,allowsEditing:false,exif:false};
        const result=source==='camera'?await ImagePicker.launchCameraAsync(options):await ImagePicker.launchImageLibraryAsync(options);
        if(result.canceled)return;uri=result.assets[0].uri;
      }
      if(new File(uri).size>12*1024*1024)throw new Error('El archivo supera 12 MB. Usa una foto o un PDF más ligero.');
      setBusy(pdf?'Leyendo PDF en el móvil…':'Leyendo la foto en el móvil…');
      const result=await readPayroll(uri,pdf);
      if(!result.text.trim())throw new Error('No se ha detectado texto legible. Prueba con más luz o una imagen más nítida.');
      const parsed=parsePayroll(result,initial.jobId,company,month);
      setMonth(parsed.slip.month);setGross(parsed.slip.gross?inputMoney(parsed.slip.gross):'');setNet(parsed.slip.net?inputMoney(parsed.slip.net):'');setAcc(makeLines(parsed.slip.acc));setDed(makeLines(parsed.slip.ded));setOcrText(result.text);
      setWarnings([...parsed.warnings,...(result.pageCount>result.pagesRead?[`Se han leído ${result.pagesRead} de ${result.pageCount} páginas. Comprueba que el desglose esté completo.`]:[])]);
    } catch(e){setError(e instanceof Error?e.message:'No se ha podido leer la nómina.');}
    finally{setBusy('');busyRef.current=false;}
  }
  function chooseRead() { Alert.alert('Leer nómina','Elige una foto o un PDF. La lectura se hace en el móvil y tendrás que revisar los importes.',[{text:'Foto guardada',onPress:()=>void read('gallery')},{text:'Hacer foto',onPress:()=>void read('camera')},{text:'PDF',onPress:()=>void read('pdf')}],{cancelable:true}); }
  async function save() {
    if(busyRef.current)return;busyRef.current=true;setBusy('Guardando desglose…');setError('');
    try {
      if(!validMonth(month))throw new Error('El mes debe tener formato AAAA-MM.');
      const convert=(lines:DraftLine[])=>lines.filter(x=>x.concept.trim()||x.amount.trim()).map(x=>{if(!x.concept.trim())throw new Error('Pon nombre a cada línea del desglose.');return parseLine(x);});
      const p:Payslip={...initial,company:company.trim(),month,gross:gross.trim()?parseMoney(gross):0,net:parseMoney(net),acc:convert(acc),ded:convert(ded),ocrText};
      await onSave(p);onClose();
    }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar.');}
    finally{setBusy('');busyRef.current=false;}
  }
  const accrued=total(acc), deducted=total(ded);
  const shownGross=(()=>{try{return parseMoney(gross);}catch{return 0;}})();
  const balanced=accrued===shownGross && computed===shownNet && shownNet>0;
  const reviewSummary=acc.length>0&&<Card tinted><Heading>Comprobación de importes</Heading><Body small>{company} · {month}</Body><View style={spacing.between}><Body>Devengos · {acc.length} líneas</Body><Heading>{euro(accrued)}</Heading></View><View style={spacing.between}><Body>Descuentos · {ded.length} líneas</Body><Heading>{euro(deducted)}</Heading></View><View style={spacing.between}><Body>Líquido leído</Body><Heading>{euro(shownNet)}</Heading></View><Body tone={balanced?'good':'bad'}>{balanced?'El desglose cuadra con el bruto y el líquido leídos.':'Revisa el desglose: debe cuadrar con el bruto y el líquido leídos.'}</Body></Card>;
  function linesEditor(lines:DraftLine[],setLines:React.Dispatch<React.SetStateAction<DraftLine[]>>,deduction:boolean) {
    return <><Heading>{deduction?'Descuentos':'Devengos'}</Heading>{lines.map((line,i)=><Card key={line.key}><View style={spacing.between}><Body small>Línea {i+1}</Body><Link title="Quitar" danger onPress={()=>setLines(list=>list.filter(x=>x.key!==line.key))} /></View><Field spec={{key:'concept',label:'Concepto'}} value={line.concept} onChange={concept=>setLines(list=>list.map(x=>x.key===line.key?{...x,concept}:x))} /><View style={spacing.fields}><View style={spacing.flex}><Field spec={{key:'amount',label:'Importe (€)',type:'money'}} value={line.amount} onChange={amount=>setLines(list=>list.map(x=>x.key===line.key?{...x,amount}:x))} /></View><View style={spacing.flex}><Field spec={{key:'type',label:'Tipo',type:'select',options:deduction?DED:ACC}} value={line.type} onChange={type=>setLines(list=>list.map(x=>x.key===line.key?{...x,type}:x))} /></View></View></Card>)}<Button secondary title={deduction?'＋ Añadir descuento':'＋ Añadir devengo'} onPress={()=>setLines(list=>[...list,{key:id(),concept:'',amount:'',type:deduction?'otros_d':'plus'}])} /></>;
  }
  return <Modal visible animationType="slide" onRequestClose={()=>{if(!busy)onClose();}}><SafeAreaView style={{flex:1,backgroundColor:c.bg}}><View style={{padding:18,borderBottomWidth:1,borderColor:c.line,...spacing.between}}><Heading>Nómina · revisar desglose</Heading><Pressable accessibilityLabel="Cerrar nómina" disabled={!!busy} onPress={onClose}><Text style={{fontSize:26,color:c.muted}}>×</Text></Pressable></View><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={spacing.page}><Card tinted><Body>Lee una foto o un PDF y revisa el resultado. Guardar el desglose no duplica el ingreso del salario.</Body><Button title="Leer foto o PDF de nómina" onPress={chooseRead} disabled={!!busy} /></Card>{warnings.map((w,i)=><Body key={i} tone="bad">{w}</Body>)}{error?<Body tone="bad">{error}</Body>:null}{reviewSummary}<View style={{gap:6}}><Body small>Empresa</Body><Heading>{company}</Heading></View><Field spec={{key:'month',label:'Mes de la nómina (AAAA-MM)',type:'month'}} value={month} onChange={setMonth} /><View style={spacing.fields}><View style={spacing.flex}><Field spec={{key:'gross',label:'Bruto leído (€)',type:'money',optional:true}} value={gross} onChange={setGross} /></View><View style={spacing.flex}><Field spec={{key:'net',label:'Líquido a percibir (€)',type:'money'}} value={net} onChange={setNet} /></View></View>{linesEditor(acc,setAcc,false)}{linesEditor(ded,setDed,true)}<Card><View style={spacing.between}><Body>Devengos</Body><Heading>{euro(total(acc))}</Heading></View><View style={spacing.between}><Body>Descuentos</Body><Heading>{euro(total(ded))}</Heading></View><View style={spacing.between}><Body>Neto calculado</Body><Heading>{euro(computed)}</Heading></View>{acc.length>0&&<Body tone={computed===shownNet?'good':'bad'}>{computed===shownNet?'Cuadra con el líquido a percibir.':'El desglose no coincide con el líquido. Revisa las líneas antes de guardar.'}</Body>}{computed>=0&&acc.length>0&&<Link title="Usar este neto calculado" onPress={()=>setNet(inputMoney(computed))} />}</Card>{ocrText&&<><Link title={showText?'Ocultar texto detectado':'Ver texto detectado'} onPress={()=>setShowText(x=>!x)} />{showText&&<Text selectable style={{color:c.ink,fontSize:13,lineHeight:20}}>{ocrText}</Text>}</>}<Button title="Guardar desglose revisado" onPress={()=>void save()} disabled={!!busy} /><Button title="Cancelar" secondary onPress={onClose} disabled={!!busy} /></ScrollView></KeyboardAvoidingView>{busy&&<View style={{...StyleSheetAbsolute,backgroundColor:c.bg+'EE',alignItems:'center',justifyContent:'center',padding:30,gap:16}}><ActivityIndicator size="large" color={c.accent} /><Heading>{busy}</Heading></View>}</SafeAreaView></Modal>;
}
const StyleSheetAbsolute={position:'absolute' as const,top:0,left:0,right:0,bottom:0};
