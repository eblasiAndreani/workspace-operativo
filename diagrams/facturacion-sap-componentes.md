# Etapa 2 · Componentes

Qué hace, recibe y devuelve cada bloque de los diagramas de [Facturación en SAP](facturacion-sap.md). Documento público: sin URLs reales, credenciales ni datos de clientes.

## API de sugerencia

- **Rol:** genera las OC confirmadas en el front, les asigna número y las envía a la API de abastecimiento.
- **Envía:** un `POST` por OC con número, fecha (UTC), propietario, centro SAP, proveedor (código sin ceros y razón social) y una línea por artículo con bultos enteros, almacén del WMS y código SAP del material sin ceros.
- **Recibe:** `202` con un `idTransaccion`; con ese id consulta después el resultado (Pendiente, Aceptado o Rechazado con motivo).
- **Guarda:** cada OC con su usuario, la solicitud enviada, el `idTransaccion` y el estado (`PENDIENTE`, `ENVIADA` o `ERROR`). Si una OC falla, las demás se envían igual.
- **En la propuesta:** la **API de sugerencia de abastecimiento** es responsable de toda la secuencia: lee la sugerencia de la tabla de control, genera la OC distribuyendo los materiales según almacén y arma una ASN versionada para que el worker de WMS no genere otra OC. Envía el Tipo 1 a SAP PO, valida y guarda la respuesta y solo con HTTP 200 e `IsOk = "TRUE"` llama al servicio distinto **Abastecimiento API** para recepción y actualización de stock ([detalle](facturacion-sap.md#propuesta-envío-directo-desde-la-api-de-sugerencia)).

## API de abastecimiento

- **Rol:** API de almacenes que recibe la OC y crea la ASN de recepción en SCE/WMS.
- **Responde:** `202` con un `idTransaccion`; la ASN se crea de forma asíncrona.
- **Consulta:** el resultado por `idTransaccion` (Pendiente, Aceptado o Rechazado con motivo).
- **Errores:** `{ title, detail, errors: [{ field, message }] }`.
- **En la propuesta:** se llama después del OK de SAP para gestionar recepción y actualización de stock en SCE. El contrato de esa operación está pendiente; no se asume que mantenga el `202`, el mismo request ni la consulta por `idTransaccion` del flujo actual. Hoy no existe servicio de consulta del estado de la transacción de este nuevo flujo; un rechazo posterior al 200 no tiene detección ni recuperación definidas.

## SCE / WMS

- **Rol:** sistema de almacén donde vive la ASN con la que se recibe la mercadería.
- **Crea** la ASN con las líneas de la OC y la **verifica** cuando llega la mercadería.
- **Emite** un [evento de ASN](#evento-de-asn) en cada paso.
- **En la propuesta:** SCE es el destino de recepción y actualización de stock vía Abastecimiento API, solo después del OK de SAP; el circuito de eventos permanece fuera del diagrama. La ASN versionada debe permitir que el worker de WMS no genere otra OC. Una ASN rechazada no se reutiliza: requiere otra nueva; generación, correlación y recuperación pendientes de definir.

## Evento de ASN

- **Rol:** avisa a almacenes, por Kafka, cada cambio de la ASN.
- **Eventos usados:** ASN creada → Tipo 1 (alta de la OC) · ASN verificada → Tipo 2 (recepción).
- **Cabecera:** `evento`, `fechaHoraGeneracion`, `propietario`, `recepcionWh`, `referenciaProveedor`, `asnOriginalEcommerce`, `codigoCliente`, `almacen`, `instancia` y `ordenExterna`.
- **Detalle por línea:** `lineaExterna`, `sku`, `cantEsperada`, `cantRecibida`, `almacenConsumo` y `nomenclaturaContratoServicioIngreso` (prefijo DV = nota de crédito).
- **En la propuesta:** fuera del diagrama; no se define aquí la publicación Tipo 2.

## Suscriptor de novedades

- **Rol:** escucha los eventos de ASN y dispara la publicación.
- **Guarda** la novedad en la base de novedades como `PENDIENTE`.
- **Pide** a la API de configuración el publicador que corresponde (evento + propietario) y lo llama con el id de la novedad.
- **Actualiza** estado y motivo con la respuesta: si el publicador no responde 2xx, la novedad queda `RECHAZADO`.
- **En la propuesta:** fuera de esta parte del flujo.

## Publicador de novedades

- **Rol:** arma el mensaje para SAP a partir de la novedad y lo envía a SAP PO.
- **Recibe:** `POST` del suscriptor con `eventoId` (obligatorio), `almacen`, `instancia`, `evento`, `propietario` y `ordenCliente`.
- **Responde:** `200` con la novedad y la respuesta de SAP · `404` si no encuentra la novedad · `502` si falla SAP o la API de configuración · `500` ante otro error.
- **Pasos y reglas:** [qué hace el publicador](facturacion-sap.md#qué-hace-el-publicador).
- **En la propuesta:** fuera de esta parte del flujo; no se presupone su participación en el Tipo 2.

## Base de novedades

- **Rol:** registro de cada novedad de ASN y de su envío a SAP.
- **Guarda:** los datos del evento, el estado (`PENDIENTE`, `ACEPTADO` o `RECHAZADO`), el motivo, la fecha de modificación, la respuesta de SAP y el `TransactionIdSAP`.
- **Evita** reenviar a SAP una novedad que ya está `ACEPTADO`.
- **En la propuesta:** el resultado del Tipo 1 de estas OC queda en la API de sugerencia.

## API de configuración

- **Rol:** centraliza destinos y credenciales por propietario + evento.
- **Al suscriptor** le indica a qué publicador llamar.
- **Al publicador** le devuelve `Url`, `ClientId` (usuario), `ClientSecret` (contraseña) y `UrlToken` (cookie de SAP PO).
- **Fallas:** el publicador reintenta 3 veces (0,5 s × intento); si falta un valor, usa su propia configuración.
- **En la propuesta:** a definir si la API de sugerencia toma de acá los datos de SAP PO o de sus propios secretos.

## SAP PO

- **Rol:** middleware de SAP que expone la interfaz REST de alta de OC y recepción.
- **Llamada:** `POST http://<host-sap-po>:50000/RESTAdapter/<interfaz-alta-oc>` con Basic auth.
- **Contrato, ejemplo y validaciones:** [API de SAP PO](facturacion-sap.md#api-de-sap-po).

## SAP

- **Rol:** ERP donde se crea la OC (Tipo 1) y se registra la recepción de la mercadería (Tipo 2).
- **Devuelve**, vía SAP PO, el n° de OC en SAP (`OrdenCompraSAP`) y un `TransactionIdSAP` para reintentos.
- **Validaciones de negocio:** a confirmar con SAP ([puntos abiertos](facturacion-sap.md#puntos-abiertos)).
