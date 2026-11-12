# Abastecimiento · Flujo actual y propuesta

## Etapa 1: generación de orden de compra (flujo actual)

El relevamiento actual alcanza la generación de una **sugerencia de compra en Excel**. Los pasos posteriores hasta la orden de compra todavía están pendientes de documentar.

```mermaid
flowchart LR
    subgraph FUENTES[Fuentes de datos consultadas]
        RH[Recepciones históricas]
        RE[Recepciones]
        ST[Maestro de stock]
        MA[Maestro de materiales]
        PR[Maestro de proveedores]
    end
    DB[Databricks: consulta y recuperación de datos]
    RH --> DB
    RE --> DB
    ST --> DB
    MA --> DB
    PR --> DB

    subgraph REGLAS[Reglas mantenidas en Excel]
        RP[Reglas de proveedores]
        RS[Reglas de SKU]
    end
    subgraph CALCULO[Procesamiento y cálculo]
        NB[Notebook de Python: combina datos y reglas]
        MOD[Modelo matemático: cálculo de sugerencia]
        NB --> MOD
    end
    DB --> NB
    RP --> NB
    RS --> NB
    MOD --> EX[Excel: sugerencia de compra]
```

El notebook de Python está conectado a Databricks para recuperar la información. El modelo matemático se representa como un paso lógico aplicado mediante el notebook, no como un sistema independiente. No se especifican el origen físico de las fuentes ni las fórmulas o el contenido de las reglas.

## Etapa 1: generación de sugerencia (flujo propuesto)

La propuesta mantiene el procesamiento existente para generar la sugerencia. En cada ejecución, el modelo obtiene las reglas de proveedores y materiales mediante **Abastecimiento API**; el servicio las consulta en una base SQL y las devuelve al modelo. En paralelo, el modelo recibe de Databricks las recepciones históricas, las recepciones y el maestro de stock. Con esos datos y reglas calcula la sugerencia de compra. El flujo termina en la sugerencia; los pasos posteriores aún no están definidos.

```mermaid
flowchart LR
    subgraph DATABRICKS[Datos recuperados de Databricks]
        RH[Recepciones históricas]
        RE[Recepciones]
        ST[Maestro de stock]
    end
    MOD[Modelo de abastecimiento]
    ABA[Abastecimiento API]
    SQL[(Base SQL\nReglas de proveedores y materiales)]
    SUG[Sugerencia de compra]

    RH --> MOD
    RE --> MOD
    ST --> MOD
    MOD -->|Solicita reglas en cada ejecución| ABA
    ABA -->|Consulta| SQL
    SQL -->|Reglas| ABA
    ABA -->|Devuelve reglas| MOD
    MOD -->|Calcula| SUG
```

La continuación desde la sugerencia hasta la generación de la orden de compra todavía está pendiente de relevar.

## Etapa 2: facturación en SAP

La orden de compra llega a SAP de forma indirecta: la API de sugerencia la envía a la API de abastecimiento, que crea la ASN en SCE/WMS. La integración de almacenes escucha los eventos de la ASN y los publica en SAP a través de SAP PO: alta de la OC (Tipo 1) al crearse la ASN y recepción (Tipo 2) al verificarse.

```mermaid
flowchart LR
    SUG[API de sugerencia] -->|OC| ABA[API de abastecimiento]
    ABA -->|OC| WMS[SCE / WMS: crea la ASN]
    WMS -->|Evento ASN creada / verificada| SUS[Suscriptor de novedades]
    SUS -->|Guarda| BD[(Base de novedades)]
    SUS --> PUB[Publicador de novedades]
    PUB -->|Lee y actualiza| BD
    PUB -->|Pide URL y credenciales| CFG[API de configuración]
    PUB -->|Tipo 1 / Tipo 2| PO[SAP PO]
    PO --> SAP[SAP]
```

API de SAP PO (URL, request y validaciones), reglas del publicador y propuesta de envío directo desde la API de sugerencia: [Facturación en SAP](facturacion-sap.md). Detalle de cada bloque: [Componentes de la etapa 2](facturacion-sap-componentes.md).

## Etapa 3: manejo de maestros

Pendiente de relevar y pulir; la propuesta deberá presentarse a gerencia.
