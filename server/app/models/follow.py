from datetime import datetime, timezone

from app import db


class Follow(db.Model):
    __tablename__ = 'follows'
    __table_args__ = (
        db.UniqueConstraint('follower_id', 'followed_id', name='uq_follow_pair'),
        db.CheckConstraint('follower_id != followed_id', name='ck_follow_not_self'),
    )

    id = db.Column(db.Integer, primary_key=True)
    follower_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    followed_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    follower = db.relationship('User', foreign_keys=[follower_id])
    followed = db.relationship('User', foreign_keys=[followed_id])
