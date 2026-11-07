"""add group descriptions and profile pictures

Revision ID: d19b6c4a7e20
Revises: 8d3c7a2f91b4
Create Date: 2026-11-07
"""
from alembic import op
import sqlalchemy as sa


revision = 'd19b6c4a7e20'
down_revision = '8d3c7a2f91b4'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('conversations') as batch_op:
        batch_op.add_column(sa.Column('description', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('avatar_filename', sa.String(length=100), nullable=True))


def downgrade():
    with op.batch_alter_table('conversations') as batch_op:
        batch_op.drop_column('avatar_filename')
        batch_op.drop_column('description')
