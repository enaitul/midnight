from datetime import datetime, timezone
from app import db


class SavedWriting(db.Model):
    __tablename__ = 'saved_writings'
    __table_args__ = (db.UniqueConstraint('user_id', 'post_id', name='uq_saved_writing_user_post'),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    post_id = db.Column(db.Integer, db.ForeignKey('posts.id', ondelete='CASCADE'), nullable=False, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    user = db.relationship('User', back_populates='saved_writings')
    post = db.relationship('Post', back_populates='saved_by')
