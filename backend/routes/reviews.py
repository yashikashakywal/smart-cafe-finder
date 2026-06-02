"""
routes/reviews.py — Review endpoints
"""

from datetime import datetime
from typing import List
from fastapi import APIRouter, HTTPException

from database import get_db
from models import ReviewCreate

router = APIRouter()

# In-memory fallback when MongoDB is unavailable
_reviews_store: List[dict] = []


@router.post("/")
async def create_review(data: ReviewCreate):
    doc = {
        "_id":        str(int(datetime.utcnow().timestamp() * 1000)),
        "cafe_id":    data.cafe_id,
        "rating":     data.rating,
        "review":     data.review,
        "created_at": datetime.utcnow().isoformat(),
    }
    db = get_db()
    if db:
        await db.reviews.insert_one(doc)
    else:
        _reviews_store.insert(0, doc)
    return doc


@router.get("/{cafe_id}")
async def get_reviews(cafe_id: str):
    db = get_db()
    if db:
        cursor = db.reviews.find({"cafe_id": cafe_id}).sort("created_at", -1)
        docs = await cursor.to_list(length=100)
        for d in docs:
            d["_id"] = str(d["_id"])
        return {"reviews": docs}
    # fallback
    return {"reviews": [r for r in _reviews_store if r["cafe_id"] == cafe_id]}


@router.get("/")
async def get_all_reviews():
    db = get_db()
    if db:
        cursor = db.reviews.find().sort("created_at", -1).limit(100)
        docs = await cursor.to_list(length=100)
        for d in docs:
            d["_id"] = str(d["_id"])
        return {"reviews": docs}
    return {"reviews": _reviews_store}
