# midnight.

A social writing community for thoughts that stay up late.

## Stack

- **Frontend:** React, Vite, React Router, Axios, Tailwind CSS, Socket.IO client
- **Backend:** Python, Flask, Flask-SQLAlchemy, Flask-Migrate, Flask-SocketIO
- **Database:** PostgreSQL

## Local setup

Install PostgreSQL and create an empty development database named `midnight_db`.
Use a virtual environment for Python dependencies.

From the repository root, copy the example environment file:

```powershell
Copy-Item server/.env.example server/.env
```

Generate a private key and replace the placeholder `SECRET_KEY` in
`server/.env`:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Set `DATABASE_URL` to your local PostgreSQL connection. `GOOGLE_CLIENT_ID` and
the matching frontend `VITE_GOOGLE_CLIENT_ID` are optional; leave them unset to
use username/password sign-in only. Keep `.env` files private.

Install Python dependencies and apply migrations:

```powershell
python -m venv server/.venv
server/.venv/Scripts/Activate.ps1
python -m pip install -r server/requirements.txt
cd server
python -m flask --app run db upgrade
python run.py
```

In a second terminal, install and run the frontend:

```powershell
cd client
npm install
npm run dev
```

Open <http://localhost:5173>. Vite forwards `/api` and `/socket.io` requests to
the Flask development server on port 5000.

## Tests and checks

Install the test dependency and runtime requirements:

```powershell
python -m pip install -r server/requirements-dev.txt
```

The backend tests use isolated SQLite databases and temporary upload folders;
they do not reset or write to the configured PostgreSQL database.

```powershell
cd server
python -m pytest -q
python -m flask --app run db current
python -m flask --app run db check
cd ../client
npm run lint
npm run build
```

`db upgrade` applies schema changes and should be run against the intended
database only after reviewing the migrations and backing up any important
existing data. Do not use `db reset` or drop the database to run tests.

## Configuration and deployment note

`server/.env.example` documents the local settings. Production configuration is
documented in [`deploy/.env.production.example`](deploy/.env.production.example)
and [`docs/deployment/production-architecture.md`](docs/deployment/production-architecture.md).
The production container serves the Vite build and Flask API from one origin,
uses Gunicorn's threaded worker for Socket.IO, and requires PostgreSQL plus a
private S3-compatible media bucket. Production startup fails without a strong
`SECRET_KEY`, `DATABASE_URL`, explicit HTTPS origins, and S3 configuration.

Build the image from the repository root:

```powershell
docker build -f deploy/Dockerfile -t midnight:production .
```

Set runtime secrets in the host's secret manager. Set Vite values as Docker
build arguments; they are compiled into public browser code and must never
contain secrets. For Google sign-in, pass the public client ID with
`--build-arg VITE_GOOGLE_CLIENT_ID=your-client-id`; the API and Socket.IO build
arguments default to same-origin `/api` and the current site origin. Before starting a new release, back up the intended database,
review pending migrations, then run this one-off command against that database:

```powershell
python -m flask --app run db upgrade
```

The web process does not run migrations automatically, which avoids concurrent
migration races during restarts or scale events. Follow the complete checklist
in `docs/deployment/deployment-checklist.md`. Never point test or migration
commands at production without an explicit release procedure and backup.
