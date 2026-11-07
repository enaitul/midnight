from datetime import datetime, timezone
from app import db


def _utc_isoformat(value):
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat()


class Post(db.Model):
    """
    Post model representing articles, poems, essays, and stories.
    Supports draft and published lifecycles.
    """
    __tablename__ = 'posts'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    content = db.Column(db.Text, nullable=False)
    # Publication status: 'draft' or 'published'
    status = db.Column(db.String(20), default='draft', nullable=False, index=True)
    # Timestamp when post was first published (null if draft)
    published_at = db.Column(db.DateTime, nullable=True, index=True)

    author_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    saved_by = db.relationship('SavedWriting', back_populates='post', cascade='all, delete-orphan')
    likes = db.relationship('PostLike', back_populates='post', cascade='all, delete-orphan')
    comments = db.relationship('PostComment', back_populates='post', cascade='all, delete-orphan', order_by='PostComment.created_at')
    media = db.relationship('PostMedia', back_populates='post', cascade='all, delete-orphan', order_by='PostMedia.display_order.asc(), PostMedia.id.asc()')

    def to_dict(self, include_content=True, viewer_id=None):
        """
        Serialize post to dictionary.
        Includes author details for clean frontend consumption.
        """
        from app.models.post_engagement import PostLike, PostComment

        data = {
            'id': self.id,
            'title': self.title,
            'status': self.status,
            'published_at': _utc_isoformat(self.published_at),
            'created_at': _utc_isoformat(self.created_at),
            'updated_at': _utc_isoformat(self.updated_at),
            'author_id': self.author_id,
            'like_count': PostLike.query.filter_by(post_id=self.id).count(),
            'comment_count': PostComment.query.filter_by(post_id=self.id).count(),
            'liked_by_me': bool(viewer_id and PostLike.query.filter_by(post_id=self.id, user_id=viewer_id).first()),
            'media': [item.to_dict() for item in self.media],
            'author': {
                'id': self.author.id,
                'username': self.author.username,
                'display_name': self.author.display_name or self.author.username,
                'avatar_url': self.author.avatar_url,
            } if self.author else None,
        }
        if include_content:
            data['content'] = self.content
        else:
            # Generate a 180-character excerpt for feed view
            clean_text = ' '.join(self.content.split())
            data['excerpt'] = clean_text[:180] + ('...' if len(clean_text) > 180 else '')
        return data

    def __repr__(self):
        return f'<Post {self.title} [{self.status}]>'
