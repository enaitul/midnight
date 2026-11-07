"""add comment likes and conversation message media

Revision ID: b672a9278ec1
Revises: 7444e90efccd
Create Date: 2026-11-07
"""
from alembic import op
import sqlalchemy as sa


revision = 'b672a9278ec1'
down_revision = '7444e90efccd'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'post_comment_likes',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('comment_id', sa.Integer(), sa.ForeignKey('post_comments.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('comment_id', 'user_id', name='uq_post_comment_like_user'),
    )
    op.create_index('ix_post_comment_likes_comment_id', 'post_comment_likes', ['comment_id'])
    op.create_index('ix_post_comment_likes_user_id', 'post_comment_likes', ['user_id'])
    op.create_table(
        'message_media',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('message_id', sa.Integer(), sa.ForeignKey('messages.id', ondelete='CASCADE'), nullable=False),
        sa.Column('filename', sa.String(length=100), nullable=False, unique=True),
        sa.Column('original_name', sa.String(length=255), nullable=False),
        sa.Column('media_type', sa.String(length=10), nullable=False),
        sa.Column('mime_type', sa.String(length=100), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_message_media_message_id', 'message_media', ['message_id'])


def downgrade():
    op.drop_index('ix_message_media_message_id', table_name='message_media')
    op.drop_table('message_media')
    op.drop_index('ix_post_comment_likes_user_id', table_name='post_comment_likes')
    op.drop_index('ix_post_comment_likes_comment_id', table_name='post_comment_likes')
    op.drop_table('post_comment_likes')
