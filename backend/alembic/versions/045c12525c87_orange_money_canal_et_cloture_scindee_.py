"""orange money canal et cloture scindee en trois

Revision ID: 045c12525c87
Revises: 2688d51a6a13
Create Date: 2026-09-23 06:16:03.928800

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '045c12525c87'
down_revision: Union[str, None] = '2688d51a6a13'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Même pattern que 148cef549c3b pour moneymovementtype : ajoute une valeur à un enum
    # Postgres existant sans le recréer.
    op.execute("ALTER TYPE moneymovementchannel ADD VALUE IF NOT EXISTS 'orange_money'")
    op.add_column('dailyclosing', sa.Column('expected_orange', sa.Integer(), nullable=True))
    op.add_column('dailyclosing', sa.Column('actual_orange', sa.Integer(), nullable=True))
    op.add_column('dailyclosing', sa.Column('difference_orange', sa.Integer(), nullable=True))


def downgrade() -> None:
    # On ne retire pas la valeur d'enum au downgrade (Postgres ne le permet pas
    # directement — il faudrait recréer le type) : même limitation déjà acceptée dans
    # 148cef549c3b pour credit_repayment/moneymovementtype.
    op.drop_column('dailyclosing', 'difference_orange')
    op.drop_column('dailyclosing', 'actual_orange')
    op.drop_column('dailyclosing', 'expected_orange')
