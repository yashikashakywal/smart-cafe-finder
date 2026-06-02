# ☕ BrewDesk — Smart Cafe Finder

> Discover the best cafes for studying, coding, remote work & meetings.

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- MongoDB (optional — app works without it using in-memory fallback)
- A modern web browser

---

## 📁 Project Structure

```
smart-cafe-finder/
├── frontend/
│   ├── index.html      ← Main app UI
│   ├── style.css       ← Dark editorial theme
│   └── script.js       ← All frontend logic
└── backend/
    ├── main.py         ← FastAPI app entry
    ├── database.py     ← MongoDB connection
    ├── models.py       ← Pydantic schemas
    ├── requirements.txt
    ├── .env.example
    └── routes/
        ├── cafes.py    ← /cafes endpoints + Overpass integration
        ├── reviews.py  ← /reviews endpoints
        └── favorites.py ← /favorites endpoints
```

---

## 🔧 Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your MongoDB URL (optional)

# Run the API server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API docs available at: **http://localhost:8000/docs**

> **Note:** MongoDB is optional. If unavailable, the app uses an in-memory store for reviews and favorites.

---

## 🌐 Frontend Setup

The frontend is pure HTML/CSS/JS — no build step required.

**Option 1 — Open directly:**
```
Open frontend/index.html in your browser
```

**Option 2 — Serve locally (recommended for geolocation):**
```bash
cd frontend
python -m http.server 3000
# Visit http://localhost:3000
```

> Geolocation requires HTTPS or localhost. Serving via `http.server` works fine.

---

## 🗺️ External APIs Used

| API | Purpose | Auth |
|-----|---------|------|
| **Overpass API** | Fetch nearby cafes from OpenStreetMap | None |
| **Nominatim API** | Geocode search queries | None |
| **Leaflet.js** | Interactive map rendering | None |
| **OpenStreetMap tiles** | Map tiles | None |

All external APIs are free and require no API key.

---

## 📊 Smart Study Score Formula

```
Study Score = WiFi(30%) + Noise(25%) + Seating(20%) + Charging(15%) + Cost(10%)
```

| Factor | Weight | Source |
|--------|--------|--------|
| WiFi Quality | 30% | OSM `internet_access` tag |
| Noise Level | 25% | OSM `quiet` tag |
| Seating Comfort | 20% | OSM `indoor_seating` tag |
| Charging Points | 15% | OSM socket tags |
| Budget Friendly | 10% | OSM `price_range` tag |

---

## 🏷️ Auto Tags

Cafes are automatically tagged:
- **💻 Coding** — Score ≥ 75
- **📚 Study** — Score ≥ 65
- **🤝 Meeting** — Has indoor seating
- **📶 WiFi** — Has internet access listed
- **🤫 Quiet** — Tagged quiet in OSM
- **💸 Budget** — Price range $ or €

---

## 🔌 API Endpoints

### Cafes
```
GET  /cafes/nearby?lat=&lng=&radius=   # Fetch nearby cafes via Overpass
GET  /cafes/search?q=&lat=&lng=        # Search cafes by location name
GET  /cafes/{id}                       # Get single cafe (from MongoDB)
POST /cafes/                           # Add cafe manually
```

### Reviews
```
POST /reviews/                         # Submit a review
GET  /reviews/{cafe_id}               # Get reviews for a cafe
GET  /reviews/                        # Get all reviews
```

### Favorites
```
POST   /favorites/                    # Save a favorite
GET    /favorites/?user_id=           # Get user's favorites
DELETE /favorites/{id}               # Remove a favorite
```

---

## 🗄️ MongoDB Collections

### `cafes`
```json
{
  "_id": "string (OSM element ID)",
  "name": "string",
  "latitude": "float",
  "longitude": "float",
  "address": "string",
  "study_score": "int (0-100)",
  "tags": ["coding", "study", "wifi"],
  "opening_hours": "string",
  "phone": "string",
  "wifi": "bool",
  "breakdown": { "wifi": 100, "noise": 80, "seating": 90, "charging": 60, "cost": 70 }
}
```

### `reviews`
```json
{
  "_id": "ObjectId",
  "cafe_id": "string",
  "rating": "int (1-5)",
  "review": "string",
  "created_at": "datetime"
}
```

### `favorites`
```json
{
  "_id": "ObjectId",
  "user_id": "string",
  "cafe_id": "string",
  "created_at": "datetime"
}
```

---

## ✨ Features

- 📍 **Browser geolocation** — auto-detects your position
- 🗺️ **Interactive Leaflet map** — color-coded markers by study score
- 🔍 **Search + filter** — by WiFi, charging, quiet, budget, study, coding
- 📏 **Radius slider** — 300m to 5km search radius
- 🏆 **Smart Study Score** — weighted scoring algorithm
- 🔖 **Favorites system** — persisted in localStorage + MongoDB
- ✍️ **Community reviews** — submit & read reviews
- 📱 **Mobile responsive** — collapsible sidebar on small screens
- 🌐 **Works offline** — demo cafes shown when location denied

---

## 🧑‍💻 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, Vanilla JS |
| Map | Leaflet.js + OpenStreetMap |
| Backend | Python 3, FastAPI |
| Database | MongoDB (Motor async driver) |
| Cafe Data | Overpass API (OSM) |
| Geocoding | Nominatim |

---

## 📝 Notes

- The app works **entirely without a backend** — the frontend fetches from Overpass API directly and stores favorites/reviews in `localStorage`.
- When the backend is running, data is additionally persisted to MongoDB.
- OSM data quality varies by location — urban areas have richer cafe data.

---

*Built with ☕ and lots of focus.*
