"""Add verified emergency recipients and dispatch audit records.

Revision ID: a2f4c8e7d1b9
Revises: 63775e48fefa
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a2f4c8e7d1b9"
down_revision: Union[str, Sequence[str], None] = "63775e48fefa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    recipient_type = sa.Enum(
        "LOCAL_CONTACT",
        "FIRE_BRIGADE",
        "POLICE",
        "RESCUE_TEAM",
        "AMBULANCE",
        "SITE_OPERATOR",
        "OTHER",
        name="emergencyrecipienttype",
    )
    channel = sa.Enum("EMAIL", "SMS", "VOICE", "WEBHOOK", name="emergencychannel")
    dispatch_status = sa.Enum("PENDING", "SENT", "FAILED", "SKIPPED", name="dispatchstatus")
    recipient_type.create(op.get_bind(), checkfirst=True)
    channel.create(op.get_bind(), checkfirst=True)
    dispatch_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "emergency_recipients",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("organization", sa.String(), nullable=True),
        sa.Column(
            "recipient_type",
            sa.Enum(
                "LOCAL_CONTACT", "FIRE_BRIGADE", "POLICE", "RESCUE_TEAM",
                "AMBULANCE", "SITE_OPERATOR", "OTHER",
                name="emergencyrecipienttype", create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "channel",
            sa.Enum("EMAIL", "SMS", "VOICE", "WEBHOOK", name="emergencychannel", create_type=False),
            nullable=False,
        ),
        sa.Column("endpoint", sa.String(), nullable=False),
        sa.Column("location_latitude", sa.Float(), nullable=True),
        sa.Column("location_longitude", sa.Float(), nullable=True),
        sa.Column("coverage_radius_meters", sa.Float(), nullable=True),
        sa.Column("minimum_severity", sa.Enum("LOW", "MEDIUM", "HIGH", name="alertseverity", create_type=False), nullable=False, server_default="HIGH"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_emergency_recipients_id", "emergency_recipients", ["id"], unique=False)
    op.create_index("ix_emergency_recipients_recipient_type", "emergency_recipients", ["recipient_type"], unique=False)
    op.create_index("ix_emergency_recipients_channel", "emergency_recipients", ["channel"], unique=False)
    op.create_index("ix_emergency_recipients_enabled", "emergency_recipients", ["enabled"], unique=False)
    op.create_index("ix_emergency_recipients_verified", "emergency_recipients", ["verified"], unique=False)
    op.create_index("ix_emergency_recipients_priority", "emergency_recipients", ["priority"], unique=False)

    op.create_table(
        "alert_dispatches",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("alert_id", sa.String(), nullable=False),
        sa.Column("recipient_id", sa.String(), nullable=False),
        sa.Column(
            "channel",
            sa.Enum("EMAIL", "SMS", "VOICE", "WEBHOOK", name="emergencychannel", create_type=False),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("PENDING", "SENT", "FAILED", "SKIPPED", name="dispatchstatus", create_type=False),
            nullable=False,
        ),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("provider_message_id", sa.String(), nullable=True),
        sa.Column("error_message", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["alert_id"], ["alerts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recipient_id"], ["emergency_recipients.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_alert_dispatches_id", "alert_dispatches", ["id"], unique=False)
    op.create_index("ix_alert_dispatches_alert_id", "alert_dispatches", ["alert_id"], unique=False)
    op.create_index("ix_alert_dispatches_recipient_id", "alert_dispatches", ["recipient_id"], unique=False)
    op.create_index("ix_alert_dispatches_status", "alert_dispatches", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_alert_dispatches_status", table_name="alert_dispatches")
    op.drop_index("ix_alert_dispatches_recipient_id", table_name="alert_dispatches")
    op.drop_index("ix_alert_dispatches_alert_id", table_name="alert_dispatches")
    op.drop_index("ix_alert_dispatches_id", table_name="alert_dispatches")
    op.drop_table("alert_dispatches")

    op.drop_index("ix_emergency_recipients_priority", table_name="emergency_recipients")
    op.drop_index("ix_emergency_recipients_verified", table_name="emergency_recipients")
    op.drop_index("ix_emergency_recipients_enabled", table_name="emergency_recipients")
    op.drop_index("ix_emergency_recipients_channel", table_name="emergency_recipients")
    op.drop_index("ix_emergency_recipients_recipient_type", table_name="emergency_recipients")
    op.drop_index("ix_emergency_recipients_id", table_name="emergency_recipients")
    op.drop_table("emergency_recipients")

    sa.Enum("LOW", "MEDIUM", "HIGH", name="alertseverity", create_type=False)
    sa.Enum("PENDING", "SENT", "FAILED", "SKIPPED", name="dispatchstatus").drop(op.get_bind(), checkfirst=True)
    sa.Enum("EMAIL", "SMS", "VOICE", "WEBHOOK", name="emergencychannel").drop(op.get_bind(), checkfirst=True)
    sa.Enum(
        "LOCAL_CONTACT", "FIRE_BRIGADE", "POLICE", "RESCUE_TEAM", "AMBULANCE", "SITE_OPERATOR", "OTHER",
        name="emergencyrecipienttype",
    ).drop(op.get_bind(), checkfirst=True)
