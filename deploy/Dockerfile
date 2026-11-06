FROM node:22-bookworm-slim AS frontend
WORKDIR /build/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
ARG VITE_API_BASE_URL=/api
ARG VITE_SOCKET_URL=
ARG VITE_GOOGLE_CLIENT_ID=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN npm run build

FROM python:3.12-slim AS app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 FRONTEND_DIST_DIR=/app/client-dist APP_ENV=production FLASK_DEBUG=0
WORKDIR /app
COPY server/ /app/server/
RUN python -m pip install --no-cache-dir -r /app/server/requirements-prod.txt
COPY --from=frontend /build/client/dist/ /app/client-dist/
WORKDIR /app/server
CMD ["gunicorn", "--config", "gunicorn.conf.py", "run:app"]
