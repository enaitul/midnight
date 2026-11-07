"""add typed group update notices

Revision ID: e4b9a71c2d63
Revises: d19b6c4a7e20
Create Date: 2026-11-07
"""
from alembic import op
import sqlalchemy as sa


revision = 'e4b9a71c2d63'
down_revision = 'd19b6c4a7e20'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('messages') as batch_op:
        batch_op.add_column(sa.Column('system_event', sa.String(length=40), nullable=True))


def downgrade():
    with op.batch_alter_table('messages') as batch_op:
        batch_op.drop_column('system_event')
