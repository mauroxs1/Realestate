import axios from "axios";

const SHEETS_URL = () => process.env.SHEETS_WEBHOOK_URL!;

export interface LeadData {
  nombre: string;
  telefono: string;
  tipoBusqueda: string;
  tipoPropiedad: string;
  ambientes?: string;
  zona?: string;
  presupuesto?: string;
  plazoIngreso?: string;
  estado: string;
  observaciones?: string;
}

export interface VisitRecord {
  nombre: string;
  telefono: string;
  propiedadId: string;
  propiedadDescripcion: string;
  disponibilidad: string;
  observaciones?: string;
}

export async function addLead(data: LeadData): Promise<void> {
  await axios.post(SHEETS_URL(), { action: "addLead", ...data }).catch(console.error);
}

export async function updateLead(
  telefono: string,
  estado: string,
  observaciones?: string
): Promise<void> {
  await axios.post(SHEETS_URL(), { action: "updateLead", telefono, estado, observaciones }).catch(console.error);
}

export async function addVisit(data: VisitRecord): Promise<void> {
  await axios.post(SHEETS_URL(), { action: "addVisit", ...data }).catch(console.error);
}
