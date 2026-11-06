import logging
import os
from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException, TooManyRequests
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_socketio import SocketIO
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.middleware.proxy_fix import ProxyFix
from app.config import Config

# Create the database and migration objects outside the factory
# so other files (models, routes) can import them.
db = SQLAlchemy()
migrate = Migrate()
socketio = SocketIO()
limiter = Limiter(key_func=get_remote_address, default_limits=[])


def create_app(test_config=None):
    """
    App Factory: creates and configures the Flask application.

    Why a factory?
    - You can create multiple app instances (useful for testing).
    - Extensions (db, migrate) are initialized with the app, not bound to it globally.
    - Configuration is loaded cleanly in one place.
    """
    app = Flask(__name__)

    # Load settings from our Config class
    app.config.from_object(Config)
    if test_config:
        app.config.update(test_config)
    if app.config.get('APP_ENV') in {'production', 'prod'}:
        app.config.update(DEBUG=False, PROPAGATE_EXCEPTIONS=False, TRAP_HTTP_EXCEPTIONS=False)

    # Initialize extensions with this specific app instance
    logging.basicConfig(level=getattr(logging, app.config['LOG_LEVEL'], logging.INFO),
                        format='%(asctime)s %(levelname)s %(name)s %(message)s')
    if app.config.get('PROXY_FIX_X_FOR', 0) > 0:
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=app.config['PROXY_FIX_X_FOR'], x_proto=1, x_host=0)
    db.init_app(app)
    migrate.init_app(app, db)
    socketio.init_app(app, async_mode='threading', cors_allowed_origins=app.config['SOCKETIO_CORS_ALLOWED_ORIGINS'])
    limiter.init_app(app)
    CORS(app, resources={r'/api/*': {'origins': app.config['CORS_ALLOWED_ORIGINS']}},
         allow_headers=['Authorization', 'Content-Type'], methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])

    # Import models so SQLAlchemy and Flask-Migrate discover them
    from app import models

    # Register route blueprints
    from app.routes.health import health_bp
    from app.routes.auth import auth_bp
    from app.routes.posts import posts_bp
    from app.routes.users import users_bp
    from app.routes.search import search_bp
    from app.routes.conversations import conversations_bp
    from app.routes.notifications import notifications_bp
    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(posts_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(search_bp)
    app.register_blueprint(conversations_bp)
    app.register_blueprint(notifications_bp)

    # Serve the Vite build from the same origin in the production container.
    frontend_dist = app.config.get('FRONTEND_DIST_DIR')
    if frontend_dist and os.path.isdir(frontend_dist):
        @app.get('/')
        def frontend_root():
            return send_from_directory(frontend_dist, 'index.html')

        @app.get('/<path:frontend_path>')
        def frontend_routes(frontend_path):
            if frontend_path.startswith(('api/', 'socket.io')):
                return jsonify({'error': 'Not found'}), 404
            candidate = os.path.join(frontend_dist, frontend_path)
            if os.path.isfile(candidate):
                return send_from_directory(frontend_dist, frontend_path)
            return send_from_directory(frontend_dist, 'index.html')

    @app.errorhandler(Exception)
    def handle_unexpected_error(error):
        if isinstance(error, HTTPException):
            if request.path.startswith('/api/'):
                return jsonify({'error': error.description}), error.code
            return error
        if app.testing:
            raise error
        app.logger.exception('Unhandled application error')
        return jsonify({'error': 'An unexpected server error occurred'}), 500

    @app.errorhandler(TooManyRequests)
    def handle_rate_limit(error):
        response = jsonify({'error': 'Too many attempts. Please wait before trying again.'})
        response.status_code = 429
        retry_after = error.get_response().headers.get('Retry-After')
        if retry_after:
            response.headers['Retry-After'] = retry_after
        return response

    from app import socket_events  # noqa: F401

    return app

