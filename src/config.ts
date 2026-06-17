function envBool(name: string, def: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return def;
  return v === "true" || v === "1";
}

export const config = {
  // Modo seguro. Si es true, nicole observa e ingiere mensajes pero NO envia
  // nada a WhatsApp. Por seguridad arranca activado: hay que poner explicitamente
  // READ_ONLY=false para habilitar el envio de mensajes.
  readOnly: envBool("READ_ONLY", true),

  // Carpeta donde se persiste la sesion de WhatsApp. Ignorada por git.
  authDir: process.env.AUTH_DIR ?? "auth_state",
};
