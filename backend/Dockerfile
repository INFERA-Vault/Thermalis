FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/requirements.txt

RUN pip install --no-cache-dir -r requirements.txt

COPY backend /app/backend
COPY ml /app/ml
COPY alembic.ini /app/alembic.ini

ENV PYTHONPATH=/app
ENV PORT=8000

# Expose port
EXPOSE 8000

# Script to run migrations and then start uvicorn
COPY backend/start.sh /app/start.sh
RUN chmod +x /app/start.sh

CMD ["/app/start.sh"]
