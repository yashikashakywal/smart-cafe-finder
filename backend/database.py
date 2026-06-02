"""
database.py — MongoDB connection using Motor (async)
"""

import os
import certifi 
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

MONGO_URL = os.getenv("MONGO_URL")
DB_NAME   = os.getenv("DB_NAME",   "brewdesk")

client = None
db     = None


async def connect_db():
    global client, db
    try:
        client = AsyncIOMotorClient(
            MONGO_URL,
            serverSelectionTimeoutMS=5000,
            tls=True,
            tlsCAFile=certifi.where()  # fixes SSL handshake error
        )
        await client.admin.command("ping")
        db = client[DB_NAME]
        print(f"✅  MongoDB connected → {DB_NAME}")
    except Exception as e:
        print(f"⚠️  MongoDB not available ({e}). Running in mock mode.")
        client = None
        db     = None


async def close_db():
    global client
    if client:
        client.close()


def get_db():
    return db
