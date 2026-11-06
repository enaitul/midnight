import re
import random
import string
from werkzeug.security import generate_password_hash, check_password_hash
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from flask import current_app
from app import db
from app.models.user import User
from app.utils.token_util import generate_jwt_token


def _generate_unique_username(base_name):
    """
    Generate a clean, URL-friendly unique username based on Google name or email.
    """
    clean_base = re.sub(r'[^a-zA-Z0-9_]', '', base_name.lower().replace(' ', '_'))
    if not clean_base:
        clean_base = 'writer'
    clean_base = clean_base[:70]

    candidate = clean_base
    while User.query.filter_by(username=candidate).first():
        suffix = ''.join(random.choices(string.digits, k=4))
        candidate = f"{clean_base}_{suffix}"
    return candidate


def register_user(username, email, password):
    """
    Register a new local user with email, username, and password.
    """
    if not username or not email or not password:
        return None, None, 'Username, email, and password are required'

    username = username.strip()
    email = email.strip().lower()

    if len(username) < 3 or len(username) > 80:
        return None, None, 'Username must be between 3 and 80 characters'

    if len(password) < 6:
        return None, None, 'Password must be at least 6 characters long'

    email_regex = r'^[\w\.-]+@[\w\.-]+\.\w+$'
    if not re.match(email_regex, email):
        return None, None, 'Invalid email format'

    if User.query.filter_by(username=username).first():
        return None, None, 'Username is already taken'

    if User.query.filter_by(email=email).first():
        return None, None, 'Email is already registered'

    hashed_password = generate_password_hash(password)

    new_user = User(
        username=username,
        email=email,
        password_hash=hashed_password,
        auth_provider='local',
        email_verified=False
    )

    db.session.add(new_user)
    db.session.commit()

    token = generate_jwt_token(new_user.id)
    return new_user, token, None


def login_user(email_or_username, password):
    """
    Authenticate a user with username/email and password.
    """
    if not email_or_username or not password:
        return None, None, 'Username/Email and password are required'

    identifier = email_or_username.strip()
    user = User.query.filter(
        (User.email == identifier.lower()) | (User.username == identifier)
    ).first()

    if not user:
        return None, None, 'Invalid username or password'

    if not user.password_hash:
        return None, None, 'This account was created with Google Sign-In. Please sign in with Google.'

    if not check_password_hash(user.password_hash, password):
        return None, None, 'Invalid username or password'

    token = generate_jwt_token(user.id)
    return user, token, None


def authenticate_google_user(credential_id_token):
    """
    Verify Google ID Token independently using Google's public certificates,
    enforcing issuer, audience (Client ID), and expiration validation.
    Performs safe account linking and issues midnight JWT.
    """
    if not credential_id_token:
        return None, None, 'Google credential token is missing'

    google_client_id = current_app.config.get('GOOGLE_CLIENT_ID')
    if not google_client_id:
        return None, None, 'Server Google Client ID is not configured'

    try:
        # Cryptographically verifies signature, expiry, and audience using Google public certs.
        # clock_skew_in_seconds accounts for any system clock drift / timezone desynchronization.
        id_info = id_token.verify_oauth2_token(
            credential_id_token,
            google_requests.Request(),
            google_client_id,
            # Keep the accepted drift small; a multi-hour window weakens exp checks.
            clock_skew_in_seconds=60
        )
    except ValueError:
        return None, None, 'Invalid or expired Google credential'
    except Exception:
        current_app.logger.exception('Google authentication provider request failed')
        return None, None, 'Google authentication could not be completed'

    # Validate issuer
    if id_info.get('iss') not in ['accounts.google.com', 'https://accounts.google.com']:
        return None, None, 'Untrusted Google token issuer'

    google_sub = id_info.get('sub')
    email = id_info.get('email', '').lower()
    email_verified = id_info.get('email_verified', False)
    name = id_info.get('name') or email.split('@')[0]
    picture = id_info.get('picture')

    if not google_sub or not email:
        return None, None, 'Incomplete Google account profile'

    # Case 1: Existing user with matching Google ID
    user = User.query.filter_by(google_id=google_sub).first()
    if user:
        if picture and user.avatar_url != picture:
            user.avatar_url = picture
            db.session.commit()
        token = generate_jwt_token(user.id)
        return user, token, None

    # Case 2: User exists with this email address
    user_by_email = User.query.filter_by(email=email).first()
    if user_by_email:
        # Security Policy for Account Linking:
        # Only automatically link if Google has verified this email AND
        # the existing account email is verified or user confirmed.
        # If the local account is unverified, linking directly creates an account takeover vulnerability.
        if not email_verified:
            return None, None, 'Google email is not verified. Account linking rejected.'

        # A Google-verified address alone cannot prove control of a pre-existing
        # local account that has no email-verification flow. Linking would leave
        # the original local password as a second way into the account.
        if not user_by_email.email_verified:
            return None, None, 'This email belongs to an unverified account. Sign in with that account first.'

        # Link only when both providers confirm control of the existing account.
        user_by_email.google_id = google_sub
        if picture and not user_by_email.avatar_url:
            user_by_email.avatar_url = picture
        db.session.commit()
        token = generate_jwt_token(user_by_email.id)
        return user_by_email, token, None

    # Case 3: Completely new user registering via Google
    unique_username = _generate_unique_username(name)
    new_user = User(
        username=unique_username,
        email=email,
        password_hash=None,
        google_id=google_sub,
        auth_provider='google',
        avatar_url=picture,
        email_verified=email_verified
    )

    db.session.add(new_user)
    db.session.commit()

    token = generate_jwt_token(new_user.id)
    return new_user, token, None

