import { requireOptionalNativeModule } from 'expo-modules-core';
export type OcrLine = { text: string; x: number; y: number; w: number; h: number; page: number };
export type OcrResult = { text: string; lines: OcrLine[]; words?: OcrLine[]; pagesRead: number; pageCount: number };
const native = requireOptionalNativeModule<{ read(uri: string, pdf: boolean): Promise<OcrResult> }>('PayrollOcr');
export async function readPayroll(uri: string, pdf: boolean) {
  if (!native) throw new Error('La lectura de nóminas requiere instalar la APK.');
  return native.read(uri, pdf);
}
