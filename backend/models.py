"""
models.py — Pydantic schemas for BrewDesk
"""

from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field


# ── Score Breakdown ────────────────────────────────────────
class ScoreBreakdown(BaseModel):
    wifi:     int = 50
    noise:    int = 50
    seating:  int = 50
    charging: int = 50
    cost:     int = 65


# ── Cafe ──────────────────────────────────────────────────
class CafeBase(BaseModel):
    name:          str
    latitude:      float
    longitude:     float
    address:       Optional[str] = None
    study_score:   int = 0
    tags:          List[str] = []
    opening_hours: Optional[str] = None
    phone:         Optional[str] = None
    website:       Optional[str] = None
    wifi:          bool = False
    breakdown:     Optional[ScoreBreakdown] = None


class CafeCreate(CafeBase):
    pass


class Cafe(CafeBase):
    id: Optional[str] = Field(None, alias="_id")

    class Config:
        populate_by_name = True


# ── Review ────────────────────────────────────────────────
class ReviewCreate(BaseModel):
    cafe_id: str
    rating:  int = Field(..., ge=1, le=5)
    review:  str


class Review(ReviewCreate):
    id:         Optional[str] = Field(None, alias="_id")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True


# ── Favorite ──────────────────────────────────────────────
class FavoriteCreate(BaseModel):
    user_id: str = "local"
    cafe_id: str


class Favorite(FavoriteCreate):
    id:         Optional[str] = Field(None, alias="_id")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
