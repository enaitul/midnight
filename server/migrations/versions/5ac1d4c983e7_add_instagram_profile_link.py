"""add Instagram profile links

Revision ID: 5ac1d4c983e7
Revises: 2f64a912ab30
Create Date: 2026-11-07
"""
from alembic import op
import sqlalchemy as sa

revision = '5ac1d4c983e7'
down_revision = '2f64a912ab30'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users') as batch_op:
        batch_op.add_column(sa.Column('instagram_url', sa.String(length=2048), nullable=True))


def downgrade():
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('instagram_url')
