# TODO · wakeline

Generado a mano desde Wakeline. Solo incluye tarjetas abiertas.

## Tareas
- [ ] Configurar la firma gratuita para futuras actualizaciones automáticas _(Distribución · posterior al lanzamiento manual)_
  - Hecho cuando: tauri.conf.json contiene una clave pública válida y Actions tiene configurados los secretos de firma por el responsable; ninguna clave privada se guarda en el repositorio.
- [ ] Publicar un release verificable y trazable _(Distribución Windows y Linux)_
  - Hecho cuando: la etiqueta apunta al código verificado y GitHub Releases publica ZIP Windows y AppImage/DEB Linux con sumas SHA-256; los artefactos coinciden con ese commit. La firma Tauri y latest.json son requisitos de una futura actualización automática, no de estos paquetes manuales.
- [ ] Verificar la actualización manual y la conservación de datos _(ZIP, AppImage y DEB)_
  - Hecho cuando: una versión anterior se reemplaza con la nueva siguiendo RELEASE.md, mantiene carpetas y decisiones, el ZIP nunca lanza MSI y el DEB usa el gestor de paquetes. La aplicación identifica la versión actual y dirige a las descargas.
- [ ] Validar Linux en escritorios reales _(Ubuntu 22.04+ y Debian 12+)_
  - Hecho cuando: selector de carpetas, vigilancia, MCP, GitHub, copia, notificaciones y cierre se prueban en escritorios reales X11/Wayland. El arranque X11 de CI es una prueba de humo, no sustituye esta validación.
- [ ] Medir el reposo de la aplicación completa _(Paso 8 · Rendimiento)_
  - Hecho cuando: se registran CPU y RAM reproducibles con la ventana abierta y minimizada, incluyendo el desglose de WebView2; se documenta el alcance del presupuesto de CPU < 1 % y RAM < 100 MB y se resuelven o documentan las desviaciones.
- [ ] Completar el piloto de Contastack _(Criterio de publicación 0.1)_
  - Hecho cuando: hay dos semanas de uso diario registradas con menos del 20 % de tarjetas descartadas y los problemas detectados quedan corregidos o documentados antes de publicar la 0.1.

## Ideas
- [ ] Preparar distribución para macOS _(Solicitud de plataformas · después de Windows y Linux)_
  - Hecho cuando: existe runner macOS, DMG descargable y verificación de instalación y actualización propia de la plataforma.

