import os
import secrets
from dotenv import load_dotenv

# Load variables from the .env file into the environment
load_dotenv()


class Config:
    """
    Central configuration for the Flask app.

    Values come from environment variables (the .env file).
    This keeps secrets out of the code and makes the app
    easy to configure for different environments (dev, prod).
    """

    # Used by Flask to sign cookies and by PyJWT to sign tokens
    APP_ENV = os.getenv('APP_ENV', 'development').strip().lower()
    FLASK_DEBUG = os.getenv('FLASK_DEBUG', '0').strip().lower() in {'1', 'true', 'yes'}
    SECRET_KEY = (os.getenv('SECRET_KEY') or '').strip()
    if APP_ENV in {'production', 'prod'} and len(SECRET_KEY) < 32:
        raise RuntimeError('SECRET_KEY must be configured in production with at least 32 characters')
    if not SECRET_KEY:
        # A per-process development key avoids a reusable public signing secret.
        SECRET_KEY = secrets.token_urlsafe(32)

    # SQLAlchemy needs this to know where the database is.
    DATABASE_URL = os.getenv('DATABASE_URL')
    if APP_ENV in {'production', 'prod'} and not DATABASE_URL:
        raise RuntimeError('DATABASE_URL must be configured in production')
    if DATABASE_URL and DATABASE_URL.startswith('postgres://'):
        DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)
    SQLALCHEMY_DATABASE_URI = (
        DATABASE_URL.replace('postgresql://', 'postgresql+psycopg2://', 1)
        if DATABASE_URL and DATABASE_URL.startswith('postgresql://') else DATABASE_URL
    )
    SQLALCHEMY_ENGINE_OPTIONS = {'pool_pre_ping': True, 'pool_recycle': 300}

    # Disable a legacy SQLAlchemy feature we don't need
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Google OAuth 2.0 Client ID for token audience validation
    GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')
    AVATAR_UPLOAD_FOLDER = os.getenv('AVATAR_UPLOAD_FOLDER', os.path.join(os.path.dirname(__file__), 'uploads', 'avatars'))
    POST_MEDIA_FOLDER = os.getenv('POST_MEDIA_FOLDER', os.path.join(os.path.dirname(__file__), 'uploads', 'posts'))
    POST_MEDIA_MAX_IMAGE_BYTES = int(os.getenv('POST_MEDIA_MAX_IMAGE_MB', '10')) * 1024 * 1024
    POST_MEDIA_MAX_VIDEO_BYTES = int(os.getenv('POST_MEDIA_MAX_VIDEO_MB', '100')) * 1024 * 1024
    POST_MEDIA_MAX_AUDIO_BYTES = int(os.getenv('POST_MEDIA_MAX_AUDIO_MB', '25')) * 1024 * 1024
    POST_MEDIA_MAX_ATTACHMENTS = int(os.getenv('POST_MEDIA_MAX_ATTACHMENTS', '10'))
    # Requests upload one file at a time; leave space for multipart framing.
    MAX_CONTENT_LENGTH = POST_MEDIA_MAX_VIDEO_BYTES + 2 * 1024 * 1024
    SOCKETIO_CORS_ALLOWED_ORIGINS = [
        origin.strip() for origin in os.getenv(
            'SOCKETIO_CORS_ALLOWED_ORIGINS',
            'http://localhost:5173,http://127.0.0.1:5173',
        ).split(',') if origin.strip()
    ]
    CORS_ALLOWED_ORIGINS = [origin.strip() for origin in os.getenv(
        'CORS_ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173'
    ).split(',') if origin.strip()]
    if APP_ENV in {'production', 'prod'} and not CORS_ALLOWED_ORIGINS:
        raise RuntimeError('CORS_ALLOWED_ORIGINS must list the production frontend origin')
    if APP_ENV in {'production', 'prod'} and not SOCKETIO_CORS_ALLOWED_ORIGINS:
        raise RuntimeError('SOCKETIO_CORS_ALLOWED_ORIGINS must list the production frontend origin')
    if APP_ENV in {'production', 'prod'} and any(
        not origin.startswith('https://') or origin == '*' or 'localhost' in origin or '127.0.0.1' in origin
        for origin in CORS_ALLOWED_ORIGINS + SOCKETIO_CORS_ALLOWED_ORIGINS
    ):
        raise RuntimeError('Production CORS origins must be explicit public HTTPS origins')

    MEDIA_STORAGE_BACKEND = os.getenv('MEDIA_STORAGE_BACKEND', 'local').strip().lower()
    S3_BUCKET = os.getenv('S3_BUCKET')
    S3_REGION = os.getenv('S3_REGION')
    S3_ENDPOINT_URL = os.getenv('S3_ENDPOINT_URL')
    S3_PREFIX = os.getenv('S3_PREFIX', 'midnight')
    if MEDIA_STORAGE_BACKEND not in {'local', 's3'}:
        raise RuntimeError('MEDIA_STORAGE_BACKEND must be local or s3')
    if APP_ENV in {'production', 'prod'} and MEDIA_STORAGE_BACKEND == 'local':
        raise RuntimeError('Production media storage must be configured as s3; local storage is ephemeral')
    if MEDIA_STORAGE_BACKEND == 's3' and not S3_BUCKET:
        raise RuntimeError('S3_BUCKET must be configured when MEDIA_STORAGE_BACKEND=s3')

    RATELIMIT_STORAGE_URI = os.getenv('RATELIMIT_STORAGE_URI', 'memory://')
    RATELIMIT_HEADERS_ENABLED = True
    RATELIMIT_STRATEGY = 'moving-window'
    PROXY_FIX_X_FOR = int(os.getenv('PROXY_FIX_X_FOR', '0'))
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO').upper()
    FRONTEND_DIST_DIR = os.getenv('FRONTEND_DIST_DIR', '')
