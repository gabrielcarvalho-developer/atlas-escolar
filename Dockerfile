FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY python/pyproject.toml python/pyproject.toml
COPY python/api.py python/api.py
COPY python/mcp_server.py python/mcp_server.py
COPY python/agent python/agent
COPY python/tools python/tools
COPY python/knowledge python/knowledge
COPY lib/generated lib/generated

RUN python -m pip install --no-cache-dir ./python \
    && useradd --create-home --uid 10001 atlas \
    && chown -R atlas:atlas /app

USER atlas

CMD ["sh", "-c", "exec python -m uvicorn api:app --app-dir python --host 0.0.0.0 --port ${PORT:-8000}"]
