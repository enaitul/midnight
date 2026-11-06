"""add following and notifications

Revision ID: c846f192db35
Revises: a73f829ce041
Create Date: 2026-11-06
"""
from alembic import op
import sqlalchemy as sa


revision = 'c846f192db35'
down_revision = 'a73f829ce041'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'follows',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('follower_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('followed_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('follower_id', 'followed_id', name='uq_follow_pair'),
        sa.CheckConstraint('follower_id != followed_id', name='ck_follow_not_self'),
    )
    op.create_index('ix_follows_follower_id', 'follows', ['follower_id'])
    op.create_index('ix_follows_followed_id', 'follows', ['followed_id'])

    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('recipient_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('actor_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('post_id', sa.Integer(), sa.ForeignKey('posts.id', ondelete='SET NULL'), nullable=True),
        sa.Column('kind', sa.String(length=16), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('read_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_notifications_recipient_id', 'notifications', ['recipient_id'])
    op.create_index('ix_notifications_actor_id', 'notifications', ['actor_id'])
    op.create_index('ix_notifications_post_id', 'notifications', ['post_id'])
    op.create_index('ix_notifications_recipient_unread', 'notifications', ['recipient_id', 'read_at'])


def downgrade():
    op.drop_table('notifications')
    op.drop_table('follows')
