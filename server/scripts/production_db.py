"""Isolated, guarded Alembic checks for server/.env.production.local."""
import argparse
import os
import secrets
import subprocess
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from dotenv import dotenv_values


SERVER_DIR = Path(__file__).resolve().parents[1]
PRODUCTION_ENV = SERVER_DIR / '.env.production.local'
EXPECTED_HOST = 'aws-0-ap-northeast-1.pooler.supabase.com'
EXPECTED_DATABASE = 'postgres'
PREVIOUS_REVISION = 'd19b6c4a7e20'
EXPECTED_REVISION = 'e4b9a71c2d63'
EXPECTED_INDEXES = {
    'post_comment_likes': {
        'ix_post_comment_likes_comment_id',
        'ix_post_comment_likes_user_id',
    },
    'message_media': {'ix_message_media_message_id'},
}
EXPECTED_UNIQUES = {
    'post_comment_likes': {('comment_id', 'user_id')},
    'message_media': {('filename',)},
}
EXPECTED_FOREIGN_KEYS = {
    'post_comment_likes': {
        ('comment_id', 'post_comments', 'id', 'CASCADE'),
        ('user_id', 'users', 'id', 'CASCADE'),
    },
    'message_media': {('message_id', 'messages', 'id', 'CASCADE')},
}
PARENT_TABLES = {'post_comments', 'messages', 'users'}
MIGRATION_TABLES = {'post_comment_likes', 'message_media'}
FEATURE_TABLES = {'messages', 'users', 'conversation_participants', 'conversations'}


def load_connection():
    """Read only the dedicated production file; never import the dev .env."""
    if not PRODUCTION_ENV.is_file():
        raise SystemExit('Missing server/.env.production.local.')
    values = dotenv_values(PRODUCTION_ENV)
    raw_url = values.get('DATABASE_URL') or ''
    if not raw_url:
        raise SystemExit('DATABASE_URL is empty in server/.env.production.local.')
    try:
        parsed = urlparse(raw_url)
        host = (parsed.hostname or '').lower()
        database = parsed.path.lstrip('/')
    except ValueError:
        raise SystemExit('DATABASE_URL is malformed; connection details were not displayed.')
    if not host or not database:
        raise SystemExit('DATABASE_URL must include a hostname and database name.')

    ssl_mode = (parse_qs(parsed.query).get('sslmode') or [''])[0].lower()
    url_ssl = ssl_mode in {'require', 'verify-ca', 'verify-full'}
    configured_ssl = (values.get('DATABASE_SSL_REQUIRED') or '').strip().lower() in {'1', 'true', 'yes', 'require'}
    ssl_required = url_ssl or configured_ssl
    app_env = (values.get('APP_ENV') or '').strip().lower()

    print(f'Database hostname: {host}')
    print(f'Database name: {database}')
    print(f'APP_ENV: {app_env or "<missing>"}')
    print(f'SSL enabled: {"yes" if ssl_required else "no"}')
    return raw_url, host, database, app_env, ssl_required


def verify_target(host, database, app_env, ssl_required):
    if (host, database, app_env, ssl_required) != (EXPECTED_HOST, EXPECTED_DATABASE, 'production', True):
        raise SystemExit('Stopped: configured target does not match the approved production host, database, APP_ENV, and SSL requirements.')


def create_read_engine(raw_url, ssl_required):
    from sqlalchemy import create_engine

    engine_url = raw_url
    if engine_url.startswith('postgres://'):
        engine_url = engine_url.replace('postgres://', 'postgresql+psycopg2://', 1)
    elif engine_url.startswith('postgresql://'):
        engine_url = engine_url.replace('postgresql://', 'postgresql+psycopg2://', 1)
    ssl_mode = (parse_qs(urlparse(raw_url).query).get('sslmode') or [''])[0].lower()
    connect_args = {'sslmode': 'require'} if ssl_required and ssl_mode not in {'require', 'verify-ca', 'verify-full'} else {}
    return create_engine(engine_url, pool_pre_ping=True, connect_args=connect_args)


def collect_schema(raw_url, ssl_required):
    """Read Alembic and PostgreSQL catalog metadata; performs no writes."""
    from sqlalchemy import inspect, text

    engine = create_read_engine(raw_url, ssl_required)
    try:
        with engine.connect() as connection:
            inspector = inspect(connection)
            tables = set(inspector.get_table_names())
            revisions = []
            if 'alembic_version' in tables:
                revisions = connection.execute(text('SELECT version_num FROM alembic_version')).scalars().all()

            details = {}
            for table in MIGRATION_TABLES | FEATURE_TABLES:
                if table not in tables:
                    details[table] = {'columns': set(), 'indexes': set(), 'uniques': set(), 'foreign_keys': set(), 'primary_key': set()}
                    continue
                columns = {column['name'] for column in inspector.get_columns(table)}
                indexes = {index.get('name') for index in inspector.get_indexes(table)}
                uniques = {
                    tuple(constraint.get('column_names') or ())
                    for constraint in inspector.get_unique_constraints(table)
                }
                foreign_keys = set()
                for foreign_key in inspector.get_foreign_keys(table):
                    local_columns = foreign_key.get('constrained_columns') or []
                    remote_columns = foreign_key.get('referred_columns') or []
                    options = foreign_key.get('options') or {}
                    on_delete = (options.get('ondelete') or '').upper()
                    if len(local_columns) == len(remote_columns) == 1:
                        foreign_keys.add((
                            local_columns[0], foreign_key.get('referred_table'), remote_columns[0], on_delete,
                        ))
                primary_key = set(inspector.get_pk_constraint(table).get('constrained_columns') or [])
                details[table] = {
                    'columns': columns,
                    'indexes': indexes,
                    'uniques': uniques,
                    'foreign_keys': foreign_keys,
                    'primary_key': primary_key,
                }
            return {'tables': tables, 'revisions': revisions, 'details': details}
    except Exception as error:
        raise SystemExit(f'Read-only database inspection failed ({type(error).__name__}); details suppressed.')
    finally:
        engine.dispose()


def show_schema(state):
    revision = ', '.join(state['revisions']) if state['revisions'] else '<missing or empty>'
    print(f'Alembic revision: {revision}')
    for table in (
        'users', 'conversations', 'conversation_participants', 'messages', 'post_comments',
        'post_comment_likes', 'message_media', 'alembic_version',
    ):
        print(f'  table {table}: {"present" if table in state["tables"] else "missing"}')
    for table, indexes in EXPECTED_INDEXES.items():
        actual = state['details'][table]['indexes']
        for index in sorted(indexes):
            print(f'  index {table}.{index}: {"present" if index in actual else "missing"}')
    for table, uniques in EXPECTED_UNIQUES.items():
        actual = state['details'][table]['uniques']
        for columns in sorted(uniques):
            print(f'  unique {table}({", ".join(columns)}): {"present" if columns in actual else "missing"}')
    for table, foreign_keys in EXPECTED_FOREIGN_KEYS.items():
        actual = state['details'][table]['foreign_keys']
        for local, referred_table, remote, on_delete in sorted(foreign_keys):
            expected = (local, referred_table, remote, on_delete)
            description = f'{local}->{referred_table}.{remote} ON DELETE {on_delete}'
            print(f'  foreign key {table}.{description}: {"present" if expected in actual else "missing"}')
    for table in sorted(MIGRATION_TABLES):
        key_columns = state['details'][table]['primary_key']
        print(f'  primary key {table}(id): {"present" if key_columns == {"id"} else "missing"}')
    print(f'  column messages.reply_to_id: {"present" if "reply_to_id" in state["details"]["messages"]["columns"] else "missing"}')
    print(f'  index messages.ix_messages_reply_to_id: {"present" if "ix_messages_reply_to_id" in state["details"]["messages"]["indexes"] else "missing"}')
    print(f'  foreign key messages.reply_to_id: {"present" if ("reply_to_id", "messages", "id", "SET NULL") in state["details"]["messages"]["foreign_keys"] else "missing"}')
    print(f'  column users.instagram_url: {"present" if "instagram_url" in state["details"]["users"]["columns"] else "missing"}')
    participant_columns = state['details']['conversation_participants']['columns']
    print(f'  column conversation_participants.last_delivered_message_id: {"present" if "last_delivered_message_id" in participant_columns else "missing"}')
    print(f'  column conversation_participants.last_read_message_id: {"present" if "last_read_message_id" in participant_columns else "missing"}')
    conversation_columns = state['details']['conversations']['columns']
    print(f'  column conversations.description: {"present" if "description" in conversation_columns else "missing"}')
    print(f'  column conversations.avatar_filename: {"present" if "avatar_filename" in conversation_columns else "missing"}')
    print(f'  column messages.system_event: {"present" if "system_event" in state["details"]["messages"]["columns"] else "missing"}')


def legacy_schema_is_complete(state):
    if not MIGRATION_TABLES.issubset(state['tables']):
        return False
    for table, expected in EXPECTED_INDEXES.items():
        if not expected.issubset(state['details'][table]['indexes']):
            return False
    for table, expected in EXPECTED_UNIQUES.items():
        if not expected.issubset(state['details'][table]['uniques']):
            return False
    for table, expected in EXPECTED_FOREIGN_KEYS.items():
        if not expected.issubset(state['details'][table]['foreign_keys']):
            return False
    return all(state['details'][table]['primary_key'] == {'id'} for table in MIGRATION_TABLES)


def previous_schema_is_complete(state):
    if not legacy_schema_is_complete(state):
        return False
    messages = state['details']['messages']
    users = state['details']['users']
    participant_columns = state['details']['conversation_participants']['columns']
    return (
        'reply_to_id' in messages['columns']
        and 'ix_messages_reply_to_id' in messages['indexes']
        and ('reply_to_id', 'messages', 'id', 'SET NULL') in messages['foreign_keys']
        and 'instagram_url' in users['columns']
        and 'last_delivered_message_id' in participant_columns
        and 'last_read_message_id' in participant_columns
        and {'description', 'avatar_filename'}.issubset(state['details']['conversations']['columns'])
    )


def schema_is_complete(state):
    if not previous_schema_is_complete(state):
        return False
    conversation_columns = state['details']['conversations']['columns']
    return 'system_event' in state['details']['messages']['columns']


def migration_environment(raw_url, ssl_required):
    """Minimal isolated runtime for Flask-Migrate; excludes all dev DB settings."""
    keep = ('PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT')
    env = {key: os.environ[key] for key in keep if key in os.environ}
    env.update({
        'DATABASE_URL': raw_url,
        'APP_ENV': 'development',  # CLI mode avoids unrelated web-service production checks.
        'PYTHON_DOTENV_DISABLED': '1',
    })
    if ssl_required:
        env['PGSSLMODE'] = 'require'
    return env


def run_upgrade(raw_url, host, database, app_env, ssl_required, runner=subprocess.run):
    verify_target(host, database, app_env, ssl_required)
    before = collect_schema(raw_url, ssl_required)
    print(f'Current Alembic revision: {", ".join(before["revisions"]) if before["revisions"] else "<missing>"}')
    if before['revisions'] != [PREVIOUS_REVISION]:
        raise SystemExit(f'Stopped: expected current revision {PREVIOUS_REVISION}; no migration was run.')
    if not PARENT_TABLES.issubset(before['tables']):
        raise SystemExit('Stopped: one or more migration parent tables are missing; no migration was run.')
    if not previous_schema_is_complete(before):
        raise SystemExit('Stopped: the existing messaging and community schema is incomplete; no migration was run.')

    try:
        result = runner(
            [sys.executable, '-m', 'flask', '--app', 'run', 'db', 'upgrade'],
            cwd=SERVER_DIR,
            env=migration_environment(raw_url, ssl_required),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
    except Exception as error:
        raise SystemExit(f'Could not start Flask-Migrate ({type(error).__name__}); no further action taken.')
    output = redact_output(result.stdout or '', raw_url)
    if output:
        print(output, end='' if output.endswith('\n') else '\n')
    if result.returncode:
        raise SystemExit(f'Flask-Migrate upgrade failed with exit code {result.returncode}; stopped without verification.')

    after = collect_schema(raw_url, ssl_required)
    show_schema(after)
    if after['revisions'] != [EXPECTED_REVISION]:
        raise SystemExit(f'Upgrade returned success, but revision is not {EXPECTED_REVISION}.')
    if not schema_is_complete(after):
        raise SystemExit('Upgrade returned success, but one or more expected tables, indexes, or constraints are missing.')
    print(f'Upgrade and verification succeeded at revision {EXPECTED_REVISION}.')


def redact_output(output, raw_url):
    parsed = urlparse(raw_url)
    output = output.replace(raw_url, '<redacted DATABASE_URL>')
    for secret in (parsed.password, parsed.username):
        if secret:
            output = output.replace(secret, '<redacted>')
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('inspect', 'current', 'schema', 'upgrade'))
    parser.add_argument('--approve-target', action='store_true', help='required before database access')
    args = parser.parse_args()

    raw_url, host, database, app_env, ssl_required = load_connection()
    if args.command == 'inspect':
        return 0
    if not args.approve_target:
        raise SystemExit('Stopped before database access; rerun with --approve-target after verifying the target.')
    verify_target(host, database, app_env, ssl_required)

    if args.command == 'upgrade':
        return run_upgrade(raw_url, host, database, app_env, ssl_required)
    state = collect_schema(raw_url, ssl_required)
    if args.command == 'current':
        print(f'Alembic revision: {", ".join(state["revisions"]) if state["revisions"] else "<missing>"}')
    else:
        show_schema(state)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
