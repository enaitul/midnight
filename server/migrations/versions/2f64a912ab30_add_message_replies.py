"""add message reply references

Revision ID: 2f64a912ab30
Revises: b672a9278ec1
Create Date: 2026-11-07
"""
from alembic import op
import sqlalchemy as sa

revision = '2f64a912ab30'
down_revision = 'b672a9278ec1'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('messages') as batch_op:
        batch_op.add_column(sa.Column('reply_to_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_messages_reply_to_id_messages', 'messages', ['reply_to_id'], ['id'], ondelete='SET NULL')
        batch_op.create_index('ix_messages_reply_to_id', ['reply_to_id'])


def downgrade():
    with op.batch_alter_table('messages') as batch_op:
        batch_op.drop_index('ix_messages_reply_to_id')
        batch_op.drop_constraint('fk_messages_reply_to_id_messages', type_='foreignkey')
        batch_op.drop_column('reply_to_id')
