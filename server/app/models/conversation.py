from datetime import datetime, timezone
from app import db


class Conversation(db.Model):
    __tablename__ = 'conversations'

    id = db.Column(db.Integer, primary_key=True)
    kind = db.Column(db.String(12), nullable=False, default='direct', index=True)
    name = db.Column(db.String(100), nullable=True)
    description = db.Column(db.Text, nullable=True)
    avatar_filename = db.Column(db.String(100), nullable=True)
    direct_key = db.Column(db.String(50), unique=True, nullable=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    participants = db.relationship('ConversationParticipant', back_populates='conversation', cascade='all, delete-orphan')
    messages = db.relationship('Message', back_populates='conversation', cascade='all, delete-orphan', order_by='Message.created_at')


class ConversationParticipant(db.Model):
    __tablename__ = 'conversation_participants'

    conversation_id = db.Column(db.Integer, db.ForeignKey('conversations.id', ondelete='CASCADE'), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    role = db.Column(db.String(12), nullable=False, default='member')
    joined_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    last_read_at = db.Column(db.DateTime, nullable=True)
    last_delivered_message_id = db.Column(db.Integer, nullable=True)
    last_read_message_id = db.Column(db.Integer, nullable=True)

    conversation = db.relationship('Conversation', back_populates='participants')
    user = db.relationship('User', back_populates='conversation_memberships')


class Message(db.Model):
    __tablename__ = 'messages'
    __table_args__ = (db.Index('ix_messages_conversation_created', 'conversation_id', 'created_at'),)

    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey('conversations.id', ondelete='CASCADE'), nullable=False, index=True)
    sender_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    body = db.Column(db.String(5000), nullable=False)
    system_event = db.Column(db.String(40), nullable=True)
    reply_to_id = db.Column(db.Integer, db.ForeignKey('messages.id', ondelete='SET NULL'), nullable=True, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    conversation = db.relationship('Conversation', back_populates='messages')
    sender = db.relationship('User')
    media = db.relationship('MessageMedia', back_populates='message', cascade='all, delete-orphan', order_by='MessageMedia.id')
    reply_to = db.relationship('Message', remote_side=[id], foreign_keys=[reply_to_id])


class MessageMedia(db.Model):
    __tablename__ = 'message_media'

    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.Integer, db.ForeignKey('messages.id', ondelete='CASCADE'), nullable=False, index=True)
    filename = db.Column(db.String(100), nullable=False, unique=True)
    original_name = db.Column(db.String(255), nullable=False)
    media_type = db.Column(db.String(10), nullable=False)
    mime_type = db.Column(db.String(100), nullable=False)
    file_size = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    message = db.relationship('Message', back_populates='media')

    def to_dict(self):
        return {
            'id': self.id,
            'url': f'/api/conversations/media/{self.filename}',
            'original_name': self.original_name,
            'media_type': self.media_type,
            'mime_type': self.mime_type,
            'file_size': self.file_size,
        }
