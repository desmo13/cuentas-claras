# Preparar y continuar

Entorno base: Windows x64, Node 24.9.0, Java 21, Expo SDK 55, React 19.2 y
React Native 0.83.10. Dependencias fijadas en `package-lock.json`.
No actualices toda la pila por una petición de interfaz.

## Instalación

`powershell -ExecutionPolicy Bypass -File scripts/setup.ps1` reutiliza herramientas
válidas o descarga Node, JDK y Android Command-Line Tools oficiales en `.tools/`,
sin cambios globales. Instala dependencias con `npm ci` y comprueba el código.
Node debe ser >=22.18. Se necesita Java 21.

Android: plataforma y build-tools 36, NDK 27.1.12297006, CMake 3.22.1,
platform-tools, emulator y `system-images;android-35;default;x86_64`.
Ninja 1.13.2 se instala solo en el SDK local del proyecto para las rutas largas
que genera React Native en Windows.

Las licencias pendientes se muestran con `sdkmanager --licenses` para que las
revise el usuario. No hace falta repetirlas en un SDK que ya las tenga.
El script no cambia la virtualización de Windows. Si falta, informa del requisito.

Para herramientas existentes: `setup.ps1 -SdkPath 'ruta SDK' -JavaPath 'ruta JDK21'`.
Se guardan en `.tools/environment.json`, ignorado por Git. `scripts/node.ps1`
encuentra Node local y acepta argumentos de npm, por ejemplo `run check` o `ci`.

Solo lógica: con Node instalado, `npm ci` y `npm run check` no necesitan Android.
Los scripts de APK y emulación están preparados para Windows x64; macOS/Linux
necesitarían adaptar ese paso con sus herramientas Android.

## Compilar y probar

`npm run apk` actualiza el proyecto nativo desde `app.json`, conserva la firma
de pruebas en `.tools/signing/` y genera release para arm64-v8a, armeabi-v7a y
x86_64. Es autónoma, no necesita Metro. Gradle se fija a 8.14.3 porque el plugin
Foojay de esta versión de React Native no admite Gradle 9. Para SDK con espacios
se monta una unidad temporal `subst` y se restaura al terminar.
Opcionalmente `CUENTAS_GRADLE_HOME` permite reutilizar una caché Gradle existente;
si no se define, la caché queda en `.tools/gradle`.

`npm run emulator` usa un AVD propio `CuentasClarasCompartida`, en `.tools/avd/`.
Elige puerto libre y guarda serial en `.tools/emulator.json`. No selecciona un
teléfono conectado ni borra datos. Instala con `adb install -r`. Reutiliza solo
ese AVD. Sin ventana: `powershell -ExecutionPolicy Bypass -File scripts/emulator.ps1 -Headless`.

`npm run smoke` verifica el nombre AVD antes de actuar. Reabre sin borrar datos,
comprueba elementos de pantalla y guarda XML, captura y log en `output/smoke/`.
No sustituye las pruebas del recorrido modificado de `PRUEBAS.md`.

La firma local es necesaria para actualizar una APK ya instalada. Conserva una
copia privada antes de cambiar de equipo o regenerar Android a mano. No subas
claves a GitHub. Una firma de pruebas no sustituye una firma de tienda.

## Código y datos

`App.tsx` carga SQLite y serializa los guardados. Estado en una fila JSON de
`cuentas-claras.db`, esquema 2, WAL y synchronous=FULL. `src/initial.ts` devuelve
estado vacío solo cuando no hay datos guardados. `src/backup.ts` valida las copias.
Lee `AGENTS.md` para el mapa de archivos y reglas de negocio.

Clasificación de gastos por reglas y memoria local. Nóminas con módulo nativo
Kotlin ML Kit: hasta cuatro páginas PDF, texto y geometría. `src/payroll.ts`
propone el desglose que revisa el usuario, sin crear ingresos automáticamente.
`tests/fixtures/payroll-columns.json` es una tabla creada con datos ficticios.

## GitHub

Con ZIP se puede empezar sin Git. Para subir mejoras, Codex puede clonar con Git
y usar la conexión de GitHub cuando el usuario lo pida. Revisa los archivos antes
de publicar: no incluyas datos privados ni `.tools/`. Actions ejecuta `npm ci` y
`npm run check`. APK y pruebas visuales se hacen localmente con estos scripts.

Fuentes oficiales: [Node](https://nodejs.org/en/download),
[Temurin](https://adoptium.net/temurin/releases/?version=21),
[Android](https://developer.android.com/studio#command-tools),
[sdkmanager](https://developer.android.com/tools/sdkmanager),
[emulador](https://developer.android.com/studio/run/emulator-commandline),
[Ninja](https://github.com/ninja-build/ninja/releases).
