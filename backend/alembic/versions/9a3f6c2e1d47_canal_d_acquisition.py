"""canal d'acquisition a l'inscription (liens tracables de la landing page)

Revision ID: 9a3f6c2e1d47
Revises: 7c1e4a9d2b60
Create Date: 2026-10-07 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '9a3f6c2e1d47'
down_revision: Union[str, None] = '7c1e4a9d2b60'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('business', sa.Column('signup_source', sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade() -> None:
    op.drop_column('business', 'signup_source')
