"""
BrewDesk — Smart Cafe Finder
FastAPI Backend — main.py
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from database import connect_db, close_db
from routes import cafes, reviews, favorites


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    yield
    await close_db()


app = FastAPI(
    title="BrewDesk API",
    description="Smart Cafe Finder for Students & Remote Workers",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cafes.router,     prefix="/cafes",     tags=["Cafes"])
app.include_router(reviews.router,   prefix="/reviews",   tags=["Reviews"])
app.include_router(favorites.router, prefix="/favorites", tags=["Favorites"])


@app.get("/", tags=["Health"])
async def root():
    return {"status": "ok", "message": "BrewDesk API is running ☕"}


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy"}
