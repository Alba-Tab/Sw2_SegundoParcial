# PoC-3 Ollama (rama de prueba, no se mergea)

`probar.py` (solo biblioteca estándar de Python) mide `qwen3:4b-instruct` en Ollama para las tres tareas del sistema:

- **A. Intención de voz (spec 015):** 10 preguntas → JSON restringido por esquema. Incluye una pregunta fuera de alcance y una ambigua.
- **B. Misión del agente (spec 014):** herramientas cerradas con respuestas simuladas, incluida la bitácora con inyección de FM2. Se corre 3 veces.
- **C. Redacción (spec 015):** respuesta corta con la regla de números.

```bash
ollama pull qwen3:4b-instruct
python3 -I plataforma/poc/ollama/probar.py            # o: probar.py qwen3:4b
```

Resultados en `specs/poc-resultados.md`.
