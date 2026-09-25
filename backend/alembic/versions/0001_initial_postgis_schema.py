"""initial_postgis_schema

Revision ID: 0001_initial_postgis_schema
Revises: 
Create Date: 2026-09-25 20:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import geoalchemy2


# revision identifiers, used by Alembic.
revision: str = '0001_initial_postgis_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Ensure PostGIS extension is installed
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis;")

    # 2. Create thermal_events table
    op.create_table(
        'thermal_events',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('source', sa.String(length=50), nullable=False),
        sa.Column('source_event_id', sa.String(length=100), nullable=True),
        sa.Column('detected_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column(
            'geometry',
            geoalchemy2.types.Geometry(geometry_type='POINT', srid=4326, spatial_index=False, from_text='ST_GeomFromEWKT', name='geometry'),
            nullable=False
        ),
        sa.Column('brightness_temperature', sa.Float(), nullable=True),
        sa.Column('frp', sa.Float(), nullable=True),
        sa.Column('confidence', sa.String(length=20), nullable=True),
        sa.Column('satellite', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_thermal_events_detected_at', 'thermal_events', ['detected_at'], unique=False)
    op.create_index('idx_thermal_events_source', 'thermal_events', ['source'], unique=False)
    op.create_index('idx_thermal_events_source_event_id', 'thermal_events', ['source_event_id'], unique=False)
    op.create_index('idx_thermal_events_geometry', 'thermal_events', ['geometry'], unique=False, postgresql_using='gist')

    # 3. Create industrial_facilities table
    op.create_table(
        'industrial_facilities',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('source', sa.String(length=50), nullable=False),
        sa.Column('source_id', sa.String(length=100), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=True),
        sa.Column('facility_type', sa.String(length=100), nullable=False),
        sa.Column(
            'geometry',
            geoalchemy2.types.Geometry(geometry_type='GEOMETRY', srid=4326, spatial_index=False, from_text='ST_GeomFromEWKT', name='geometry'),
            nullable=False
        ),
        sa.Column('properties', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_industrial_facilities_type', 'industrial_facilities', ['facility_type'], unique=False)
    op.create_index('idx_industrial_facilities_source_id', 'industrial_facilities', ['source_id'], unique=False)
    op.create_index('idx_industrial_facilities_name', 'industrial_facilities', ['name'], unique=False)
    op.create_index('idx_industrial_facilities_geometry', 'industrial_facilities', ['geometry'], unique=False, postgresql_using='gist')

    # 4. Create thermal_event_facility_associations table
    op.create_table(
        'thermal_event_facility_associations',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('thermal_event_id', sa.BigInteger(), nullable=False),
        sa.Column('facility_id', sa.BigInteger(), nullable=False),
        sa.Column('distance_meters', sa.Float(), nullable=False),
        sa.Column('relationship_type', sa.String(length=50), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['facility_id'], ['industrial_facilities.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['thermal_event_id'], ['thermal_events.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('thermal_event_id', 'facility_id', name='uq_thermal_event_facility')
    )
    op.create_index('idx_assoc_thermal_event_id', 'thermal_event_facility_associations', ['thermal_event_id'], unique=False)
    op.create_index('idx_assoc_facility_id', 'thermal_event_facility_associations', ['facility_id'], unique=False)
    op.create_index('idx_assoc_distance', 'thermal_event_facility_associations', ['distance_meters'], unique=False)

    # 5. Create satellite_observations table
    op.create_table(
        'satellite_observations',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('thermal_event_id', sa.BigInteger(), nullable=False),
        sa.Column('satellite', sa.String(length=50), nullable=False),
        sa.Column('product_id', sa.String(length=255), nullable=False),
        sa.Column('acquisition_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('cloud_coverage', sa.Float(), nullable=True),
        sa.Column('extra_metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['thermal_event_id'], ['thermal_events.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_sat_obs_event_id', 'satellite_observations', ['thermal_event_id'], unique=False)
    op.create_index('idx_sat_obs_product_id', 'satellite_observations', ['product_id'], unique=False)
    op.create_index('idx_sat_obs_acquisition', 'satellite_observations', ['satellite', 'acquisition_time'], unique=False)

    # 6. Create event_features table
    op.create_table(
        'event_features',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('thermal_event_id', sa.BigInteger(), nullable=False),
        sa.Column('ndvi', sa.Float(), nullable=True),
        sa.Column('ndbi', sa.Float(), nullable=True),
        sa.Column('swir_ratio', sa.Float(), nullable=True),
        sa.Column('distance_to_facility_meters', sa.Float(), nullable=True),
        sa.Column('nearby_facility_count', sa.Integer(), nullable=True),
        sa.Column('hotspot_frequency_30d', sa.Integer(), nullable=True),
        sa.Column('persistence_days', sa.Float(), nullable=True),
        sa.Column('additional_features', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['thermal_event_id'], ['thermal_events.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('thermal_event_id')
    )
    op.create_index('idx_features_event_id', 'event_features', ['thermal_event_id'], unique=True)

    # 7. Create classifications table
    op.create_table(
        'classifications',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('thermal_event_id', sa.BigInteger(), nullable=False),
        sa.Column('model_name', sa.String(length=100), nullable=False),
        sa.Column('model_version', sa.String(length=50), nullable=False),
        sa.Column('predicted_class', sa.String(length=50), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=False),
        sa.Column('class_probabilities', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('extra_metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('predicted_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['thermal_event_id'], ['thermal_events.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_classifications_event_id', 'classifications', ['thermal_event_id'], unique=False)
    op.create_index('idx_classifications_pred_class', 'classifications', ['predicted_class'], unique=False)
    op.create_index('idx_classifications_model', 'classifications', ['model_name', 'model_version'], unique=False)

    # 8. Create risk_assessments table
    op.create_table(
        'risk_assessments',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('thermal_event_id', sa.BigInteger(), nullable=False),
        sa.Column('risk_score', sa.Float(), nullable=False),
        sa.Column('risk_level', sa.String(length=50), nullable=False),
        sa.Column('explanation', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('assessed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['thermal_event_id'], ['thermal_events.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_risk_event_id', 'risk_assessments', ['thermal_event_id'], unique=False)
    op.create_index('idx_risk_level_score', 'risk_assessments', ['risk_level', 'risk_score'], unique=False)


def downgrade() -> None:
    op.drop_table('risk_assessments')
    op.drop_table('classifications')
    op.drop_table('event_features')
    op.drop_table('satellite_observations')
    op.drop_table('thermal_event_facility_associations')
    op.drop_table('industrial_facilities')
    op.drop_table('thermal_events')
