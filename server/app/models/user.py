from datetime import datetime, timezone
from app import db


class User(db.Model):
    """
    User model representing registered authors/users on midnight.
    Supports both traditional email/password and Google OAuth 2.0 authentication.
    """
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    # password_hash is nullable for users who authenticate via OAuth (Google)
    password_hash = db.Column(db.String(255), nullable=True)
    
    # OAuth provider fields
    # Unique Google 'sub' identifier
    google_id = db.Column(db.String(100), unique=True, nullable=True, index=True)
    # 'local' or 'google'
    auth_provider = db.Column(db.String(20), default='local', nullable=False)
    # Profile picture URL from OAuth provider
    avatar_url = db.Column(db.String(255), nullable=True)
    display_name = db.Column(db.String(100), nullable=True, index=True)
    biography = db.Column(db.String(500), nullable=True)
    age = db.Column(db.Integer, nullable=True)
    age_public = db.Column(db.Boolean, nullable=False, default=False)
    # Email verification status (True for Google accounts, False by default for local accounts)
    email_verified = db.Column(db.Boolean, default=False, nullable=False)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationship: One user can have many posts.
    # 'author' backref allows post.author to access the User object.
    # cascade='all, delete-orphan' ensures deleting a user removes their posts.
    posts = db.relationship('Post', backref='author', lazy=True, cascade='all, delete-orphan')
    saved_writings = db.relationship('SavedWriting', back_populates='user', cascade='all, delete-orphan')
    conversation_memberships = db.relationship('ConversationParticipant', back_populates='user', cascade='all, delete-orphan')

    def to_dict(self):
        """Serialize user object to dictionary (excluding password_hash)."""
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'auth_provider': self.auth_provider,
            'avatar_url': self.avatar_url,
            'display_name': self.display_name or self.username,
            'biography': self.biography,
            'age': self.age,
            'age_public': self.age_public,
            'email_verified': self.email_verified,
            'created_at': self.created_at.isoformat()
        }

    def to_public_dict(self, contribution_count=0):
        data = {
            'id': self.id,
            'username': self.username,
            'display_name': self.display_name or self.username,
            'avatar_url': self.avatar_url,
            'biography': self.biography,
            'contributions': contribution_count,
            'created_at': self.created_at.isoformat(),
        }
        if self.age_public and self.age is not None:
            data['age'] = self.age
        return data

    def __repr__(self):
        return f'<User {self.username}>'
