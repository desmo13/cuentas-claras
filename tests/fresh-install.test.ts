import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../src/initial.ts';
import {validateState} from '../src/backup.ts';
test('una instalación nueva no contiene datos financieros ni preferencias de otra persona',()=>{
  const s=validateState(initialState());
  for(const field of ['accounts','transactions','jobs','fixed','goals','debts','sweeps','payslips'] as const) assert.deepEqual(s[field],[]);
  assert.equal(s.preferences.salaryAccountId,null);assert.equal(s.preferences.expenseAccountId,null);
  assert.deepEqual(s.categoryMemory,{});
  const other=initialState();s.accounts.push({id:'prueba',name:'Prueba',opening:0,archived:false});
  assert.deepEqual(other.accounts,[]);
});
