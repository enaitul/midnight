"""add per-participant message delivery cursors

Revision ID: 8d3c7a2f91b4
Revises: 5ac1d4c983e7
Create Date: 2026-11-07
"""
from alembic import op
import sqlalchemy as sa


revision = '8d3c7a2f91b4'
down_revision = '5ac1d4c983e7'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('conversation_participants') as batch_op:
        batch_op.add_column(sa.Column('last_delivered_message_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('last_read_message_id', sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table('conversation_participants') as batch_op:
        batch_op.drop_column('last_read_message_id')
        batch_op.drop_column('last_delivered_message_id')
