# Cuentas claras

App de gastos para Android: cuentas, salarios, inversiones, gastos, ahorro,
metas, deudas, dos plazos PayPal y lectura local de nóminas desde foto o PDF.
Los datos se guardan en el móvil y esta copia empieza vacía.

## Quiero mejorarla con Codex

1. En [GitHub](https://github.com/desmo13/cuentas-claras), pulsa **Code → Download ZIP**.
2. Extrae el ZIP y abre la carpeta como proyecto en Codex.
3. Copia el mensaje de [EMPEZAR_CON_CODEX.md](EMPEZAR_CON_CODEX.md) en el chat.
4. Después pide los cambios con tus palabras. Codex tiene las instrucciones de
   [AGENTS.md](AGENTS.md) para preparar y probar la app.

Puedes decir «abre el emulador», «cambia esta pantalla» o «genera la APK para
mi móvil». La primera preparación necesita Internet, varios GB y algo de tiempo.
Si quieres guardar tus mejoras en tu propio GitHub, puedes usar **Fork** y abrir
tu copia en Codex. Descargar el ZIP basta para trabajar en tu ordenador.

## Mi compañero ha mejorado la versión antigua en HTML/JS

Puedes incorporar sus mejoras a esta app Android. Pásale a Codex el HTML
actualizado y los JS/CSS que lo acompañen, o la carpeta que los contiene, y usa
el segundo mensaje de [EMPEZAR_CON_CODEX.md](EMPEZAR_CON_CODEX.md).
Las instrucciones explican cómo comparar y adaptar esas mejoras conservando lo
que ya tiene la app. Consulta [la guía de traspaso](docs/TRASPASAR_MEJORAS_HTML.md).

## Preparar el entorno

En Windows 10/11 x64, desde la raíz del proyecto:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
npm run check
npm run apk
npm run emulator
npm run smoke
```

Si setup descargó Node local, usa `scripts/node.ps1` para esos comandos,
por ejemplo `powershell -ExecutionPolicy Bypass -File scripts/node.ps1 run check`.
No requiere Expo Go ni clave de IA. El emulador necesita virtualización disponible.
La APK se guarda en `output/Cuentas-Claras.apk`.

Lee [preparación y problemas habituales](docs/DESARROLLO.md),
[pruebas funcionales](docs/PRUEBAS.md) y [verificación de la entrega](docs/ENTREGA.md).
GitHub Actions comprueba el código en cada cambio.

## Datos y actualizaciones

Cada persona introduce sus cuentas y trabajos. Desde Cuentas se puede exportar
y restaurar una copia JSON. La copia compartida tiene identificador propio
`es.cuentasclaras.app` y puede convivir con la app personal anterior del autor.

No contiene saldos ni nóminas del autor. Los ejemplos de pruebas son ficticios.
Los datos de uso no se sincronizan con GitHub. La APK usa firma de pruebas cuya
clave se conserva localmente, fuera del repositorio; mantén la misma clave para
actualizar una instalación. Publicarla en Play Store requiere una firma de distribución.
