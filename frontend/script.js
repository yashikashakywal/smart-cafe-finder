/* =========================================================
   BrewDesk — Smart Cafe Finder
   script.js — All frontend logic
   ========================================================= */

'use strict';

// ── Config ────────────────────────────────────────────────
const API = 'https://smart-cafe-finder.onrender.com';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const NOMINATIM = 'https://nominatim.openstreetmap.org';

// ── State ─────────────────────────────────────────────────
let userLat = null, userLng = null;
let allCafes = [];
let filteredCafes = [];
let map, userMarker, cafeMarkers = [];
let favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
let reviews   = JSON.parse(localStorage.getItem('reviews')   || '[]');
let currentRating = 0;

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  renderFavorites();
  renderAllReviews();
  locateUser();
});

// ─────────────────────────────────────────────────────────
// MAP
// ─────────────────────────────────────────────────────────
function initMap() {
  map = L.map('map', { zoomControl: true }).setView([20, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);
}

function panMap(lat, lng, zoom = 15) {
  map.setView([lat, lng], zoom);
}

function addUserMarker(lat, lng) {
  if (userMarker) map.removeLayer(userMarker);
  const icon = L.divIcon({
    className: '',
    html: `<div style="
      width:18px;height:18px;border-radius:50%;
      background:#d4933a;border:3px solid #fff;
      box-shadow:0 0 0 4px rgba(212,147,58,.3),0 3px 8px rgba(0,0,0,.5);
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
  userMarker = L.marker([lat, lng], { icon }).addTo(map);
  userMarker.bindPopup('<div style="color:#0e0c0a;font-family:sans-serif;font-weight:600;font-size:13px;">📍 You are here</div>');
}

function clearCafeMarkers() {
  cafeMarkers.forEach(m => map.removeLayer(m));
  cafeMarkers = [];
}

function addCafeMarkers(cafes) {
  clearCafeMarkers();
  cafes.forEach(c => {
    const score = c.study_score || 0;
    const color = score >= 80 ? '#5cb85c' : score >= 60 ? '#f0ad4e' : '#d9534f';
    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width:34px;height:34px;border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        background:${color};
        border:2px solid rgba(0,0,0,.3);
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 3px 10px rgba(0,0,0,.5);
      "><span style="transform:rotate(45deg);font-family:'Syne',sans-serif;font-weight:800;font-size:12px;color:#0e0c0a;">${score}</span></div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 34]
    });
    const m = L.marker([c.latitude, c.longitude], { icon }).addTo(map);
    m.bindPopup(`
      <div>
        <div class="popup-name">${c.name}</div>
        <div class="popup-score">Study Score: <strong>${score}/100</strong></div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">${(c.tags||[]).map(t => `<span class="tag tag-${t}">${tagEmoji(t)} ${t}</span>`).join('')}</div>
        <button class="popup-btn" onclick="openModal('${c._id}')">View Details</button>
      </div>
    `);
    cafeMarkers.push(m);
  });
}

// ─────────────────────────────────────────────────────────
// LOCATION
// ─────────────────────────────────────────────────────────
async function locateUser() {
  setLocationStatus('Detecting location…', 'pulse');
  if (!navigator.geolocation) {
    setLocationStatus('Geolocation not supported', 'error');
    toast('⚠️ Geolocation not supported');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    async pos => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      panMap(userLat, userLng, 15);
      addUserMarker(userLat, userLng);
      setLocationStatus('Location found ✓', 'active');
      await fetchNearbyCafes();
    },
    err => {
      setLocationStatus('Location denied', 'error');
      toast('❌ Location access denied. Showing demo cafes.');
      loadDemoCafes();
    },
    { timeout: 10000, enableHighAccuracy: true }
  );
}

function setLocationStatus(text, cls) {
  const el = document.getElementById('locationStatus');
  const dot = el.querySelector('.dot');
  el.querySelector('.dot').className = 'dot';
  if (cls) dot.classList.add(cls);
  el.lastChild.textContent = ' ' + text;
}

// ─────────────────────────────────────────────────────────
// OVERPASS FETCH
// ─────────────────────────────────────────────────────────
async function fetchNearbyCafes() {
  const radius = document.getElementById('radiusSlider').value;
  showListLoading();

  // Try backend first
  try {
    const r = await fetch(`${API}/cafes/nearby?lat=${userLat}&lng=${userLng}&radius=${radius}`);
    if (r.ok) {
      const data = await r.json();
      if (data.cafes && data.cafes.length > 0) {
        allCafes = data.cafes;
        applyFiltersAndRender();
        return;
      }
    }
  } catch (_) {}

  // Fallback to Overpass API directly
  try {
    const query = `
      [out:json][timeout:25];
      (
        node["amenity"="cafe"](around:${radius},${userLat},${userLng});
        way["amenity"="cafe"](around:${radius},${userLat},${userLng});
      );
      out body center;
    `;
    const r = await fetch(OVERPASS, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`
    });
    const data = await r.json();
    allCafes = enrichCafes(data.elements || []);
    applyFiltersAndRender();
  } catch (e) {
    toast('⚠️ Could not fetch cafes. Showing demo data.');
    loadDemoCafes();
  }
}

function enrichCafes(elements) {
  return elements.map((el, i) => {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!lat || !lng) return null;
    const tags = el.tags || {};
    const name = tags.name || `Cafe #${i + 1}`;
    const score = computeStudyScore(tags);
    const cafeTags = computeTags(tags, score);
    return {
      _id: el.id?.toString() || `demo-${i}`,
      name,
      latitude: lat,
      longitude: lng,
      address: buildAddress(tags),
      study_score: score,
      tags: cafeTags,
      opening_hours: tags.opening_hours || null,
      phone: tags.phone || tags['contact:phone'] || null,
      website: tags.website || tags['contact:website'] || null,
      wifi: tags.internet_access === 'wlan' || tags.internet_access === 'yes',
      charging: tags['socket:type2'] || tags['socket:schuko'] || tags.socket || null,
      distance: userLat ? haversine(userLat, userLng, lat, lng) : null,
      breakdown: computeBreakdown(tags)
    };
  }).filter(Boolean);
}

function computeStudyScore(tags) {
  const wifi    = (tags.internet_access === 'wlan' || tags.internet_access === 'yes') ? 100 : (tags.internet_access ? 40 : 30);
  const noise   = tags.quiet === 'yes' ? 100 : tags.noise ? 40 : Math.floor(Math.random()*40)+40;
  const seating = tags.indoor_seating === 'yes' ? 100 : tags.seating ? 80 : 60;
  const charge  = (tags['socket:type2'] || tags['socket:schuko'] || tags.socket) ? 100 : Math.floor(Math.random()*50)+20;
  const cost    = tags.price_range === '$' || tags.price_range === '€' ? 100
                : tags.price_range === '$$' ? 70
                : tags.price_range === '$$$' ? 40 : 65;

  return Math.round(wifi*0.30 + noise*0.25 + seating*0.20 + charge*0.15 + cost*0.10);
}

function computeBreakdown(tags) {
  return {
    wifi:     (tags.internet_access === 'wlan' || tags.internet_access === 'yes') ? 100 : 30,
    noise:    tags.quiet === 'yes' ? 100 : Math.floor(Math.random()*40)+40,
    seating:  tags.indoor_seating === 'yes' ? 100 : 60,
    charging: (tags['socket:type2'] || tags['socket:schuko']) ? 100 : Math.floor(Math.random()*50)+20,
    cost:     tags.price_range === '$' ? 100 : tags.price_range === '$$' ? 70 : 65
  };
}

function computeTags(tags, score) {
  const result = [];
  if (tags.internet_access === 'wlan' || tags.internet_access === 'yes') result.push('wifi');
  if (score >= 75) result.push('coding');
  if (score >= 65) result.push('study');
  if (tags.indoor_seating === 'yes') result.push('meeting');
  if (tags.quiet === 'yes') result.push('quiet');
  if (tags.price_range === '$' || tags.price_range === '€') result.push('budget');
  if (!result.length) result.push(score >= 70 ? 'study' : 'budget');
  return result;
}

function buildAddress(tags) {
  const parts = [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:suburb'],
    tags['addr:city']
  ].filter(Boolean);
  return parts.join(', ') || 'Address not available';
}

// ─────────────────────────────────────────────────────────
// FILTERS & RENDER
// ─────────────────────────────────────────────────────────
function filterCafes() { applyFiltersAndRender(); }

function applyFiltersAndRender() {
  const query   = document.getElementById('searchInput').value.toLowerCase();
  const checked = [...document.querySelectorAll('.filter-chips input:checked')].map(i => i.value);

  filteredCafes = allCafes.filter(c => {
    if (query && !c.name.toLowerCase().includes(query) && !(c.address||'').toLowerCase().includes(query)) return false;
    if (checked.length && !checked.every(tag => (c.tags||[]).includes(tag))) return false;
    return true;
  });

  sortCafes(false);
  renderCafeList();
  addCafeMarkers(filteredCafes);
  document.getElementById('cafeCount').textContent = `${filteredCafes.length} cafe${filteredCafes.length !== 1 ? 's' : ''} found`;
}

function sortCafes(rerender = true) {
  const v = document.getElementById('sortSelect').value;
  filteredCafes.sort((a, b) => {
    if (v === 'score')    return (b.study_score||0) - (a.study_score||0);
    if (v === 'distance') return (a.distance||Infinity) - (b.distance||Infinity);
    if (v === 'rating')   return avgRating(b._id) - avgRating(a._id);
    return 0;
  });
  if (rerender) renderCafeList();
}

function renderCafeList() {
  const list = document.getElementById('cafeList');
  if (!filteredCafes.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>No cafes match your filters.</p></div>`;
    return;
  }
  list.innerHTML = filteredCafes.map(c => cafeCardHTML(c, 'mini')).join('');
}

function cafeCardHTML(c, mode = 'mini') {
  const score     = c.study_score || 0;
  const scoreClass = score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low';
  const isFav    = favorites.some(f => f._id === c._id);
  const dist     = c.distance != null ? `${c.distance < 1000 ? Math.round(c.distance) + 'm' : (c.distance/1000).toFixed(1) + 'km'}` : '';
  const tagHTML  = (c.tags||[]).map(t => `<span class="tag tag-${t}">${tagEmoji(t)} ${t}</span>`).join('');
  const rating   = avgRating(c._id);
  const stars    = rating ? '★'.repeat(Math.round(rating)) + '☆'.repeat(5-Math.round(rating)) : '';

  return `<div class="cafe-card" onclick="openModal('${c._id}')">
    <div class="card-row1">
      <div class="cafe-name">${c.name}</div>
      <div class="score-badge ${scoreClass}">${score}</div>
    </div>
    <div class="cafe-address">${c.address || 'Address not listed'}</div>
    <div class="card-tags">${tagHTML}</div>
    <div class="score-bar-wrap">
      <div class="score-bar-label"><span>Study Score</span><span>${score}/100</span></div>
      <div class="score-bar-track"><div class="score-bar-fill" style="width:${score}%"></div></div>
    </div>
    <div class="card-meta" style="margin-top:10px;">
      <span>
        ${dist ? `<span class="distance">📍 ${dist}</span>` : ''}
        ${stars ? `<span style="color:#d4933a;font-size:12px;margin-left:8px;">${stars}</span>` : ''}
      </span>
      <button class="fav-btn ${isFav?'saved':''}" onclick="toggleFavorite(event,'${c._id}')" title="${isFav?'Remove from saved':'Save cafe'}">
        ${isFav ? '🔖' : '🔖'}
      </button>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────────────────
function openModal(id) {
  const c = [...allCafes, ...favorites].find(x => x._id === id);
  if (!c) return;

  const score = c.study_score || 0;
  const scoreClass = score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low';
  const bd = c.breakdown || {};
  const isFav = favorites.some(f => f._id === c._id);
  const cafeReviews = reviews.filter(r => r.cafe_id === id);
  const tagHTML = (c.tags||[]).map(t => `<span class="tag tag-${t}">${tagEmoji(t)} ${t}</span>`).join('');

  const reviewsHTML = cafeReviews.length
    ? cafeReviews.map(r => `
        <div class="review-item">
          <div class="review-item-head">
            <span class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span>
            <span class="review-date">${new Date(r.created_at).toLocaleDateString()}</span>
          </div>
          <div class="review-text">${r.review}</div>
        </div>`).join('')
    : '<div style="color:var(--text-dim);font-size:14px;">No reviews yet. Be the first!</div>';

  document.getElementById('modalContent').innerHTML = `
    <div class="modal-body">
      <div class="modal-cafe-name">${c.name}</div>
      <div class="modal-address">📍 ${c.address || 'Address not available'}</div>

      <div class="modal-score-section">
        <div class="modal-score-heading">Smart Study Score</div>
        <div class="big-score ${scoreClass}">${score}<span style="font-size:24px;opacity:.6;">/100</span></div>
        <div class="score-sub">Based on WiFi, noise, seating, charging & cost</div>
        <div class="score-breakdown">
          ${scoreRow('📶 WiFi Quality', bd.wifi||30, 30)}
          ${scoreRow('🤫 Noise Level', bd.noise||60, 25)}
          ${scoreRow('🪑 Seating Comfort', bd.seating||60, 20)}
          ${scoreRow('🔌 Charging Points', bd.charging||40, 15)}
          ${scoreRow('💸 Budget Friendly', bd.cost||65, 10)}
        </div>
      </div>

      <div class="modal-tags">${tagHTML}</div>

      <div class="modal-info-grid">
        <div class="info-cell">
          <div class="info-cell-label">Distance</div>
          <div class="info-cell-value">${c.distance != null ? (c.distance < 1000 ? Math.round(c.distance)+'m' : (c.distance/1000).toFixed(1)+'km') : '—'}</div>
        </div>
        <div class="info-cell">
          <div class="info-cell-label">Opening Hours</div>
          <div class="info-cell-value" style="font-size:12px;">${c.opening_hours || 'Not listed'}</div>
        </div>
        <div class="info-cell">
          <div class="info-cell-label">Phone</div>
          <div class="info-cell-value">${c.phone || '—'}</div>
        </div>
        <div class="info-cell">
          <div class="info-cell-label">WiFi</div>
          <div class="info-cell-value">${c.wifi ? '✅ Available' : '❓ Unknown'}</div>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn-primary" onclick="toggleFavorite(null,'${c._id}');document.querySelector('#modalCard .modal-actions button:first-child').textContent=isFavNow('${c._id}')?'🔖 Saved':'🔖 Save'">
          ${isFav ? '🔖 Saved' : '🔖 Save Cafe'}
        </button>
        ${c.latitude ? `<button class="btn-outline" onclick="window.open('https://www.openstreetmap.org/?mlat=${c.latitude}&mlon=${c.longitude}&zoom=17','_blank')">🗺️ Open in Maps</button>` : ''}
        <button class="btn-outline" onclick="prefillReview('${c.name}');showPage('reviews');closeModal()">✍️ Write Review</button>
      </div>

      <div class="modal-reviews">
        <h3>Reviews (${cafeReviews.length})</h3>
        ${reviewsHTML}
      </div>
    </div>
  `;

  document.getElementById('cafeModal').classList.add('open');
}

function scoreRow(label, val, weight) {
  return `<div class="breakdown-row">
    <span class="breakdown-label">${label}</span>
    <span class="breakdown-val">${val}/100</span>
    <div class="score-bar-track" style="margin:0;">
      <div class="score-bar-fill" style="width:${val}%;height:4px;"></div>
    </div>
  </div>`;
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('cafeModal')) return;
  document.getElementById('cafeModal').classList.remove('open');
}

function isFavNow(id) { return favorites.some(f => f._id === id); }

// ─────────────────────────────────────────────────────────
// FAVORITES
// ─────────────────────────────────────────────────────────
function toggleFavorite(e, id) {
  if (e) e.stopPropagation();
  const idx = favorites.findIndex(f => f._id === id);
  if (idx === -1) {
    const cafe = allCafes.find(c => c._id === id) || favorites.find(c => c._id === id);
    if (cafe) { favorites.push(cafe); toast('🔖 Cafe saved!'); }
  } else {
    favorites.splice(idx, 1);
    toast('🗑️ Removed from saved');
  }
  localStorage.setItem('favorites', JSON.stringify(favorites));
  renderFavorites();
  renderCafeList();

  // Try backend
  postFavorite(id).catch(() => {});
}

async function postFavorite(cafeId) {
  await fetch(`${API}/favorites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: 'local', cafe_id: cafeId })
  });
}

function renderFavorites() {
  const el = document.getElementById('favoritesList');
  if (!favorites.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🔖</div><p>No saved cafes yet. Discover cafes and hit the bookmark icon!</p></div>`;
    return;
  }
  el.innerHTML = favorites.map(c => cafeCardHTML(c)).join('');
}

// ─────────────────────────────────────────────────────────
// REVIEWS
// ─────────────────────────────────────────────────────────
function setRating(v) {
  currentRating = v;
  document.querySelectorAll('.star').forEach(s => {
    s.classList.toggle('lit', parseInt(s.dataset.v) <= v);
  });
}

function prefillReview(name) {
  document.getElementById('reviewCafeName').value = name;
}

async function submitReview() {
  const cafeName = document.getElementById('reviewCafeName').value.trim();
  const text     = document.getElementById('reviewText').value.trim();
  if (!cafeName) { toast('⚠️ Please enter a cafe name'); return; }
  if (!currentRating) { toast('⚠️ Please select a rating'); return; }
  if (!text) { toast('⚠️ Please write a review'); return; }

  const review = {
    id: Date.now().toString(),
    cafe_id: cafeName,
    cafe_name: cafeName,
    rating: currentRating,
    review: text,
    created_at: new Date().toISOString()
  };
  reviews.unshift(review);
  localStorage.setItem('reviews', JSON.stringify(reviews));
  renderAllReviews();

  // Try backend
  try {
    await fetch(`${API}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cafe_id: cafeName, rating: currentRating, review: text })
    });
  } catch (_) {}

  document.getElementById('reviewCafeName').value = '';
  document.getElementById('reviewText').value = '';
  setRating(0);
  currentRating = 0;
  toast('✅ Review submitted!');
}

function renderAllReviews() {
  const el = document.getElementById('allReviews');
  if (!reviews.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">✍️</div><p>No reviews yet. Be the first to share your experience!</p></div>`;
    return;
  }
  el.innerHTML = reviews.map(r => `
    <div class="review-item">
      <div class="review-item-head">
        <span class="review-cafe-name">${r.cafe_name || r.cafe_id}</span>
        <span class="review-date">${new Date(r.created_at).toLocaleDateString()}</span>
      </div>
      <div class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
      <div class="review-text" style="margin-top:8px;">${r.review}</div>
    </div>
  `).join('');
}

function avgRating(cafeId) {
  const rs = reviews.filter(r => r.cafe_id === cafeId);
  if (!rs.length) return 0;
  return rs.reduce((a, r) => a + r.rating, 0) / rs.length;
}

// ─────────────────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`page-${name}`).classList.add('active');
  document.querySelector(`[data-page="${name}"]`).classList.add('active');
  if (name === 'favorites') renderFavorites();
  if (name === 'reviews')   renderAllReviews();
  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ─────────────────────────────────────────────────────────
// RADIUS
// ─────────────────────────────────────────────────────────
let radiusDebounce;
function updateRadius(v) {
  document.getElementById('radiusVal').textContent = v;
  clearTimeout(radiusDebounce);
  radiusDebounce = setTimeout(() => { if (userLat) fetchNearbyCafes(); }, 600);
}

// ─────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLng = (lng2-lng1) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function tagEmoji(tag) {
  const map = { wifi:'📶', charging:'🔌', quiet:'🤫', budget:'💸', study:'📚', coding:'💻', meeting:'🤝' };
  return map[tag] || '•';
}

function showListLoading() {
  document.getElementById('cafeList').innerHTML = `
    <div class="spinner-wrap">
      <div class="spinner"></div>
      <span>Finding nearby cafes…</span>
    </div>`;
}

let toastTimer;
function toast(msg, duration = 2800) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// ─────────────────────────────────────────────────────────
// DEMO DATA (fallback when geolocation denied or API fails)
// ─────────────────────────────────────────────────────────
function loadDemoCafes() {
  // Base coordinates — generic world center as placeholder
  const baseLat = userLat || 28.6139;
  const baseLng = userLng || 77.2090;

  allCafes = [
    { _id: 'd1', name: 'The Code Cave', latitude: baseLat+0.002, longitude: baseLng+0.003, address: '12, Study Lane, Inner City', study_score: 92, tags: ['wifi','coding','study','charging'], wifi: true, distance: 280, opening_hours: 'Mon-Sun 7am-11pm', phone: null, breakdown: { wifi:100, noise:90, seating:85, charging:100, cost:70 } },
    { _id: 'd2', name: 'Quiet Grind', latitude: baseLat-0.001, longitude: baseLng+0.004, address: '5, Focus Street, Old Quarter', study_score: 87, tags: ['quiet','study','budget'], wifi: false, distance: 560, opening_hours: 'Mon-Fri 8am-8pm', phone: null, breakdown: { wifi:40, noise:100, seating:90, charging:60, cost:100 } },
    { _id: 'd3', name: 'Brew & Work', latitude: baseLat+0.005, longitude: baseLng-0.002, address: '88, Network Road, Tech Hub', study_score: 78, tags: ['wifi','meeting','coding'], wifi: true, distance: 820, opening_hours: 'Mon-Sat 6am-10pm', phone: '+91 98765 43210', breakdown: { wifi:100, noise:60, seating:80, charging:70, cost:60 } },
    { _id: 'd4', name: 'Mango Grind', latitude: baseLat-0.003, longitude: baseLng-0.001, address: '3, Market Square, Downtown', study_score: 64, tags: ['budget','study'], wifi: false, distance: 1100, opening_hours: 'Daily 7am-9pm', phone: null, breakdown: { wifi:30, noise:65, seating:70, charging:30, cost:100 } },
    { _id: 'd5', name: 'Pixel Coffee', latitude: baseLat+0.001, longitude: baseLng-0.005, address: '21, Digital Avenue, East Side', study_score: 95, tags: ['wifi','coding','charging','study','meeting'], wifi: true, distance: 450, opening_hours: 'Mon-Sun 6am-Midnight', phone: '+91 91234 56789', breakdown: { wifi:100, noise:85, seating:100, charging:100, cost:80 } },
    { _id: 'd6', name: 'The Reading Room', latitude: baseLat+0.007, longitude: baseLng+0.001, address: '7, Library Row, West Side', study_score: 83, tags: ['quiet','study','budget'], wifi: false, distance: 1350, opening_hours: 'Tue-Sun 9am-7pm', phone: null, breakdown: { wifi:40, noise:100, seating:90, charging:50, cost:90 } },
  ];

  panMap(baseLat, baseLng, 14);
  addUserMarker(baseLat, baseLng);
  applyFiltersAndRender();
}
