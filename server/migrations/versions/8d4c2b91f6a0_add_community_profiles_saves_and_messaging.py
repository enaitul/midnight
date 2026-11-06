"""add community profiles, saved writings, and conversations

Revision ID: 8d4c2b91f6a0
Revises: 5ea5791ac312
Create Date: 2026-11-06
"""
from alembic import op
import sqlalchemy as sa


revision = '8d4c2b91f6a0'
down_revision = '5ea5791ac312'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users') as batch:
        batch.add_column(sa.Column('display_name', sa.String(length=100), nullable=True))
        batch.add_column(sa.Column('biography', sa.String(length=500), nullable=True))
        batch.add_column(sa.Column('age', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('age_public', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute("UPDATE users SET display_name = username WHERE display_name IS NULL")

    op.create_table(
        'saved_writings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('post_id', sa.Integer(), sa.ForeignKey('posts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('user_id', 'post_id', name='uq_saved_writing_user_post'),
    )
    op.create_index('ix_saved_writings_user_id', 'saved_writings', ['user_id'])
    op.create_index('ix_saved_writings_post_id', 'saved_writings', ['post_id'])

    op.create_table(
        'conversations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('kind', sa.String(length=12), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=True),
        sa.Column('direct_key', sa.String(length=50), nullable=True, unique=True),
        sa.Column('created_by_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_conversations_kind', 'conversations', ['kind'])
    op.create_index('ix_conversations_created_by_id', 'conversations', ['created_by_id'])

    op.create_table(
        'conversation_participants',
        sa.Column('conversation_id', sa.Integer(), sa.ForeignKey('conversations.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('role', sa.String(length=12), nullable=False),
        sa.Column('joined_at', sa.DateTime(), nullable=False),
        sa.Column('last_read_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_conversation_participants_user_id', 'conversation_participants', ['user_id'])

    op.create_table(
        'messages',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('conversation_id', sa.Integer(), sa.ForeignKey('conversations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sender_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('body', sa.String(length=5000), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_messages_conversation_id', 'messages', ['conversation_id'])
    op.create_index('ix_messages_sender_id', 'messages', ['sender_id'])
    op.create_index('ix_messages_conversation_created', 'messages', ['conversation_id', 'created_at'])


def downgrade():
    op.drop_table('messages')
    op.drop_table('conversation_participants')
    op.drop_table('conversations')
    op.drop_table('saved_writings')
    with op.batch_alter_table('users') as batch:
        batch.drop_column('age_public')
        batch.drop_column('age')
        batch.drop_column('biography')
        batch.drop_column('display_name')
