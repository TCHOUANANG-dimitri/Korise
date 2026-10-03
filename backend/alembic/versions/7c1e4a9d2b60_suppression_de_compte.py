"""suppression de compte (employe supprime, entreprise en cours de suppression)

Revision ID: 7c1e4a9d2b60
Revises: 5eb97856a1ad
Create Date: 2026-09-30 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '7c1e4a9d2b60'
down_revision: Union[str, None] = '5eb97856a1ad'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('business', sa.Column('deletion_scheduled_for', sa.DateTime(), nullable=True))
    op.add_column('user', sa.Column('deleted_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('user', 'deleted_at')
    op.drop_column('business', 'deletion_scheduled_for')
