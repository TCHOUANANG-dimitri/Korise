import uuid

from pydantic import BaseModel


class ProductCreate(BaseModel):
    name: str
    quantity: int = 0
    purchase_price: int = 0
    selling_price: int = 0
    minimum_stock: int = 0
    barcode: str | None = None
    category: str | None = None
    is_stockable: bool = True


class ProductUpdate(BaseModel):
    name: str | None = None
    purchase_price: int | None = None
    selling_price: int | None = None
    minimum_stock: int | None = None
    is_active: bool | None = None
    barcode: str | None = None
    category: str | None = None
    is_stockable: bool | None = None


class ProductOut(BaseModel):
    """Full view — owners, or employees with can_view_purchase_prices."""

    id: uuid.UUID
    name: str
    quantity: int
    purchase_price: int
    selling_price: int
    minimum_stock: int
    is_active: bool
    barcode: str | None = None
    category: str | None = None
    is_stockable: bool = True


class ProductOutRestricted(BaseModel):
    """What a regular employee sees: no purchase price, no margin visible."""

    id: uuid.UUID
    name: str
    quantity: int
    selling_price: int
    minimum_stock: int
    is_active: bool
    barcode: str | None = None
    category: str | None = None
    is_stockable: bool = True
