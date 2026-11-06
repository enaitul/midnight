# Production Deployment Checklist

## Before configuring the host

- [ ] Confirm the selected paid plans, region, app/database compatibility, resource limits, backups, retention, bandwidth, and current monthly estimate.
- [ ] Create the PostgreSQL database and private S3-compatible bucket through the approved account owner; use a least-privilege bucket key.
- [ ] Verify current local uploads are migrated and counted before changing `MEDIA_STORAGE_BACKEND`. This repository does not migrate them.
- [ ] Configure Google OAuth's authorized origin for the HTTPS app domain.

## Environment and build

- [ ] Set `APP_ENV=production`, `FLASK_DEBUG=0`, and a unique randomly generated `SECRET_KEY` (at least 32 characters; 48+ recommended).
- [ ] Set `DATABASE_URL` to the managed PostgreSQL connection string and enable provider-required TLS.
- [ ] Set `CORS_ALLOWED_ORIGINS` and `SOCKETIO_CORS_ALLOWED_ORIGINS` to the exact public HTTPS origin; no wildcard or localhost origin.
- [ ] Set `MEDIA_STORAGE_BACKEND=s3`, bucket, region, endpoint, and prefix. Supply AWS-compatible credentials through provider secrets or a workload role. Keep the bucket private.
- [ ] Set `RATELIMIT_STORAGE_URI=memory://` only for a single instance. Use a shared Redis URI before running multiple instances.
- [ ] Set `PROXY_FIX_X_FOR` only to the exact trusted proxy hop count. Do not trust client-controlled forwarding headers.
- [ ] Supply `VITE_API_BASE_URL=/api`, blank `VITE_SOCKET_URL` (same-origin), and public `VITE_GOOGLE_CLIENT_ID` as build arguments. `VITE_*` values are compiled into downloadable JavaScript and are not secrets.
- [ ] Build from the repository root with `docker build -f deploy/Dockerfile -t midnight:production .` and inspect the build output.

## Database release

- [ ] Back up PostgreSQL and verify the backup can be restored.
- [ ] Review pending migrations; never reset/drop the production database.
- [ ] Run exactly once as a release command: `python -m flask --app run db upgrade` from `/app/server` against the release database.
- [ ] Verify with `python -m flask --app run db current` and `python -m flask --app run db check`.
- [ ] Start the web image only after migration succeeds; do not use startup hooks that race across replicas.

## Runtime validation

- [ ] Confirm health endpoint `/api/health`, login/register, Google OAuth, drafts, publishing, editing, post media, avatars, likes/comments, follows, notifications, and messages.
- [ ] Confirm `/write/:id`, `/profile/:username`, and other React routes load after a hard refresh (unknown non-API paths return the SPA entry point).
- [ ] Confirm `/socket.io` upgrades to WSS, reconnect reloads message history, and conversation authorization still rejects non-members.
- [ ] Confirm a draft attachment is unavailable to another account and a published attachment is viewable.
- [ ] Confirm logs contain useful exception details only on the server and responses do not contain stack traces, environment values, or credentials.
- [ ] Confirm no local uploads are assumed to persist after deploy; verify object bucket backup/retention policy.
- [ ] Keep the deployment single-instance until Socket.IO message queueing and shared rate-limit storage are implemented and tested.
- [ ] Check provider usage, billing alerts, database backups, TLS renewal, rollback process, and ownership for incident response.
