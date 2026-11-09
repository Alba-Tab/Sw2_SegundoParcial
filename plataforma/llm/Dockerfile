# LLM propio (B6, D36): Ollama con el parche de CVE-2026-7482 (corregido en 0.17.1) y el modelo ya descargado, para
# que la réplica que despierta de cero no baje 2,5 GB. Container Apps con GPU T4, ingress interno, puerto 11434.
# docker build -t llm plataforma/llm   (la nube: --platform linux/amd64)
FROM ollama/ollama:0.40.13
ARG MODELO=qwen3:4b-instruct
RUN ollama serve >/dev/null 2>&1 & pid=$!; \
    until ollama list >/dev/null 2>&1; do sleep 1; done; \
    ollama pull "$MODELO" && kill "$pid"
# La misión corre cada 10 min durante la demo: con 30 min el modelo sigue cargado en la GPU entre una y otra.
ENV OLLAMA_KEEP_ALIVE=30m
EXPOSE 11434
