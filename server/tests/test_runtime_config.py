import os
from pathlib import Path
import subprocess
import sys
from types import ModuleType, SimpleNamespace

import pytest
from app import create_app, db
from app.storage.media_storage import S3MediaStorage


def isolated_environment():
    environment = os.environ.copy()
    for key in ('DATABASE_URL', 'SECRET_KEY', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'GOOGLE_CLIENT_ID'):
        environment.pop(key, None)
    return environment


def test_production_configuration_rejects_missing_secret_key():
    server_dir = Path(__file__).resolve().parents[1]
    environment = isolated_environment()
    environment.update({
        'APP_ENV': 'production',
        'PYTHON_DOTENV_DISABLED': 'true',
        'PYTHONPATH': str(server_dir),
    })
    # An empty inherited value also prevents python-dotenv from filling it from
    # a developer's local .env file during this isolated configuration check.
    environment['SECRET_KEY'] = ''
    result = subprocess.run(
        [sys.executable, '-c', 'import app.config'],
        cwd=server_dir,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode != 0
    assert 'SECRET_KEY must be configured in production' in result.stderr


@pytest.mark.parametrize(('extra', 'message'), [
    ({'DATABASE_URL': ''}, 'DATABASE_URL must be configured in production'),
    ({'DATABASE_URL': 'postgresql://user:pass@db.example.com/midnight',
      'CORS_ALLOWED_ORIGINS': 'http://localhost:5173'}, 'Production CORS origins must be explicit'),
    ({'DATABASE_URL': 'postgresql://user:pass@db.example.com/midnight',
      'MEDIA_STORAGE_BACKEND': 'local'}, 'Production media storage must be configured as s3'),
])
def test_production_configuration_fails_closed(extra, message):
    server_dir = Path(__file__).resolve().parents[1]
    environment = isolated_environment()
    environment.update({
        'APP_ENV': 'production',
        'PYTHON_DOTENV_DISABLED': 'true',
        'PYTHONPATH': str(server_dir),
        'SECRET_KEY': 'stage-seven-configuration-test-secret-key',
        'DATABASE_URL': 'postgresql://user:pass@db.example.com/midnight',
        'CORS_ALLOWED_ORIGINS': 'https://midnight.example.com',
        'SOCKETIO_CORS_ALLOWED_ORIGINS': 'https://midnight.example.com',
        'MEDIA_STORAGE_BACKEND': 's3',
        'S3_BUCKET': 'private-test-bucket',
    })
    environment.update(extra)
    result = subprocess.run(
        [sys.executable, '-c', 'import app.config'], cwd=server_dir,
        env=environment, capture_output=True, text=True, check=False,
    )
    assert result.returncode != 0
    assert message in result.stderr


def test_production_configuration_accepts_complete_secure_environment():
    server_dir = Path(__file__).resolve().parents[1]
    environment = isolated_environment()
    environment.update({
        'APP_ENV': 'production', 'PYTHON_DOTENV_DISABLED': 'true',
        'PYTHONPATH': str(server_dir),
        'SECRET_KEY': 'stage-seven-configuration-test-secret-key',
        'DATABASE_URL': 'postgresql://user:pass@db.example.com/midnight',
        'CORS_ALLOWED_ORIGINS': 'https://midnight.example.com',
        'SOCKETIO_CORS_ALLOWED_ORIGINS': 'https://midnight.example.com',
        'MEDIA_STORAGE_BACKEND': 's3', 'S3_BUCKET': 'private-test-bucket',
    })
    result = subprocess.run(
        [sys.executable, '-c',
         'from app.config import Config; assert Config.SQLALCHEMY_DATABASE_URI.startswith("postgresql+psycopg2://"); print("valid")'],
        cwd=server_dir, env=environment, capture_output=True, text=True, check=False,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == 'valid'


def test_spa_route_refresh_uses_built_index(tmp_path):
    (tmp_path / 'index.html').write_text('<main>midnight app shell</main>', encoding='utf-8')
    app = create_app({
        'TESTING': True,
        'MEDIA_STORAGE_BACKEND': 'local',
        'SQLALCHEMY_DATABASE_URI': 'sqlite://',
        'FRONTEND_DIST_DIR': str(tmp_path),
        'RATELIMIT_STORAGE_URI': 'memory://',
    })
    response = app.test_client().get('/write/42')
    assert response.status_code == 200
    assert b'midnight app shell' in response.data


def test_login_limit_returns_safe_json(tmp_path):
    app = create_app({
        'TESTING': True,
        'MEDIA_STORAGE_BACKEND': 'local',
        'SQLALCHEMY_DATABASE_URI': 'sqlite://',
        'RATELIMIT_STORAGE_URI': 'memory://',
        'SECRET_KEY': 'rate-limit-test-secret',
    })
    with app.app_context():
        db.create_all()
    client = app.test_client()
    response = None
    for _ in range(21):
        response = client.post('/api/auth/login', json={'email_or_username': 'nobody', 'password': 'wrong'})
    assert response.status_code == 429
    assert response.is_json
    assert response.json['error'] == 'Too many attempts. Please wait before trying again.'


def test_unexpected_errors_return_generic_json(tmp_path):
    app = create_app({
        'TESTING': False,
        'MEDIA_STORAGE_BACKEND': 'local',
        'PROPAGATE_EXCEPTIONS': False,
        'SQLALCHEMY_DATABASE_URI': 'sqlite://',
    })
    @app.get('/api/test-unexpected-error')
    def raise_test_error():
        raise RuntimeError('private exception details')
    response = app.test_client().get('/api/test-unexpected-error')
    assert response.status_code == 500
    assert response.is_json
    assert 'private exception details' not in response.get_data(as_text=True)
    assert response.json == {'error': 'An unexpected server error occurred'}


def test_s3_adapter_uses_private_key_prefix_and_byte_ranges(monkeypatch):
    calls = []
    client_options = []
    class FakeClient:
        def get_object(self, **kwargs):
            calls.append(('get', kwargs))
            return {'ContentLength': 4, 'ContentRange': 'bytes 0-3/12', 'Body': object()}
        def copy_object(self, **kwargs): calls.append(('copy', kwargs))
        def delete_object(self, **kwargs): calls.append(('delete', kwargs))
        def put_object(self, **kwargs): calls.append(('put', kwargs))
    class FakeConfig:
        def __init__(self, s3, signature_version):
            self.s3 = s3
            self.signature_version = signature_version
    fake_botocore = ModuleType('botocore')
    fake_botocore.__path__ = []
    fake_config = ModuleType('botocore.config')
    fake_config.Config = FakeConfig
    fake_botocore.config = fake_config
    monkeypatch.setitem(sys.modules, 'botocore', fake_botocore)
    monkeypatch.setitem(sys.modules, 'botocore.config', fake_config)
    def fake_boto_client(service_name, **kwargs):
        client_options.append((service_name, kwargs))
        return FakeClient()
    monkeypatch.setitem(sys.modules, 'boto3', SimpleNamespace(client=fake_boto_client))
    storage = S3MediaStorage('private-bucket', region='auto', endpoint_url='https://objects.example', prefix='midnight/posts')
    filename = 'a' * 32 + '.mp4'
    storage.save(filename, b'data', 'video/mp4')
    storage.get_object(filename, 'bytes=0-3')
    assert calls[0][1]['Bucket'] == 'private-bucket'
    assert calls[0][1]['Key'] == f'midnight/posts/{filename}'
    assert client_options[0][0] == 's3'
    assert client_options[0][1]['config'].s3['addressing_style'] == 'path'
    assert client_options[0][1]['config'].signature_version == 's3v4'
    assert calls[1][1]['Range'] == 'bytes=0-3'
    assert calls[1][1]['Key'] == f'midnight/posts/{filename}'
    staged = storage.stage_delete(filename)
    storage.restore_delete(filename, staged)
    storage.finalize_delete(staged)
    assert calls[2][0] == 'copy'
    assert calls[3] == ('delete', {'Bucket': 'private-bucket', 'Key': f'midnight/posts/{filename}'})
    assert calls[4][0] == 'copy'
    assert calls[5][0] == 'delete'
    assert calls[6][0] == 'delete'
