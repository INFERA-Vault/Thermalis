"""add_unique_constraint_to_industrial_facilities

Revision ID: 41780c86c81c
Revises: 0001_initial_postgis_schema
Create Date: 2026-09-27 21:35:11.173188

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '41780c86c81c'
down_revision: Union[str, Sequence[str], None] = '0001_initial_postgis_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_unique_constraint('uq_facility_source', 'industrial_facilities', ['source', 'source_id'])

def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('uq_facility_source', 'industrial_facilities', type_='unique')
