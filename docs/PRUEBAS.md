# Qué comprobar al cambiar la app

Primero `npm run check`, después compila, instala y recorre la parte modificada
con datos inventados. TypeScript no sustituye una prueba en Android.

- Instalación vacía: resumen pendiente, sin cuentas ajenas. Crear cuenta y trabajo,
  cerrar y reabrir sin perderlos.
- Cuenta con 100 €, inversión de 250 € y gasto de 7,40 €: saldo 342,60 €.
  Editar y borrar debe cuadrar los saldos sin duplicados.
- Primer salario elige cuenta, siguiente la recuerda, Cuentas permite cambiarla.
  Inversiones preguntan siempre y gastos recuerdan su última cuenta.
- Sueldo asignado manualmente al mes siguiente: presupuesto usa ese mes, saldo
  usa fecha real. Patrón de fechas solo tras tres ejemplos por tipo y trabajo.
- Ahorro fijo del primario y todo el secundario desde Resumen; cambiar la regla
  no altera cobros guardados. Sin sueldos del mes, valores previstos `—`.
- Meta con plazo y aportación parcial: reserva correcta sin descontar dos veces;
  avisos de insuficiencia y metas pausadas/completadas excluidas.
- PayPal con plazos distintos: pagar uno y reabrir sin duplicar, impedir tercer
  pago y conservar cargos al borrar el plan.
- Gastos: teclado, selectores alineados, categoría editable, pantallas pequeñas
  y navegación por todas las pestañas.
- Nómina PDF/foto ficticia: revisar bruto, neto y líneas; mantener nombre del
  trabajo, guardar y reabrir sin crear ingreso automáticamente.
- Exportar/restaurar JSON en instalación de prueba y comparar. Copias reales
  siempre fuera de Git.

El smoke automatizado comprueba arranque, reabrir y elementos básicos de pantalla
y detecta errores fatales; no cubre todos los recorridos anteriores.
