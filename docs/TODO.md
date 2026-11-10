# TODO · wakeline

Generado a mano desde Wakeline. Solo incluye tarjetas abiertas.

## Tareas
- [ ] Configurar la firma del actualizador _(Paso 9 · Distribución)_
  - Hecho cuando: tauri.conf.json contiene una clave pública válida y Actions tiene configurados los secretos de firma por el responsable; ninguna clave privada se guarda en el repositorio.
- [ ] Publicar un release firmado y trazable _(Paso 9 · Distribución)_
  - Hecho cuando: la etiqueta apunta al código verificado y GitHub Releases publica MSI/NSIS, firmas y latest.json; los artefactos coinciden con ese commit y el actualizador puede leer el release publicado.
- [ ] Verificar la actualización instalada de extremo a extremo _(Paso 9 · Actualizador)_
  - Hecho cuando: una versión anterior muestra su versión actual, detecta e instala una versión firmada nueva, reinicia correctamente, rechaza firmas inválidas y distingue ausencia de release, error de red y aplicación actualizada.
- [ ] Medir el reposo de la aplicación completa _(Paso 8 · Rendimiento)_
  - Hecho cuando: se registran CPU y RAM reproducibles con la ventana abierta y minimizada, incluyendo el desglose de WebView2; se documenta el alcance del presupuesto de CPU < 1 % y RAM < 100 MB y se resuelven o documentan las desviaciones.
- [ ] Completar el piloto de Contastack _(Criterio de publicación 0.1)_
  - Hecho cuando: hay dos semanas de uso diario registradas con menos del 20 % de tarjetas descartadas y los problemas detectados quedan corregidos o documentados antes de publicar la 0.1.

## Ideas
- [ ] Preparar distribución para macOS y Linux _(Solicitud de plataformas · después de 0.1 Windows)_
  - Hecho cuando: existen runners nativos, instaladores DMG y Linux descargables, verificación de instalación y configuración de firma/actualización propia de cada plataforma; no se anuncia soporte de una plataforma sin comprobar sus artefactos.

