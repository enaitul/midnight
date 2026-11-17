"""enable row level security on public application tables

Revision ID: f16a8c2d9e41
Revises: e4b9a71c2d63
Create Date: 2026-11-18
"""
from alembic import op


revision = 'f16a8c2d9e41'
down_revision = 'e4b9a71c2d63'
branch_labels = None
depends_on = None


TABLES = (
    'users',
    'posts',
    'post_comments',
    'follows',
    'notifications',
    'alembic_version',
    'saved_writings',
    'conversation_participants',
    'post_likes',
    'post_media',
    'post_comment_likes',
    'message_media',
    'conversations',
    'messages',
)


def upgrade():
    for table in TABLES:
        op.execute(f'ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY')


def downgrade():
    for table in reversed(TABLES):
        op.execute(f'ALTER TABLE public.{table} DISABLE ROW LEVEL SECURITY')
