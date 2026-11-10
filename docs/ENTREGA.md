# Verificación de esta copia

Preparada el 10 de noviembre de 2026 a partir de Cuentas claras 1.2.1 (código 6).

- Estado inicial vacío y paquete Android independiente `es.cuentasclaras.app`.
- 43 pruebas automáticas correctas y TypeScript sin errores.
- Dependencias instaladas desde el lock con `npm ci`.
- Scripts PowerShell revisados con el analizador de sintaxis de PowerShell.
- APK release compilada para arm64-v8a, armeabi-v7a y x86_64; firma v2 verificada.
- Probada en un AVD nuevo de Android 15: instalación vacía, presupuesto pendiente,
  navegación inicial, cierre y reapertura sin errores fatales.
- Creada una cuenta ficticia con 100 € y comprobado que se conserva al reabrir.

La preparación se ejecutó reutilizando JDK 21 y SDK existentes. Se comprobaron
las fuentes de descarga del JDK y Ninja y se descargó y verificó por SHA256 el
archivo oficial de Android Command-Line Tools. No se simuló un Windows sin
virtualización ni se descargaron de nuevo todos los paquetes del SDK.

Las capturas y APK de comprobación quedan en `output/` local, fuera de Git.
No se han publicado bases de datos, copias financieras, nóminas reales, referencias
del HTML anterior ni claves de firma. La tabla de nómina de pruebas es ficticia.

El smoke es una comprobación básica de arranque. La lista de `PRUEBAS.md` sirve
para seleccionar recorridos adicionales cuando se modifique una función.
