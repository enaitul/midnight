from functools import wraps
from flask import request, jsonify, g
from app import db
from app.utils.token_util import decode_jwt_token
from app.models.user import User


def token_required(f):
    """
    Decorator to protect routes requiring authentication.
    Expects Authorization: Bearer <jwt_token> in headers.
    Attaches the authenticated user to Flask's context `g.current_user`.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({'error': 'Authorization header is missing'}), 401

        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != 'bearer':
            return jsonify({'error': 'Invalid Authorization format. Expected Bearer <token>'}), 401

        token = parts[1]
        user_id, error = decode_jwt_token(token)
        if error:
            return jsonify({'error': error}), 401

        user = db.session.get(User, user_id)
        if not user:
            return jsonify({'error': 'User not found or account deactivated'}), 401

        g.current_user = user
        return f(*args, **kwargs)

    return decorated

