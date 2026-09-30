#!/bin/bash
set -e

# Run migrations
cd /app
alembic upgrade head

# Start uvicorn
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
