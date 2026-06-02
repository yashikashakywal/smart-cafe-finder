"""
routes/cafes.py — Cafe endpoints
"""

import math
import random
import httpx
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from bson import ObjectId

from database import get_db
from models import CafeCreate

router = APIRouter()

OVERPASS_URL = "https://overpass-api.de/api/interpreter"


# ── Helpers ───────────────────────────────────────────────
def haversine(lat1, lng1, lat2, lng2) -> float:
    R = 6371000
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (math.sin(d_lat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(d_lng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def compute_study_score(tags: dict) -> int:
    wifi    = 100 if tags.get("internet_access") in ("wlan", "yes") else (40 if tags.get("internet_access") else 30)
    noise   = 100 if tags.get("quiet") == "yes" else random.randint(40, 80)
    seating = 100 if tags.get("indoor_seating") == "yes" else (80 if tags.get("seating") else 60)
    charge  = 100 if any(tags.get(k) for k in ("socket:type2", "socket:schuko", "socket")) else random.randint(20, 70)
    pr      = tags.get("price_range", "")
    cost    = 100 if pr in ("$", "€") else 70 if pr == "$$" else 40 if pr == "$$$" else 65
    return round(wifi * 0.30 + noise * 0.25 + seating * 0.20 + charge * 0.15 + cost * 0.10)


def compute_tags(tags: dict, score: int) -> list:
    result = []
    if tags.get("internet_access") in ("wlan", "yes"):
        result.append("wifi")
    if score >= 75:
        result.append("coding")
    if score >= 65:
        result.append("study")
    if tags.get("indoor_seating") == "yes":
        result.append("meeting")
    if tags.get("quiet") == "yes":
        result.append("quiet")
    if tags.get("price_range") in ("$", "€"):
        result.append("budget")
    if not result:
        result.append("study" if score >= 70 else "budget")
    return result


def build_address(tags: dict) -> str:
    parts = [
        tags.get("addr:housenumber"),
        tags.get("addr:street"),
        tags.get("addr:suburb"),
        tags.get("addr:city"),
    ]
    return ", ".join(p for p in parts if p) or "Address not available"


def element_to_cafe(el: dict, user_lat: float, user_lng: float) -> Optional[dict]:
    lat = el.get("lat") or el.get("center", {}).get("lat")
    lng = el.get("lon") or el.get("center", {}).get("lon")
    if not lat or not lng:
        return None
    tags = el.get("tags", {})
    score = compute_study_score(tags)
    return {
        "_id":          str(el.get("id", "")),
        "name":         tags.get("name", "Unnamed Cafe"),
        "latitude":     lat,
        "longitude":    lng,
        "address":      build_address(tags),
        "study_score":  score,
        "tags":         compute_tags(tags, score),
        "opening_hours": tags.get("opening_hours"),
        "phone":        tags.get("phone") or tags.get("contact:phone"),
        "website":      tags.get("website") or tags.get("contact:website"),
        "wifi":         tags.get("internet_access") in ("wlan", "yes"),
        "distance":     round(haversine(user_lat, user_lng, lat, lng)),
        "breakdown": {
            "wifi":     100 if tags.get("internet_access") in ("wlan", "yes") else 30,
            "noise":    100 if tags.get("quiet") == "yes" else random.randint(40, 80),
            "seating":  100 if tags.get("indoor_seating") == "yes" else 60,
            "charging": 100 if any(tags.get(k) for k in ("socket:type2", "socket:schuko", "socket")) else random.randint(20, 60),
            "cost":     100 if tags.get("price_range") in ("$", "€") else 65,
        }
    }


# ── Routes ────────────────────────────────────────────────
@router.get("/nearby")
async def get_nearby_cafes(
    lat:    float = Query(..., description="Latitude"),
    lng:    float = Query(..., description="Longitude"),
    radius: int   = Query(1000, ge=100, le=10000, description="Radius in metres"),
):
    """Fetch cafes near the given coordinates via Overpass API."""
    query = f"""
    [out:json][timeout:25];
    (
      node["amenity"="cafe"](around:{radius},{lat},{lng});
      way["amenity"="cafe"](around:{radius},{lat},{lng});
    );
    out body center;
    """
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(OVERPASS_URL, data={"data": query})
            resp.raise_for_status()
            elements = resp.json().get("elements", [])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Overpass API error: {e}")

    cafes = [element_to_cafe(el, lat, lng) for el in elements]
    cafes = [c for c in cafes if c]
    cafes.sort(key=lambda c: c["study_score"], reverse=True)

    # Persist to MongoDB if available
    db = get_db()
    if db:
        for cafe in cafes:
            await db.cafes.update_one(
                {"_id": cafe["_id"]},
                {"$set": cafe},
                upsert=True
            )

    return {"cafes": cafes, "count": len(cafes)}


@router.get("/search")
async def search_cafes(
    q:      str   = Query(..., description="Search query"),
    lat:    float = Query(None),
    lng:    float = Query(None),
    radius: int   = Query(2000),
):
    """Search cafes by name using Nominatim + Overpass."""
    # Geocode query string first
    geocode_url = f"https://nominatim.openstreetmap.org/search?q={q}&format=json&limit=1"
    try:
        async with httpx.AsyncClient(timeout=10, headers={"User-Agent": "BrewDesk/1.0"}) as client:
            geo = await client.get(geocode_url)
            results = geo.json()
        if results:
            lat = float(results[0]["lat"])
            lng = float(results[0]["lon"])
    except Exception:
        pass

    if lat is None or lng is None:
        raise HTTPException(status_code=400, detail="Could not geocode query")

    return await get_nearby_cafes(lat=lat, lng=lng, radius=radius)


@router.get("/{cafe_id}")
async def get_cafe(cafe_id: str):
    """Get a single cafe by ID from MongoDB."""
    db = get_db()
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    cafe = await db.cafes.find_one({"_id": cafe_id})
    if not cafe:
        raise HTTPException(status_code=404, detail="Cafe not found")
    return cafe


@router.post("/")
async def create_cafe(data: CafeCreate):
    """Manually add a cafe."""
    db = get_db()
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")
    doc = data.model_dump()
    result = await db.cafes.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc
