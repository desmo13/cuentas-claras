import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePayroll,ocrRows} from '../src/payroll.ts';
import {readFileSync} from 'node:fs';
import type {OcrLine} from '../src/payroll.ts';
const layout:OcrLine[]=JSON.parse(readFileSync(new URL('./fixtures/payroll-columns.json',import.meta.url),'utf8'));
function readLayout(words:OcrLine[]=layout){return parsePayroll({text:ocrRows(words).join('\n'),lines:[],words},'demo','Trabajo de prueba','2026-11');}
test('local payroll extraction proposes separate accruals and deductions and reads net and month',()=>{
  const text='EMPRESA: Empresa de prueba\nNómina noviembre 2026\nSalario base 1.000,00\nPlus nocturnidad 100,00\nProrrata pagas extras 150,00\nContingencias comunes 4,70% 58,75\nIRPF 10,00% 125,00\nTOTAL DEVENGADO 1.250,00\nLÍQUIDO A PERCIBIR 1.066,25';
  const {slip,warnings}=parsePayroll({text,lines:[]},'job','Original','2026-10');
  assert.equal(slip.company,'Original');assert.equal(slip.net,106625);assert.equal(slip.gross,125000);assert.equal(slip.month,'2026-11');assert.equal(slip.acc.length,3);assert.equal(slip.ded.length,2);assert.equal(slip.ded[0].amount,5875);assert.equal(warnings.length,0);
});
test('column lines are joined geometrically without losing the monetary cell',()=>{
  const lines=[{text:'Salario base',x:10,y:20,w:100,h:20,page:1},{text:'1.000,00',x:500,y:21,w:100,h:20,page:1},{text:'Líquido a percibir',x:10,y:80,w:200,h:20,page:1},{text:'900,00',x:500,y:81,w:100,h:20,page:1}];
  assert.equal(ocrRows(lines)[0],'Salario base 1.000,00');const {slip}=parsePayroll({text:'',lines},'j','Empresa','2026-11');assert.equal(slip.acc[0].amount,100000);assert.equal(slip.net,90000);
});
test('unrecognized payslip asks for review instead of inventing a net or payroll lines',()=>{
  const {slip,warnings}=parsePayroll({text:'Número 12345678 Cuenta 9876543210',lines:[]},'j','Empresa','2026-11');assert.equal(slip.net,0);assert.equal(slip.acc.length,0);assert(warnings.length>=2);
});

test('payroll table separates 12 accruals and 6 employee deductions from rates, bases and employer contributions',()=>{
  const {slip,warnings}=readLayout();
  assert.equal(slip.month,'2026-03');assert.equal(slip.company,'Trabajo de prueba');
  assert.equal(slip.gross,160000);assert.equal(slip.net,146000);
  assert.equal(slip.acc.length,12);assert.equal(slip.ded.length,6);
  assert.equal(slip.acc.reduce((n,x)=>n+x.amount,0),160000);assert.equal(slip.ded.reduce((n,x)=>n+x.amount,0),14000);
  assert.deepEqual(slip.ded.map(x=>x.amount),[7500,2500,200,300,3000,500]);assert.deepEqual(warnings,[]);
});

test('table recognition follows the layout at a different scale, salary and month rather than fixed sample values',()=>{
  const replacements:Record<string,string>={'1000,00':'1100,00','1.600,00':'1.700,00','1.460,00':'1.560,00','01/03/26':'01/05/27','31/03/26':'31/05/27'};
  const words=layout.map(c=>({...c,text:Object.entries(replacements).reduce((text,[from,to])=>text.replaceAll(from,to),c.text),x:c.x*2+70,y:c.y*2+35,w:c.w*2,h:c.h*2}));
  const {slip,warnings}=readLayout(words);
  assert.equal(slip.month,'2027-05');assert.equal(slip.gross,170000);assert.equal(slip.net,156000);assert.equal(slip.acc[0].amount,110000);assert.deepEqual(warnings,[]);
});

test('a missing monetary cell produces a mismatch warning and never invents the missing amount',()=>{
  const {slip,warnings}=readLayout(layout.filter(c=>c.text!=='1000,00'));
  assert.equal(slip.gross,160000);assert.equal(slip.net,146000);assert.equal(slip.acc.length,11);
  assert.equal(slip.acc[0].type,'paga_extra');assert(!slip.acc.some(x=>x.type==='base'));
  assert(warnings.some(x=>x.includes('bruto leído')));assert(warnings.some(x=>x.includes('no coincide')));
});

test('period dates with two-digit years take priority over an adjacent hiring date',()=>{
  const words=[
    {text:'F. ANTIGÜEDAD',x:10,y:10,w:90,h:10,page:1},
    {text:'PERÍODO DE LIQUIDACIÓN',x:120,y:10,w:130,h:10,page:1},
    {text:'DÍAS',x:270,y:10,w:30,h:10,page:1},
    {text:'13/09/2025',x:10,y:30,w:90,h:10,page:1},
    {text:'De 01/03/26 a 31/03/26',x:120,y:30,w:130,h:10,page:1}
  ];
  assert.equal(readLayout(words).slip.month,'2026-03');
});

test('OCR decimal separators are normalized without recording percentages or employer footer as payroll lines',()=>{
  const text='EMPRESA: Prueba local\nNómina abril 2027\nSalario base 1.000.00\nContingencias comunes 4,70 % 47,00\nTOTAL DEVENGADO 1,000.00\nLÍQUIDO A PERCIBIR 953,00\nDETERMINACIÓN DE LAS BASES DE COTIZACIÓN\nContingencias comunes 1.000,00 23,60 % 236,00';
  const {slip,warnings}=parsePayroll({text,lines:[]},'j','Original','2026-11');
  assert.equal(slip.gross,100000);assert.equal(slip.acc[0].amount,100000);assert.equal(slip.ded.length,1);assert.equal(slip.ded[0].amount,4700);assert.deepEqual(warnings,[]);
});
