import type { Macro } from "../engine/types.js";
import { log } from "./log.js";
import { ping } from "./ping.js";
import { triage } from "./triage.js";

// Todas las macros activas. El orden no importa: el motor las ordena por
// prioridad. Para agregar un comportamiento nuevo, crea su archivo y sumalo aca.
export const rules: Macro[] = [log, ping, triage];
