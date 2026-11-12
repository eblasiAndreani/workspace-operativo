const stageDescriptions = {
  "current-stage-1": "Un notebook de Python conectado a Databricks recupera recepciones históricas, recepciones, stock, materiales y proveedores. Combina estos datos con reglas de proveedores y SKU en Excel y aplica el modelo matemático para generar un Excel de sugerencia de compra. Falta relevar la continuación hasta la orden de compra.",
  "current-stage-2": "La orden de compra llega a SAP de forma indirecta. La API de sugerencia la envía a la API de abastecimiento, que crea la ASN en SCE/WMS. La integración de almacenes escucha los eventos de la ASN, guarda la novedad y la publica en SAP a través de SAP PO: al crearse la ASN envía el alta de la OC (Tipo 1) y al verificarse, la recepción (Tipo 2).",
  "current-stage-3": "Etapa pendiente de relevar y ordenar antes de definir una propuesta para gerencia.",
  "proposed-stage-1": "En cada ejecución, el modelo obtiene las reglas de proveedores y materiales mediante Abastecimiento API. El servicio consulta las reglas en SQL y las devuelve al modelo, que las combina con recepciones históricas, recepciones y stock de Databricks para generar la sugerencia de compra. Este flujo termina en la sugerencia.",
  "proposed-stage-2": "La API de sugerencia envía el alta de la OC (Tipo 1) directo a SAP PO al generarla y guarda la respuesta, sin depender de la ASN ni de almacenes. El envío a SCE/WMS se mantiene: la recepción (Tipo 2) sigue saliendo de almacenes, que deja de publicar el Tipo 1 de estas órdenes para evitar duplicados.",
  "proposed-stage-3": "Etapa pendiente de pulir y presentar como propuesta a gerencia."
};

const billingDetailLink = {
  href: "https://github.com/eblasiAndreani/workspace-operativo/blob/main/diagrams/facturacion-sap.md",
  text: "Ver detalle del flujo y del mensaje a SAP"
};

const proposedOrderDetailLink = {
  href: "https://github.com/eblasiAndreani/workspace-operativo/blob/main/diagrams/abastecimiento-actual.md#etapa-1-generación-de-sugerencia-flujo-propuesto",
  text: "Ver detalle del flujo propuesto"
};

const stageLinks = {
  "proposed-stage-1": proposedOrderDetailLink,
  "current-stage-2": billingDetailLink,
  "proposed-stage-2": billingDetailLink
};

const stageStatuses = {
  "current-stage-1": { text: "Documentado hasta la sugerencia de compra", documented: true },
  "current-stage-2": { text: "Documentado hasta el registro en SAP", documented: true },
  "proposed-stage-1": { text: "Propuesta en definición", documented: false },
  "proposed-stage-2": { text: "Propuesta en definición", documented: false },
  "proposed-stage-3": { text: "Pendiente de pulir y presentar a gerencia", documented: false }
};

const defaultStatus = { text: "Pendiente de relevar y definir", documented: false };

const stageOverview = document.querySelector("#stage-overview");
const stageDiagrams = {
  "current-stage-1": document.querySelector("#current-order-diagram"),
  "current-stage-2": document.querySelector("#current-billing-diagram"),
  "proposed-stage-2": document.querySelector("#proposed-billing-diagram")
};
const flowButtons = document.querySelectorAll("[data-flow]");
const stageButtons = document.querySelectorAll("[data-stage]");
let activeFlow = "current";
let activeStage = "1";

const stageNames = {
  1: "Generación de orden de compra",
  2: "Facturación en SAP",
  3: "Manejo de maestros"
};

function updateStage() {
  const stageId = `${activeFlow}-stage-${activeStage}`;
  const activeDiagram = stageDiagrams[stageId];
  const status = stageStatuses[stageId] || defaultStatus;
  const link = stageLinks[stageId];

  stageButtons.forEach((button) => {
    const isActive = button.dataset.stage === activeStage;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  Object.values(stageDiagrams).forEach((diagram) => {
    diagram.hidden = diagram !== activeDiagram;
  });

  stageOverview.replaceChildren();
  const statusBadge = document.createElement("span");
  statusBadge.className = status.documented ? "stage-badge documented" : "stage-badge pending";
  statusBadge.textContent = status.text;
  const summaryText = document.createElement("p");
  summaryText.textContent = stageDescriptions[stageId];
  stageOverview.append(statusBadge, summaryText);

  if (link) {
    const detailLink = document.createElement("a");
    detailLink.className = "stage-link";
    detailLink.href = link.href;
    detailLink.target = "_blank";
    detailLink.rel = "noopener";
    detailLink.textContent = link.text;
    stageOverview.append(detailLink);
  }

  if (activeDiagram && activeDiagram.querySelector(".node-link")) {
    const nodeHint = document.createElement("p");
    nodeHint.className = "stage-hint";
    nodeHint.textContent = "Los cuadros con ↗ abren el detalle de cada bloque en una pestaña nueva.";
    stageOverview.append(nodeHint);
  }

  if (stageId === "proposed-stage-1") {
    const diagram = document.createElement("img");
    diagram.className = "stage-proposed-diagram";
    diagram.src = "abastecimiento-propuesto.svg?v=2";
    diagram.alt = "Flujo propuesto: el modelo obtiene recepciones, recepciones históricas y stock de Databricks, y solicita las reglas mediante Abastecimiento API. La API consulta la base SQL y devuelve las reglas al modelo, que genera la sugerencia de compra.";
    stageOverview.append(diagram);
  }

  if (!activeDiagram && stageId !== "proposed-stage-1") {
    const placeholder = document.createElement("div");
    placeholder.className = "stage-placeholder";
    const icon = document.createElement("span");
    icon.className = "placeholder-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "+";
    const heading = document.createElement("strong");
    heading.textContent = stageNames[activeStage];
    const message = document.createElement("span");
    message.textContent = "El detalle de este flujo se completará al relevar la etapa.";
    placeholder.append(icon, heading, message);
    stageOverview.append(placeholder);
  }
}

flowButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeFlow = button.dataset.flow;
    flowButtons.forEach((item) => {
      const isActive = item === button;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-pressed", String(isActive));
    });
    updateStage();
  });
});

stageButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeStage = button.dataset.stage;
    updateStage();
  });
});

updateStage();
