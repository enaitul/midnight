"""Single-process Gunicorn setup for Flask-SocketIO's threading mode."""
import os

bind = f"0.0.0.0:{os.getenv('PORT', '10000')}"
worker_class = 'gthread'
workers = 1  # Flask-SocketIO's Gunicorn deployment requires one worker per instance.
threads = int(os.getenv('GUNICORN_THREADS', '100'))
timeout = int(os.getenv('GUNICORN_TIMEOUT', '120'))
graceful_timeout = 30
accesslog = '-'
errorlog = '-'
loglevel = os.getenv('LOG_LEVEL', 'INFO').lower()
forwarded_allow_ips = os.getenv('GUNICORN_FORWARDED_ALLOW_IPS', '127.0.0.1')
