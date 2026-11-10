import * as SQLite from 'expo-sqlite';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { blank, type State } from './model';
import { initialState } from './initial';
import { backupJson, movementsCsv, readBackup, validateState } from './backup';
let database: SQLite.SQLiteDatabase;
export async function loadState(): Promise<State> {
  database = await SQLite.openDatabaseAsync('cuentas-claras.db');
  await database.execAsync('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);');
  const row = await database.getFirstAsync<{ value: string }>('SELECT value FROM app_state WHERE id=1');
  return row ? validateState(JSON.parse(row.value)) : validateState(initialState());
}
export async function persistState(state: State): Promise<void> {
  await database.runAsync('INSERT INTO app_state(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value', JSON.stringify(state));
}
export async function exportData(state: State, kind: 'json' | 'csv') {
  const name = kind === 'json' ? 'Cuentas-claras-copia.json' : 'Cuentas-claras-movimientos.csv';
  const file = new File(Paths.cache, name);
  file.write(kind === 'json' ? backupJson(state) : movementsCsv(state));
  if (!await Sharing.isAvailableAsync()) throw new Error('No hay una aplicación disponible para guardar o compartir este archivo.');
  await Sharing.shareAsync(file.uri, { mimeType: kind === 'json' ? 'application/json' : 'text/csv', dialogTitle: 'Guardar Cuentas claras' });
}
export async function pickBackup() {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json','text/plain','application/octet-stream'], copyToCacheDirectory: true });
  if (result.canceled) return null;
  const file = new File(result.assets[0].uri);
  if (file.size > 30 * 1024 * 1024) throw new Error('La copia supera el límite de 30 MB.');
  return readBackup(await file.text());
}
