# Instrucciones para Codex — Cuentas claras

Lee este archivo antes de trabajar. Es el contexto persistente del proyecto;
las peticiones del usuario y las instrucciones de tu entorno tienen prioridad.

## Cómo colaborar

- Habla en español sencillo. La persona que pide cambios no es desarrolladora.
- Convierte lo que explique en cambios terminados, compruébalos y enséñale el resultado.
  No le pidas código ni comandos que puedas ejecutar tú.
- Pregunta solo cuando falte una decisión importante. Resuelve los detalles habituales.
- Si solicita ponerlo en marcha, sigue `docs/DESARROLLO.md`. No presupongas que
  tiene Node, Java, Android Studio ni emulador. Instala lo necesario desde fuentes
  oficiales dentro de los permisos disponibles.
- Distingue pruebas de funciones, compilación y comprobación visual en Android.
  No afirmes que has probado una APK si solo ejecutaste pruebas automáticas.
- Mantén estas instrucciones y la documentación al cambiar el proceso.

## Qué estás continuando

App Android nativa React Native + Expo + TypeScript, versión inicial 1.2.1.
No es una web. No usa Claude, servidor, banco conectado ni claves API.
El lector de nóminas funciona localmente con un módulo Kotlin y ML Kit.
Expo Go no incluye ese módulo: genera e instala la APK para comprobarlo.

La copia compartida empieza vacía y usa `es.cuentasclaras.app` para coexistir con
la instalación personal anterior. No cambies ese identificador tras distribuirla.
No recuperes ni inventes datos del autor original.

## Preparar y comprobar

1. Lee `README.md`, `docs/DESARROLLO.md`, `package.json` y el estado de Git.
2. Windows: `powershell -ExecutionPolicy Bypass -File scripts/setup.ps1`.
   Reutiliza herramientas válidas o descarga las locales si faltan.
3. `npm run check`: TypeScript y pruebas de dinero, copias, salarios, metas,
   PayPal y nóminas. Mantén `package-lock.json`.
4. `npm run apk`: APK autónoma en `output/Cuentas-Claras.apk`.
5. `npm run emulator`: crea/abre el emulador de este proyecto e instala la APK.
6. `npm run smoke`: comprueba arranque y reabrir, deja XML, captura y log
   en `output/smoke/`.
7. Para cambios de interfaz, inspecciona capturas y prueba el recorrido afectado
   en Android; el smoke no lo sustituye. Lee `docs/PRUEBAS.md`.

La preparación descarga varios GB y la primera compilación tarda. Usa sesiones
consultables y da avances breves. Si no se puede emular, explica el bloqueo
concreto y ofrece la APK; no presentes la emulación como verificada.

## Reglas de datos y comportamiento

- Dinero en céntimos enteros. Saldo = apertura + ingresos − gastos y pagos.
  Editar o borrar revierte exactamente una vez el efecto del movimiento.
- SQLite guarda antes de confirmar la interfaz. Conserva el esquema 2 de copias
  JSON y compatibilidad con formatos anteriores.
- El primer sueldo pregunta cuenta y recuerda esa preferencia global, editable
  en Cuentas. Cada inversión elige cuenta; gastos recuerdan la última.
- El mes de presupuesto del sueldo es distinto de la fecha real del ingreso.
  Siempre se puede escoger manualmente. Aprende por trabajo y salario primario /
  secundario tras tres ingresos etiquetados; no impongas el día 28.
- Resumen muestra presupuesto pendiente hasta que haya sueldo del mes.
  Saldos y movimientos reales siguen visibles.
- Ahorro por trabajo se configura en Resumen, separando ambos salarios:
  general, fijo, porcentaje o todo. Cada cobro conserva su regla; cambiar el
  predeterminado no modifica ingresos pasados.
- Metas activas con fecha reservan su cuota antes de calcular gasto libre.
  No restes dos veces las aportaciones del mes.
- Compras PayPal tiene exactamente dos plazos con fechas e importes propios;
  un pago por plazo, sin duplicados ni tercer plazo recurrente. No cambies el
  importe de uno pagado sin deshacerlo. Borrar el plan conserva sus cargos reales.
- Nóminas se revisan y corrigen antes de guardar. No añaden ingresos por sí
  solas. La empresa mostrada es el nombre del trabajo del usuario.

## Mapa del código

- `src/model.ts`: tipos, dinero, movimientos y deudas; `src/storage.ts`: SQLite.
- `src/budget.ts`: presupuesto y metas; `src/salaries.ts`: meses y ahorro.
- `src/screens.tsx`, `src/actions.ts`, `src/ui.tsx`: pantallas y formularios.
- `src/BudgetPlanner.tsx`: deslizador; `src/backup.ts`: copias y migraciones.
- `src/payroll.ts`, `src/PayrollEditor.tsx`: lector y revisión de nóminas.
- `modules/payroll-ocr/`: módulo nativo Kotlin; `tests/`: casos reproducibles.

## Entregar cambios

- Conserva los datos del usuario. No desinstales, borres SQLite ni uses
  `adb ... clear` / `-wipe-data` para arreglar una instalación real. Prueba con
  datos inventados en el emulador reservado para este proyecto.
- No subas nóminas reales, capturas de saldos, copias de usuario, credenciales,
  SDK, dependencias, cachés ni claves de firma. Los ejemplos son ficticios.
- La firma de pruebas se guarda en `.tools/signing/`, fuera de Git. Conserva
  esa clave y una copia privada para actualizar APK ya instaladas.
- Si cambia la app, incrementa versión y versionCode en `app.json` y sincroniza
  versión en `package.json` y lock. No subas el proyecto Android generado.
- Explica qué cambió, qué comprobaste y dónde está la APK. Publica cambios en
  GitHub cuando lo pida el usuario, sin forzar ramas ni sobrescribir trabajo ajeno.
