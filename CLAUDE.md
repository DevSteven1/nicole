# CLAUDE.md

Las convenciones e instrucciones de este proyecto estan en [AGENT.md](AGENT.md).
Leelo completo antes de hacer cambios.

Puntos clave que no debes olvidar:

- Nunca uses emojis (codigo, commits, documentacion ni salida).
- Usa Conventional Commits con commits atomicos. Mensajes en ingles.
- No hagas commit ni push salvo que se pida explicitamente.
- Se construye por partes: una parte = un commit, se revisa antes de seguir.
- La IA es intercambiable: todo pasa por la interfaz `LLMProvider`, nunca
  importes el SDK de un proveedor directamente.
