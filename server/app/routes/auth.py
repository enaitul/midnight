from flask import Blueprint, request, jsonify, g
from app.services.auth_service import register_user, login_user, authenticate_google_user
from app import limiter
from app.utils.auth_middleware import token_required

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')


@auth_bp.route('/register', methods=['POST'])
@limiter.limit('10 per hour')
def register():
    """
    Register with username, email, and password.
    """
    data = request.get_json() or {}
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')

    user, token, error = register_user(username, email, password)
    if error:
        return jsonify({'error': error}), 400

    return jsonify({
        'message': 'Registration successful',
        'user': user.to_dict(),
        'token': token
    }), 201


@auth_bp.route('/login', methods=['POST'])
@limiter.limit('20 per minute')
def login():
    """
    Login with username or email and password.
    """
    data = request.get_json() or {}
    email_or_username = data.get('email_or_username') or data.get('email') or data.get('username')
    password = data.get('password')

    user, token, error = login_user(email_or_username, password)
    if error:
        return jsonify({'error': error}), 401

    return jsonify({
        'message': 'Login successful',
        'user': user.to_dict(),
        'token': token
    }), 200


@auth_bp.route('/google', methods=['POST'])
@limiter.limit('20 per minute')
def google_auth():
    """
    Authenticate using Google ID Token (OAuth 2.0 / OpenID Connect).
    Frontend sends { "credential": "<google_id_token>" }.
    """
    data = request.get_json() or {}
    credential = data.get('credential')

    if not credential:
        return jsonify({'error': 'Google credential token is required'}), 400

    user, token, error = authenticate_google_user(credential)
    if error:
        return jsonify({'error': error}), 401

    return jsonify({
        'message': 'Google authentication successful',
        'user': user.to_dict(),
        'token': token
    }), 200


@auth_bp.route('/me', methods=['GET'])
@token_required
def get_current_user():
    """
    Retrieve current authenticated user profile using application JWT token.
    """
    return jsonify({
        'user': g.current_user.to_dict()
    }), 200

