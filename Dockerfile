# ---------- Stage 1: build the React frontend ----------
FROM node:20-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---------- Stage 2: install Python deps in a venv ----------
FROM python:3.12-slim AS backend
WORKDIR /app
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# ---------- Stage 3: runtime ----------
FROM python:3.12-slim
WORKDIR /app
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PGPEEK_STATIC_DIR=/app/static

COPY --from=backend /opt/venv /opt/venv
COPY backend/app /app/app
COPY --from=frontend /app/dist /app/static

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
