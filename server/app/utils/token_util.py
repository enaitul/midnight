from datetime import datetime, timezone, timedelta
import jwt
from flask import current_app


def generate_jwt_token(user_id):
    """
    Generate an HMAC-SHA256 signed JSON Web Token (JWT) for an authenticated user.
    PyJWT requires the 'sub' claim to be a string.
    Token expires in 7 days.
    """
    payload = {
        'sub': str(user_id),
        'iat': datetime.now(timezone.utc),
        'exp': datetime.now(timezone.utc) + timedelta(days=7)
    }
    secret_key = current_app.config['SECRET_KEY']
    token = jwt.encode(payload, secret_key, algorithm='HS256')
    return token


def decode_jwt_token(token_str):
    """
    Verify and decode a JSON Web Token.
    Returns (user_id_int, None) if valid, or (None, error_message) if invalid/expired.
    """
    secret_key = current_app.config['SECRET_KEY']
    try:
        payload = jwt.decode(token_str, secret_key, algorithms=['HS256'])
        sub = payload.get('sub')
        return int(sub) if sub is not None else None, None
    except jwt.ExpiredSignatureError:
        return None, 'Token has expired. Please log in again.'
    except jwt.InvalidTokenError:
        return None, 'Invalid authentication token.'
