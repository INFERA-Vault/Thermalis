#!/bin/bash
set -e

# Run migrations
cd /app/backend
alembic upgrade head

# Start uvicorn
cd /app
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
