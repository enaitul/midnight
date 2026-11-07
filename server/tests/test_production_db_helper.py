import sys
from pathlib import Path
from types import SimpleNamespace

import pytest


SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
import production_db  # noqa: E402


TARGET_URL = 'postgresql://safe-user:safe-password@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require'


def schema_state(revision, *, migrated=False):
    details = {
        'post_comment_likes': {
            'indexes': {'ix_post_comment_likes_comment_id', 'ix_post_comment_likes_user_id'},
            'uniques': {('comment_id', 'user_id')},
            'foreign_keys': {
                ('comment_id', 'post_comments', 'id', 'CASCADE'),
                ('user_id', 'users', 'id', 'CASCADE'),
            },
            'primary_key': {'id'},
        },
        'message_media': {
            'indexes': {'ix_message_media_message_id'},
            'uniques': {('filename',)},
            'foreign_keys': {('message_id', 'messages', 'id', 'CASCADE')},
            'primary_key': {'id'},
        },
        'messages': {
            'columns': {'id', 'reply_to_id'},
            'indexes': {'ix_messages_reply_to_id'},
            'foreign_keys': {('reply_to_id', 'messages', 'id', 'SET NULL')},
        },
        'users': {'columns': {'id', 'instagram_url'}},
        'conversation_participants': {
            'columns': {'conversation_id', 'user_id'} | ({'last_delivered_message_id', 'last_read_message_id'} if migrated else set()),
        },
    }
    tables = production_db.PARENT_TABLES | production_db.MIGRATION_TABLES | {'conversation_participants', 'alembic_version'}
    return {'revisions': [revision], 'tables': tables, 'details': details}


def test_load_connection_uses_only_the_production_env_file(tmp_path, monkeypatch, capsys):
    production_env = tmp_path / '.env.production.local'
    production_env.write_text(
        f'APP_ENV=production\nDATABASE_URL={TARGET_URL}\n',
        encoding='utf-8',
    )
    monkeypatch.setattr(production_db, 'PRODUCTION_ENV', production_env)
    monkeypatch.setenv('DATABASE_URL', 'postgresql://dev:dev@localhost/development')
    monkeypatch.setenv('APP_ENV', 'development')

    raw_url, host, database, app_env, ssl_required = production_db.load_connection()

    assert raw_url == TARGET_URL
    assert host == production_db.EXPECTED_HOST
    assert database == production_db.EXPECTED_DATABASE
    assert app_env == 'production'
    assert ssl_required is True
    output = capsys.readouterr().out
    assert 'safe-user' not in output and 'safe-password' not in output
    assert TARGET_URL not in output


def test_upgrade_refuses_unexpected_revision_without_running_migration(monkeypatch):
    state = {
        'revisions': ['8d4c2b91f6a0'],
        'tables': {'users', 'messages', 'post_comments'},
        'details': {},
    }
    migration_calls = []
    monkeypatch.setattr(production_db, 'collect_schema', lambda *_: state)

    with pytest.raises(SystemExit, match='expected current revision'):
        production_db.run_upgrade(
            TARGET_URL,
            production_db.EXPECTED_HOST,
            production_db.EXPECTED_DATABASE,
            'production',
            True,
            runner=lambda *args, **kwargs: migration_calls.append((args, kwargs)),
        )

    assert migration_calls == []


def test_upgrade_stops_after_migration_failure_without_postcheck(monkeypatch):
    before = schema_state(production_db.PREVIOUS_REVISION)
    inspections = []
    migration_calls = []

    def collect(*_):
        inspections.append(True)
        return before

    def fail_migration(command, **kwargs):
        migration_calls.append((command, kwargs))
        return SimpleNamespace(returncode=1, stdout='DDL failed')

    monkeypatch.setattr(production_db, 'collect_schema', collect)
    with pytest.raises(SystemExit, match='upgrade failed'):
        production_db.run_upgrade(
            TARGET_URL,
            production_db.EXPECTED_HOST,
            production_db.EXPECTED_DATABASE,
            'production',
            True,
            runner=fail_migration,
        )

    assert len(migration_calls) == 1
    assert len(inspections) == 1
    _, kwargs = migration_calls[0]
    assert kwargs['env']['DATABASE_URL'] == TARGET_URL
    assert kwargs['env']['APP_ENV'] == 'development'
    assert 'DATABASE_SSL' not in kwargs['env']
    assert kwargs['env']['PGSSLMODE'] == 'require'


def test_schema_verification_requires_reply_and_instagram_fields():
    assert production_db.legacy_schema_is_complete(schema_state(production_db.PREVIOUS_REVISION))
    assert not production_db.schema_is_complete(schema_state(production_db.PREVIOUS_REVISION))
    assert production_db.schema_is_complete(schema_state(production_db.EXPECTED_REVISION, migrated=True))
