"""
routes/favorites.py — Favorites endpoints
"""

from datetime import datetime
from typing import List
from fastapi import APIRouter, HTTPException

from database import get_db
from models import FavoriteCreate

router = APIRouter()

_favorites_store: List[dict] = []


@router.post("/")
async def add_favorite(data: FavoriteCreate):
    doc = {
        "_id":        str(int(datetime.utcnow().timestamp() * 1000)),
        "user_id":    data.user_id,
        "cafe_id":    data.cafe_id,
        "created_at": datetime.utcnow().isoformat(),
    }
    db = get_db()
    if db:
        existing = await db.favorites.find_one({"user_id": data.user_id, "cafe_id": data.cafe_id})
        if existing:
            return {"message": "Already saved", "favorite": existing}
        await db.favorites.insert_one(doc)
    else:
        if not any(f["cafe_id"] == data.cafe_id and f["user_id"] == data.user_id for f in _favorites_store):
            _favorites_store.insert(0, doc)
    return doc


@router.get("/")
async def get_favorites(user_id: str = "local"):
    db = get_db()
    if db:
        cursor = db.favorites.find({"user_id": user_id}).sort("created_at", -1)
        docs = await cursor.to_list(length=200)
        for d in docs:
            d["_id"] = str(d["_id"])
        return {"favorites": docs}
    return {"favorites": [f for f in _favorites_store if f["user_id"] == user_id]}


@router.delete("/{favorite_id}")
async def delete_favorite(favorite_id: str):
    db = get_db()
    if db:
        from bson import ObjectId
        try:
            oid = ObjectId(favorite_id)
        except Exception:
            oid = favorite_id
        result = await db.favorites.delete_one({"_id": oid})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Favorite not found")
        return {"message": "Removed"}
    global _favorites_store
    _favorites_store = [f for f in _favorites_store if f["_id"] != favorite_id]
    return {"message": "Removed"}
