import os
import re
import uuid
from pathlib import Path


_STORAGE_KEY = re.compile(r'^[a-f0-9]{32}\.[a-z0-9]{1,8}$')


class LocalMediaStorage:
    """Local adapter. Replace this class with an object-storage adapter later."""

    def __init__(self, root):
        self.root = Path(root).resolve()

    def _path(self, key):
        if not isinstance(key, str) or not _STORAGE_KEY.fullmatch(key):
            raise ValueError('Invalid media storage key')
        path = (self.root / key).resolve()
        if path.parent != self.root:
            raise ValueError('Invalid media storage key')
        return path

    def save(self, key, content, content_type=None):
        self.root.mkdir(parents=True, exist_ok=True)
        target = self._path(key)
        temporary = self.root / f'.upload-{uuid.uuid4().hex}.tmp'
        try:
            with temporary.open('xb') as file:
                file.write(content)
            os.replace(temporary, target)
        finally:
            try:
                temporary.unlink()
            except FileNotFoundError:
                pass
        return target

    def delete(self, key):
        path = self._path(key)
        if path.exists():
            path.unlink()

    def resolve(self, key):
        """Return a validated storage path for framework streaming helpers."""
        return self._path(key)

    def stage_delete(self, key):
        """Atomically hide a file until its database row is safely removed."""
        path = self._path(key)
        if not path.exists():
            return None
        staged = self.root / f'.delete-{uuid.uuid4().hex}.tmp'
        os.replace(path, staged)
        return staged

    def restore_delete(self, key, staged):
        if staged and staged.exists():
            os.replace(staged, self._path(key))

    @staticmethod
    def finalize_delete(staged):
        if staged and staged.exists():
            staged.unlink()


class S3MediaStorage:
    """Private S3-compatible adapter with rollback-safe staged deletion."""

    def __init__(self, bucket, region=None, endpoint_url=None, prefix='midnight'):
        if not bucket:
            raise RuntimeError('S3_BUCKET must be configured when MEDIA_STORAGE_BACKEND=s3')
        try:
            import boto3
            from botocore.config import Config as BotoConfig
        except ImportError as error:
            raise RuntimeError('Install server/requirements-prod.txt to use S3 storage') from error
        self.bucket = bucket
        self.prefix = prefix.strip('/')
        self.client = boto3.client(
            's3', region_name=region or None, endpoint_url=endpoint_url or None,
            config=BotoConfig(s3={'addressing_style': 'path'}, signature_version='s3v4'),
        )

    def _key(self, key):
        if not isinstance(key, str) or not _STORAGE_KEY.fullmatch(key):
            raise ValueError('Invalid media storage key')
        return f'{self.prefix}/{key}' if self.prefix else key

    def save(self, key, content, content_type=None):
        args = {'Bucket': self.bucket, 'Key': self._key(key), 'Body': content}
        if content_type:
            args['ContentType'] = content_type
        self.client.put_object(**args)
        return key

    def delete(self, key):
        self.client.delete_object(Bucket=self.bucket, Key=self._key(key))

    def get_object(self, key, range_header=None):
        args = {'Bucket': self.bucket, 'Key': self._key(key)}
        if range_header:
            match = re.fullmatch(r'bytes=(\d*)-(\d*)', range_header.strip())
            if not match or not any(match.groups()):
                raise ValueError('Invalid byte range')
            args['Range'] = f'bytes={match.group(1)}-{match.group(2)}'
        return self.client.get_object(**args)

    def stage_delete(self, key):
        original = self._key(key)
        staged = self._key(f'{uuid.uuid4().hex}.tmp')
        self.client.copy_object(Bucket=self.bucket, Key=staged,
                                CopySource={'Bucket': self.bucket, 'Key': original})
        try:
            self.client.delete_object(Bucket=self.bucket, Key=original)
        except Exception:
            self.client.delete_object(Bucket=self.bucket, Key=staged)
            raise
        return staged

    def restore_delete(self, key, staged):
        if staged:
            self.client.copy_object(Bucket=self.bucket, Key=self._key(key),
                                    CopySource={'Bucket': self.bucket, 'Key': staged})
            self.client.delete_object(Bucket=self.bucket, Key=staged)

    def finalize_delete(self, staged):
        if staged:
            self.client.delete_object(Bucket=self.bucket, Key=staged)


def get_media_storage(config=None, category='posts'):
    """Build the storage adapter selected by application configuration."""
    from flask import current_app
    settings = config or current_app.config
    backend = settings.get('MEDIA_STORAGE_BACKEND', 'local').strip().lower()
    if backend == 'local':
        if category == 'avatars':
            root = settings['AVATAR_UPLOAD_FOLDER']
        elif category == 'conversations':
            root = os.path.join(settings['POST_MEDIA_FOLDER'], 'conversations')
        else:
            root = settings['POST_MEDIA_FOLDER']
        return LocalMediaStorage(root)
    if backend == 's3':
        return S3MediaStorage(settings.get('S3_BUCKET'), settings.get('S3_REGION'),
                              settings.get('S3_ENDPOINT_URL'), f"{settings.get('S3_PREFIX', 'midnight').strip('/')}/{category}")
    raise RuntimeError('MEDIA_STORAGE_BACKEND must be local or s3')
