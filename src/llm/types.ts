// Contrato de la capa de IA. El resto del codigo habla SIEMPRE contra esta
// interfaz, nunca contra un proveedor concreto. Cambiar de proveedor es cambiar
// el adapter, no el codigo que lo usa.

export type LLMRole = "system" | "user" | "assistant";

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface LLMInput {
  messages: LLMMessage[];
  model?: string; // override del modelo por defecto del proveedor
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResult {
  text: string; // el contenido de la respuesta
  model: string; // el modelo que efectivamente respondio
  raw?: unknown; // respuesta cruda, por si se necesita
}

export interface LLMProvider {
  readonly name: string;
  complete(input: LLMInput): Promise<LLMResult>;
}
