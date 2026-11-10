# Mensaje para empezar

Abre la carpeta descargada como proyecto en Codex y pega este mensaje:

> Quiero continuar esta app de gastos. No soy desarrollador: te diré los cambios
> con mis palabras y quiero que tú los implementes y pruebes. Lee primero
> AGENTS.md, README.md y docs/DESARROLLO.md. Revisa qué herramientas hay e instala
> lo necesario desde las fuentes oficiales, ejecuta las comprobaciones, genera
> la APK y abre la app en un emulador Android para enseñarme cómo está ahora.
> Conserva mis datos y usa datos inventados para las pruebas. No des por hecha
> una comprobación que no has podido ejecutar. Explícame lo necesario en español
> sencillo y pregúntame solo si falta una decisión importante. Después seguiré
> pidiéndote mejoras por este chat.

En siguientes chats puedes escribir, por ejemplo:

> En gastos quiero un filtro por cuenta. Añádelo, compruébalo y enséñamelo en el emulador.

`AGENTS.md` aporta instrucciones del proyecto al trabajar desde esta carpeta,
según la [documentación oficial de Codex](https://developers.openai.com/codex/guides/agents-md/).
El mensaje expresa lo que quieres hacer en la primera sesión.

## Si traes mejoras de la versión antigua en HTML y JavaScript

Adjunta el HTML actualizado y sus archivos JS/CSS, o indica a Codex la carpeta
donde los has guardado. Si tienes el HTML de antes de los cambios, inclúyelo
también para facilitar la comparación. Después pega:

> Mi compañero ha seguido mejorando la versión antigua en HTML y JavaScript con
> Claude Code. Quiero incorporar esas mejoras a la app Android actual de este
> repositorio. Lee AGENTS.md y docs/TRASPASAR_MEJORAS_HTML.md. Compara los archivos
> que te paso con esta app; si también tienes la versión HTML anterior, úsala
> para identificar qué cambió. Adapta las mejoras a React Native conservando las
> funciones actuales, mis datos y la fluidez. Dime brevemente qué ya existe y qué
> vas a añadir, y hazlo. Pregunta solo si falta un archivo o una decisión importante.
> Comprueba las funciones afectadas, genera la APK y enséñame las mejoras en el
> emulador. Explícamelo en español sencillo. Mantén los archivos de referencia y
> los datos personales fuera del repositorio público.

Guía del proceso: [traspasar mejoras del HTML](docs/TRASPASAR_MEJORAS_HTML.md).
