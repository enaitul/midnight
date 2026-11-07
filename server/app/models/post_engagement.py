from datetime import datetime, timezone

from app import db


class PostLike(db.Model):
    __tablename__ = 'post_likes'
    __table_args__ = (db.UniqueConstraint('post_id', 'user_id', name='uq_post_like_user'),)

    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey('posts.id', ondelete='CASCADE'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    post = db.relationship('Post', back_populates='likes')


class PostComment(db.Model):
    __tablename__ = 'post_comments'

    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey('posts.id', ondelete='CASCADE'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    body = db.Column(db.String(2000), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    post = db.relationship('Post', back_populates='comments')
    author = db.relationship('User')

    def to_dict(self):
        return {
            'id': self.id,
            'post_id': self.post_id,
            'user_id': self.user_id,
            'body': self.body,
            'created_at': self.created_at.isoformat(),
            'author': {
                'id': self.author.id,
                'username': self.author.username,
                'display_name': self.author.display_name or self.author.username,
                'avatar_url': self.author.avatar_url,
            },
        }


class PostCommentLike(db.Model):
    __tablename__ = 'post_comment_likes'
    __table_args__ = (db.UniqueConstraint('comment_id', 'user_id', name='uq_post_comment_like_user'),)

    id = db.Column(db.Integer, primary_key=True)
    comment_id = db.Column(db.Integer, db.ForeignKey('post_comments.id', ondelete='CASCADE'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    comment = db.relationship('PostComment', backref=db.backref('likes', cascade='all, delete-orphan'))
    user = db.relationship('User')


class PostMedia(db.Model):
    __tablename__ = 'post_media'

    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey('posts.id', ondelete='CASCADE'), nullable=False, index=True)
    filename = db.Column(db.String(100), nullable=False, unique=True)
    original_name = db.Column(db.String(255), nullable=False)
    media_type = db.Column(db.String(10), nullable=False)
    mime_type = db.Column(db.String(100), nullable=False)
    file_size = db.Column(db.Integer, nullable=False, default=0)
    display_order = db.Column(db.Integer, nullable=False, default=0, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    post = db.relationship('Post', back_populates='media')

    def to_dict(self):
        return {
            'id': self.id,
            'url': f'/api/posts/media/{self.filename}',
            'original_name': self.original_name,
            'media_type': self.media_type,
            'mime_type': self.mime_type,
            'file_size': self.file_size,
            'display_order': self.display_order,
        }
