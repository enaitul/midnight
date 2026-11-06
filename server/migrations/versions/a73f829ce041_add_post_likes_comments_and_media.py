"""add post likes, comments, and attached media

Revision ID: a73f829ce041
Revises: 8d4c2b91f6a0
Create Date: 2026-11-06
"""
from alembic import op
import sqlalchemy as sa


revision = 'a73f829ce041'
down_revision = '8d4c2b91f6a0'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'post_likes',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('post_id', sa.Integer(), sa.ForeignKey('posts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('post_id', 'user_id', name='uq_post_like_user'),
    )
    op.create_index('ix_post_likes_post_id', 'post_likes', ['post_id'])
    op.create_index('ix_post_likes_user_id', 'post_likes', ['user_id'])

    op.create_table(
        'post_comments',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('post_id', sa.Integer(), sa.ForeignKey('posts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('body', sa.String(length=2000), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_post_comments_post_id', 'post_comments', ['post_id'])
    op.create_index('ix_post_comments_user_id', 'post_comments', ['user_id'])

    op.create_table(
        'post_media',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('post_id', sa.Integer(), sa.ForeignKey('posts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('filename', sa.String(length=100), nullable=False, unique=True),
        sa.Column('original_name', sa.String(length=255), nullable=False),
        sa.Column('media_type', sa.String(length=10), nullable=False),
        sa.Column('mime_type', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_post_media_post_id', 'post_media', ['post_id'])


def downgrade():
    op.drop_table('post_media')
    op.drop_table('post_comments')
    op.drop_table('post_likes')
