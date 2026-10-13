"""add_alert_lifecycle_and_expiry

Revision ID: 2a3b4c5d6e7f
Revises: 1da248ebf9b0
Create Date: 2026-10-03 19:18:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2a3b4c5d6e7f'
down_revision: Union[str, Sequence[str], None] = '1da248ebf9b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add EXPIRED to alertstatus Enum in PostgreSQL
    op.execute("ALTER TYPE alertstatus ADD VALUE IF NOT EXISTS 'EXPIRED'")

    # 2. Add last_seen_at and expires_at columns to alerts
    op.add_column('alerts', sa.Column('last_seen_at', sa.DateTime(), nullable=True))
    op.add_column('alerts', sa.Column('expires_at', sa.DateTime(), nullable=True))

    # 3. Create indexes
    op.create_index(op.f('ix_alerts_last_seen_at'), 'alerts', ['last_seen_at'], unique=False)
    op.create_index(op.f('ix_alerts_expires_at'), 'alerts', ['expires_at'], unique=False)

    # 4. Populate default values for existing records
    op.execute("UPDATE alerts SET last_seen_at = created_at WHERE last_seen_at IS NULL")
    op.execute("UPDATE alerts SET expires_at = created_at + interval '24 hours' WHERE expires_at IS NULL")


def downgrade() -> None:
    op.drop_index(op.f('ix_alerts_expires_at'), table_name='alerts')
    op.drop_index(op.f('ix_alerts_last_seen_at'), table_name='alerts')
    op.drop_column('alerts', 'expires_at')
    op.drop_column('alerts', 'last_seen_at')
