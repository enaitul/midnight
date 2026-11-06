from datetime import datetime, timezone

from app import db


class Notification(db.Model):
    __tablename__ = 'notifications'
    __table_args__ = (db.Index('ix_notifications_recipient_unread', 'recipient_id', 'read_at'),)

    id = db.Column(db.Integer, primary_key=True)
    recipient_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    actor_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    post_id = db.Column(db.Integer, db.ForeignKey('posts.id', ondelete='SET NULL'), nullable=True, index=True)
    kind = db.Column(db.String(16), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    read_at = db.Column(db.DateTime, nullable=True)
    actor = db.relationship('User', foreign_keys=[actor_id])
    post = db.relationship('Post')

    def to_dict(self):
        return {
            'id': self.id,
            'kind': self.kind,
            'created_at': self.created_at.isoformat(),
            'read_at': self.read_at.isoformat() if self.read_at else None,
            'post_id': self.post_id,
            'post_title': self.post.title if self.post and self.post.status == 'published' else None,
            'actor': {
                'id': self.actor.id,
                'username': self.actor.username,
                'display_name': self.actor.display_name or self.actor.username,
                'avatar_url': self.actor.avatar_url,
            },
        }
