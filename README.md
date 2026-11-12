# Workspace operativo

Espacio público para organizar diagramas, indicadores de pedidos y proyectos, y guías de trabajo y automatización.

## Contenido

- [Diagrama de abastecimiento WOS + Modelo YAS](diagrams/abastecimiento-wos-yas.md)
- [Flujo actual y propuesta de abastecimiento](diagrams/abastecimiento-actual.md): flujo actual hasta la sugerencia de compra y propuesta donde el modelo lee proveedores y materiales directamente de SQL, combina los datos de Databricks y escribe la sugerencia en la tabla de control de la misma base; también documenta la publicación de la orden de compra en SAP.
- [Facturación en SAP](diagrams/facturacion-sap.md): circuito actual de la orden de compra hacia SAP, API de SAP PO (URL, request y validaciones) y propuesta de envío directo desde la API de sugerencia.
- [Componentes de facturación en SAP](diagrams/facturacion-sap-componentes.md): qué hace, recibe y devuelve cada bloque de los diagramas de la etapa 2.
- [Guía para trabajar con agentes](playbooks/trabajo-con-agentes.md)
- `projects/`: planes y documentación de proyectos.
- `indicators/`: definiciones, consultas y documentación de indicadores. Mantener los datos de negocio en ubicaciones autorizadas y compartir aquí solo lo necesario.

## Seguridad de credenciales y datos

No guardar contraseñas, tokens, claves privadas, cadenas de conexión ni credenciales reales en el repositorio, issues, diagramas o historial de Git, aunque sea privado. Para consultas, usar el gestor de secretos aprobado por la organización o secretos del entorno de ejecución; documentar aquí solo los nombres de las variables requeridas y cómo obtener acceso. No incluir datos personales o exportaciones de producción sin autorización.

Si una credencial se publica por error, revocarla/rotarla de inmediato y seguir el proceso interno de respuesta; borrar el archivo no elimina el secreto del historial.

## Publicación

El repositorio es público: todo su contenido e historial es visible para cualquiera. GitHub Pages publica el sitio desde `site/`; no agregues allí ni al repositorio información confidencial, credenciales ni datos personales. La página permite navegar entre flujos y etapas. En la etapa 2, los bloques marcados con ↗ abren su detalle de `diagrams/` en una pestaña nueva (los enlaces apuntan a `main`); los demás bloques todavía no tienen documentación propia. No hay panel de información ni edición de notas. Las notas guardadas anteriormente en el navegador no se borran.

- [Abrir el diagrama interactivo](https://eblasiandreani.github.io/workspace-operativo/)
- Los cambios en `site/` se publican automáticamente desde la rama `main` mediante GitHub Actions.
- El flujo actual y su propuesta editable están en [`diagrams/abastecimiento-actual.md`](diagrams/abastecimiento-actual.md). El diagrama anterior WOS + YAS se conserva como referencia y no representa el flujo actual relevado.
