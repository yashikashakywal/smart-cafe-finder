"""
database.py — MongoDB connection using Motor (async)
"""

import os
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME   = os.getenv("DB_NAME",   "brewdesk")

client: AsyncIOMotorClient = None
db = None


async def connect_db():
    global client, db
    try:
        client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=5000)
        await client.admin.command("ping")
        db = client[DB_NAME]
        print(f"✅  MongoDB connected → {MONGO_URL}/{DB_NAME}")
    except Exception as e:
        print(f"⚠️  MongoDB not available ({e}). Running in mock mode.")
        client = None
        db = None


async def close_db():
    global client
    if client:
        client.close()
        print("MongoDB connection closed.")


def get_db():
    return db
