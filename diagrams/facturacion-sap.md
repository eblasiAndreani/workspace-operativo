# Etapa 2 · Facturación en SAP

Cómo llega hoy la orden de compra (OC) a SAP, cómo se llama a la API de SAP PO y qué cambia si la API de sugerencia la envía directo. El detalle de cada bloque de los diagramas está en [Componentes](facturacion-sap-componentes.md).

Documento público: la URL de SAP PO aparece con variables y no se incluyen credenciales ni datos de clientes; los valores reales viven en la configuración y en los secretos de cada API.

## Flujo actual

`API de sugerencia → API de abastecimiento → SCE/WMS crea la ASN → evento de ASN → suscriptor → publicador → SAP PO → SAP`

| Evento de la ASN | Mensaje a SAP | Qué registra |
| --- | --- | --- |
| Creada | `Tipo = 1` | Alta de la OC |
| Verificada | `Tipo = 2` | Recepción de la mercadería |

```mermaid
sequenceDiagram
    participant SUG as API de sugerencia
    participant ABA as API de abastecimiento
    participant WMS as SCE / WMS
    participant SUS as Suscriptor de novedades
    participant BD as Base de novedades
    participant PUB as Publicador de novedades
    participant CFG as API de configuración
    participant SAP as SAP PO → SAP

    SUG->>ABA: OC
    ABA-->>SUG: 202 Accepted
    ABA->>WMS: Crea la ASN
    WMS-)SUS: Evento ASN creada / verificada
    SUS->>BD: Guarda la novedad (PENDIENTE)
    SUS->>CFG: Pide el publicador (evento + propietario)
    SUS->>PUB: Publica la novedad (id)
    PUB->>BD: Lee la novedad
    PUB->>CFG: Pide URL y credenciales de SAP
    PUB->>SAP: POST Tipo 1 o Tipo 2
    SAP-->>PUB: IsOk, Mensaje, OrdenCompraSAP, TransactionIdSAP
    PUB->>BD: Guarda ACEPTADO + respuesta
    PUB-->>SUS: 200 o 502
    SUS->>BD: Actualiza estado y motivo
```

### Qué hace el publicador

1. Lee la novedad que guardó el suscriptor.
2. Arma el mensaje (ver tabla). El `Tipo` sale del evento: creada = 1, verificada = 2.
3. Si la OC es nota de crédito (contrato con prefijo DV), la marca RECHAZADO y no la envía.
4. Si la novedad ya está ACEPTADO, devuelve la respuesta guardada sin reenviar.
5. Pide a la API de configuración la URL y las credenciales de SAP (hasta 3 intentos).
6. Envía el `POST` a SAP PO.
7. Si SAP no responde 2xx, corta y devuelve 502 con el mensaje de SAP.
8. Si responde 2xx, guarda ACEPTADO con `OrdenCompraSAP` y `TransactionIdSAP`. No valida `IsOk`: una respuesta con `IsOk = "FALSE"` también queda ACEPTADO.

## API de SAP PO

Interfaz REST de SAP PO para el alta de la OC (Tipo 1) y la recepción de la mercadería (Tipo 2). Es la que llama hoy el publicador y la que llamaría la API de sugerencia.

### URL y headers

```text
POST http://<host-sap-po>:50000/RESTAdapter/<interfaz-alta-oc>
```

| Parte | Detalle |
| --- | --- |
| `<host-sap-po>` | Host de SAP PO de cada ambiente (desarrollo, QA y producción). Red interna, HTTP, puerto 50000. |
| `<interfaz-alta-oc>` | Interfaz de alta de OC y recepción: la misma en todos los ambientes y para Tipo 1 y Tipo 2. |
| `Authorization` | `Basic` con usuario y contraseña del usuario técnico de SAP PO. Sin token ni OAuth. |
| `Content-Type` | `application/json; charset=utf-8`. El contrato también acepta `text/json` y `text/plain`. |
| `Cookie` | Opcional: cookie de balanceo de SAP PO. |

Los valores reales de cada ambiente no se copian acá. Hoy el publicador los pide a la API de configuración (por propietario + evento) y, si falta alguno, usa su propia configuración:

| Valor | API de configuración | Configuración del publicador |
| --- | --- | --- |
| URL | `Url` | `ExternalApi:SapUrl` |
| Usuario | `ClientId` | `ExternalApi:SapClientId` |
| Contraseña | `ClientSecret` | `ExternalApi:SapClientSecret` |
| Cookie | `UrlToken` | `ExternalApi:SapCookie` |

### Request

Body JSON con nombres en PascalCase. Todos los campos de la tabla son obligatorios salvo `TransactionIdSAP`, y no se admiten campos adicionales.

| Campo | Contrato | Hoy (evento de ASN) | Propuesta (API de sugerencia) |
| --- | --- | --- | --- |
| `Tipo` | texto, 1 car. | Creada `1` · verificada `2` | `1` |
| `Proveedor` | texto, máx. 10 | `asnOriginalEcommerce` | Código SAP del proveedor (validar ceros) |
| `Pedido` | texto, máx. 10 | `recepcionWh` (n° de OC en SCE) | A definir (ver puntos abiertos) |
| `ASN` | texto, máx. 10 | `referenciaProveedor` | Número de ASN versionado; formato y compatibilidad por validar |
| `Fecha` | fecha `YYYY-MM-DD` | Fecha del evento | Fecha de la OC |
| `TransactionIdSAP` | texto, 1 a 10, opcional | No se envía | El recibido, solo en reintentos |
| `Items` | lista | Líneas de la ASN | Líneas de la OC |
| `Items[].Posicion` | entero | Dígitos de `lineaExterna` | N° de línea (1, 2, …) |
| `Items[].Cantidad` | texto con punto decimal | `cantEsperada` (Tipo 1) · `cantRecibida` (Tipo 2) | Cantidad pedida (validar unidad) |
| `Items[].Material` | texto, máx. 18 | `sku` con ceros a la izquierda hasta 18 | Código SAP del material, con el mismo formato |
| `Items[].Centro` | texto, máx. 10 | `codigoCliente` | Centro SAP |
| `Items[].Almacen` | texto, máx. 10 | `almacenConsumo` | Almacén SAP (validar código) |

El contrato también define `MotivoAjuste` (máx. 255) solo para ajustes de stock (Tipo 3 y 4): no se envía en el alta ni en la recepción. Hoy los ítems se agrupan por línea + material sumando cantidades; el Tipo 1 lleva todas las líneas y el Tipo 2, solo las recibidas (cantidad recibida > 0 y esperada = 0).

Ejemplo de alta (Tipo 1) con valores ficticios:

```http
POST http://<host-sap-po>:50000/RESTAdapter/<interfaz-alta-oc>
Authorization: Basic <base64 de usuario:contraseña>
Content-Type: application/json; charset=utf-8

{
  "Tipo": "1",
  "Proveedor": "123456",
  "Pedido": "1000001",
  "ASN": "A1000001",
  "Fecha": "2026-11-10",
  "Items": [
    { "Posicion": 1, "Cantidad": "12", "Material": "000000000000010000", "Centro": "C001", "Almacen": "A001" }
  ]
}
```

En un reintento se agrega `"TransactionIdSAP"` con el valor que devolvió SAP.

### Respuestas

| HTTP | Body | Cómo interpretarla |
| --- | --- | --- |
| `200` | `IsOk`, `Codigo`, `Mensaje`, `OrdenCompraSAP` (n° de OC en SAP) y `TransactionIdSAP` | Éxito solo si `IsOk = "TRUE"`; con `"FALSE"` es un error de SAP aunque el HTTP sea 200. |
| `400` | `IsOk = "FALSE"`, `Codigo` y `Mensaje` | Request inválido. |
| `401` | `IsOk = "FALSE"`, `Codigo` y `Mensaje` | Usuario o contraseña inválidos. |

Ejemplos del contrato:

```json
{ "IsOk": "TRUE", "Codigo": "200", "Mensaje": "", "OrdenCompraSAP": "3241211", "TransactionIdSAP": "00000001" }
```

```json
{ "IsOk": "FALSE", "Codigo": "01", "Mensaje": "Mensaje de Error" }
```

### Validaciones

**Del contrato.** SAP PO declara `400` para un request inválido y `401` para credenciales inválidas.

- Campos obligatorios presentes, con el tipo y el largo de la tabla; `Fecha` en `YYYY-MM-DD`.
- Sin campos adicionales, ni en la cabecera ni en los ítems.
- `TransactionIdSAP` de 1 a 10 caracteres: se omite en el primer envío y nunca va vacío.

**Antes de enviar**, recomendadas en la API de sugerencia:

- Al menos un ítem y `Posicion` única, mayor que 0.
- `Cantidad` con punto decimal y hasta 2 decimales: formato `0.##` con cultura invariante (con `es-AR` saldría coma).
- `Material` con ceros a la izquierda hasta 18, como el publicador. La API de sugerencia hoy lo envía sin ceros al WMS.
- `Fecha` en hora de Argentina: la OC se guarda en UTC y, después de las 21 h, pasaría al día siguiente.
- Controlar los largos y rechazar la OC si un valor no entra, en lugar de truncarlo.
- No reenviar una OC que SAP ya aceptó.

**Al recibir la respuesta:**

- Éxito = 2xx **y** `IsOk = "TRUE"`. El publicador hoy solo mira el HTTP.
- Leer `Codigo` y `OrdenCompraSAP` como texto: pueden llegar como número.
- Guardar `Codigo`, `Mensaje`, `OrdenCompraSAP` y `TransactionIdSAP`.

Las validaciones de negocio de SAP (proveedor, material, centro y almacén existentes, OC duplicada) y sus códigos de error están por confirmar: ver [puntos abiertos](#puntos-abiertos).

## Propuesta: envío directo desde la API de sugerencia

La **API de sugerencia de abastecimiento** gestiona toda esta secuencia: toma la **sugerencia de compra guardada en la tabla de control**, genera una orden de compra que distribuye los materiales según el almacén donde deben gestionarse y arma un **número de ASN versionado**, que debe permitir que el worker de WMS reconozca estas órdenes y no genere otra OC.

La misma API de sugerencia de abastecimiento envía la OC a SAP por SAP PO (Tipo 1), valida y guarda la respuesta. **Solo con HTTP 200 y resultado OK** llama a **Abastecimiento API para acceder a SCE**. En esta parte del flujo, **SCE únicamente genera el evento ASN creada**; no se le atribuyen recepción física ni actualización de stock. Según el contrato documentado, un HTTP 200 con `IsOk = "FALSE"` no es OK: no se continúa. Ante error o timeout, no llama a Abastecimiento API; **el tratamiento del error no está definido**. Son dos servicios distintos: la API de sugerencia de abastecimiento orquesta el flujo; Abastecimiento API recibe la llamada posterior al OK de SAP.

**Restricciones y brechas confirmadas:** una ASN rechazada no puede reutilizarse; se debe generar otra. **Del lado de SAP**, puede producirse un rechazo posterior a un HTTP 200. Actualmente **no existe un servicio de consulta para conocer el estado de la transacción SAP**, por lo que recibir el 200 no garantiza su estado final en SAP. La detección del rechazo tardío, la conciliación y la recuperación quedan pendientes de definir. Un timeout tampoco demuestra que la transacción haya sido rechazada: no se define regeneración ni reenvío automático.

SCE se muestra como destino de la llamada vía Abastecimiento API y generador del evento ASN creada. Posteriormente, al recibirse la mercadería, **se debe escuchar `EventoWh-RecepcionAsnConfirmada` y correlacionarlo por el identificador de ASN**. Ese evento confirma la recepción de mercadería; luego se debe **validar que SAP actualice el stock de los materiales de esa ASN**. Recibir el evento no acredita por sí solo la actualización en SAP.

**Hoy no existe GET de la transacción de actualización de stock en SAP.** La validación del resultado, conciliación y recuperación quedan pendientes de definir. Tampoco se define aún el componente que escuchará el evento ni el mecanismo que provoca la actualización en SAP; no se presupone que ya exista un consumidor, una consulta ni un envío Tipo 2 en este flujo propuesto.

Esto no modifica el [flujo actual](#flujo-actual). La consulta por `idTransaccion` descrita para la API de abastecimiento del flujo actual no se asume disponible para resolver las brechas de SAP. El reconocimiento de la ASN versionada por el worker es un requisito de integración, no un mecanismo ya validado.

```mermaid
sequenceDiagram
    participant CTRL as Tabla de control
    participant SUG as API de sugerencia de abastecimiento
    participant SAP as SAP PO → SAP
    participant ABA as API de abastecimiento
    participant SCE as SCE
    participant REC as Escucha de recepción (por definir)

    CTRL-->>SUG: Sugerencia de compra
    SUG->>SUG: Genera OC y distribuye materiales según almacén
    SUG->>SUG: Arma número de ASN versionado
    Note over SUG: El worker de WMS no debe generar otra OC
    SUG->>SAP: POST Tipo 1 (alta de la OC)
    SAP-->>SUG: HTTP, IsOk, OrdenCompraSAP, TransactionIdSAP
    SUG->>SUG: Guarda estado y respuesta
    alt HTTP 200 e IsOk TRUE
        SUG->>ABA: Solicita envío a SCE
        ABA->>SCE: Envía la OC / ASN versionada
        SCE->>SCE: Genera evento ASN creada
        Note over SUG,SAP: SAP puede rechazar después del 200; no hay servicio de consulta del estado SAP
        SCE-)REC: Posteriormente: EventoWh-RecepcionAsnConfirmada
        REC->>REC: Correlaciona por identificador de ASN
        Note over REC,SAP: Validar actualización del stock de materiales en SAP
        Note over REC,SAP: Hoy no hay GET de esa transacción; validación y recuperación pendientes
    else Error de SAP / IsOk FALSE / timeout
        Note over SUG: No llama a Abastecimiento API; tratamiento pendiente
    end
    Note over SUG,SCE: ASN rechazada: requiere otra nueva; recuperación sin definir
```

### Checklist de implementación

- [ ] Cliente HTTP a [SAP PO](#api-de-sap-po): `POST` JSON, Basic auth, `Cookie` opcional y timeout.
- [ ] Configuración por ambiente: URL, usuario, contraseña y cookie (secretos propios o API de configuración) y un flag para habilitar el envío.
- [ ] Tomar la sugerencia de la tabla de control y generar la OC distribuyendo los materiales según el almacén.
- [ ] Generar una ASN versionada y acordar su reconocimiento con el worker de WMS para evitar otra OC.
- [ ] Mapper OC + ASN versionada → request Tipo 1 según la [tabla](#request) y las [validaciones](#validaciones).
- [ ] Para continuar este flujo: HTTP `200` **y** `IsOk = "TRUE"`; cualquier otro caso queda como error con `Codigo` y `Mensaje`.
- [ ] Guardar por OC: estado SAP, `OrdenCompraSAP`, `TransactionIdSAP`, mensaje y fecha.
- [ ] Definir política de reintentos y correlación con `TransactionIdSAP`, OC y nueva ASN; no asumir que se puede reutilizar una ASN rechazada.
- [ ] Definir tratamiento de errores y timeouts antes de automatizar reenvíos: no existe hoy consulta del estado de la transacción SAP.
- [ ] Llamar a Abastecimiento API para el envío a SCE solo después del OK de SAP; SCE genera el evento ASN creada.
- [ ] Registrar errores y definir recuperación si SAP acepta la OC pero falla Abastecimiento API.
- [ ] Definir el consumidor de `EventoWh-RecepcionAsnConfirmada` y correlacionar la recepción con la ASN versionada y la OC.
- [ ] Definir cómo validar la actualización del stock de materiales en SAP: hoy no existe GET de esa transacción.
- [ ] Tests: reparto de materiales, ASN versionada, mapper, validaciones, respuesta OK, `IsOk = "FALSE"`, 400/401, timeout y no invocar Abastecimiento API sin OK de SAP.

### Puntos abiertos

- **Distribución por almacén**: reglas de asignación de materiales y si se genera una OC por almacén o se separan sus líneas.
- **ASN versionada**: formato, longitud, generación de versiones y cómo la reconoce el worker de WMS para no generar otra OC.
- **ASN rechazada**: debe generarse otra; definir cuándo, quién lo hace, cómo se correlaciona y cómo se evita duplicar una OC.
- **Rechazo en SAP posterior al 200**: hoy no existe servicio de consulta del estado de la transacción SAP. Definir detección, conciliación y recuperación; el 200 no garantiza el estado final en SAP.
- **Salida de error**: tratamiento pendiente, incluyendo rechazo explícito, errores técnicos y timeout; no se documenta un reintento automático como solución ya acordada.
- **Pedido**: qué número enviar y cómo correlacionarlo con la OC, la ASN versionada y cualquier recepción posterior.
- **Duplicados**: validar el reconocimiento de la ASN versionada y la idempotencia de los envíos.
- **Cantidad**: la API envía bultos al WMS y el publicador no convierte por caja; confirmar si SAP espera bultos o unidades.
- **Proveedor y ASN**: formato del proveedor y compatibilidad de la ASN versionada con el contrato de SAP PO.
- **Largos**: los ejemplos del contrato para `Proveedor`, `Pedido` y `ASN` tienen 12 caracteres, pero el máximo declarado es 10.
- **Validaciones de SAP**: qué controla SAP (proveedor, material, centro, almacén, OC duplicada) y con qué `Codigo` responde cada caso.
- **Reintento sin respuesta**: si reenviar un envío que quedó sin respuesta (timeout) puede duplicar la OC en SAP.
- **Envío a SCE**: endpoint, request y respuesta de Abastecimiento API.
- **Recepción confirmada**: consumidor, contrato y campo del identificador de ASN en `EventoWh-RecepcionAsnConfirmada`; manejo de eventos duplicados y correlación con versiones de ASN.
- **Stock en SAP**: mecanismo de actualización y validación de los materiales recibidos; hoy no existe GET de la transacción. Definir conciliación y recuperación sin asumir actualización exitosa por recibir el evento.
- **Falla posterior a SAP**: cómo recuperar el envío a SCE si SAP ya aceptó la OC pero falla Abastecimiento API.
- **Tipo 2**: mecanismo por definir para la propuesta; no se mantiene como supuesto el circuito anterior de almacenes.
- **Accesos**: usuario técnico de SAP PO y acceso de red desde la API de sugerencia.
