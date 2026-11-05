# LLM (B6, D36, D113)

Imagen de Ollama para Container Apps con GPU T4 (perfil `gpu-t4`, ingress **interno**, réplicas 0 a 1). Trae `qwen3:4b-instruct` descargado en el build, así que una réplica nueva responde sin bajar nada.

- **Versión:** `ollama/ollama:0.40.13`. CVE-2026-7482 (lectura fuera de límites en el cargador GGUF) está corregido desde 0.17.1.
- **Modelo:** `--build-arg MODELO=…` para cambiarlo; Analítica lo pide por `LLM_MODEL`.
- **Memoria del modelo:** `OLLAMA_KEEP_ALIVE=30m`, para que la misión cada 10 min no lo descargue de la GPU.
- **Sin cuota de GPU:** plan C de D113, Ollama en la Mac por un túnel autenticado.

```bash
docker build -t transporte/llm plataforma/llm                       # en la Mac (arm64), para probar
docker run --rm -d -p 11434:11434 --name llm transporte/llm
curl -s localhost:11434/api/chat -d '{"model":"qwen3:4b-instruct","stream":false,"messages":[{"role":"user","content":"Responde solo: listo"}]}'
```

El workflow `llm` la construye con `--platform linux/amd64`, que es la arquitectura de la T4.
