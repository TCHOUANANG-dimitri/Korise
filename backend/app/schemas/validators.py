"""Validations partagées des champs numériques saisis par l'utilisateur (téléphone, PIN).

Les apps filtrent déjà la saisie, mais le serveur reste la seule barrière fiable : un client
ancien ou un appel direct à l'API ne doit pas pouvoir enregistrer « abc » comme téléphone.
"""

import re
from typing import Annotated

from pydantic import AfterValidator, BeforeValidator, Field

_PHONE_SEPARATORS = re.compile(r"[\s.\-()]")
_PHONE = re.compile(r"\+?[0-9]{6,15}")


def normalize_phone(value: str | None) -> str | None:
    """Retire les séparateurs usuels (espaces, points, tirets, parenthèses). Vide → None."""
    if value is None:
        return None
    cleaned = _PHONE_SEPARATORS.sub("", value)
    return cleaned or None


def _check_phone(value: str | None) -> str | None:
    if value is not None and not _PHONE.fullmatch(value):
        raise ValueError("Numéro de téléphone invalide : chiffres uniquement (6 à 15), « + » autorisé au début.")
    return value


Phone = Annotated[str | None, BeforeValidator(normalize_phone), AfterValidator(_check_phone)]
"""Téléphone optionnel, normalisé (sans séparateurs) puis validé."""

RequiredPhone = Annotated[str, BeforeValidator(normalize_phone), AfterValidator(_check_phone)]
"""Téléphone obligatoire (récupération du code entreprise)."""

NewPin = Annotated[str, Field(min_length=4, max_length=8, pattern=r"^[0-9]+$")]
"""PIN à la création : 4 à 8 chiffres. La connexion n'applique pas ce format (PIN existants)."""


def _drop_invalid_phone(value: str | None) -> str | None:
    return value if value is None or _PHONE.fullmatch(value) else None


LenientPhone = Annotated[str | None, BeforeValidator(normalize_phone), AfterValidator(_drop_invalid_phone)]
"""Pour `/sync/push` : un téléphone invalide est ignoré (None) plutôt que refusé — un 422
bloquerait toute la file d'événements hors-ligne de l'appareil pour un champ optionnel."""
