// ===== CONFIG — GANTI DENGAN MILIK KAMU =====
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
const ANTHROPIC_API_KEY = 'YOUR_ANTHROPIC_API_KEY'; // Simpan di backend/edge function untuk produksi

// ===== INIT SUPABASE =====
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== STATE =====
let currentUser = null;
let ingredients = [];
let generatedMenus = [];
let scheduledMeals = [];
let historyMenus = [];
let currentMenu = null; // menu yang sedang dibuka di modal
let weekOffset = 0;
let portions = 2;
let selectedPrefs = ['rendah kalori'];
let selectedMealType = 'semua';
let selectedMealTime = 'Sarapan';
let deferredInstallPrompt = null;

// ===== PWA INSTALL =====
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  showInstallBanner();
});

function showInstallBanner() {
  const banner = document.getElementById('install-banner');
  if (banner) banner.classList.remove('hidden');
}

// ===== AUTH =====
async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await onLogin(session.user);
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      await onLogin(session.user);
    } else if (event === 'SIGNED_OUT') {
      onLogout();
    }
  });
}

async function onLogin(user) {
  currentUser = user;
  showScreen('app');
  setupUserUI(user);
  await loadAll();
}

function onLogout() {
  currentUser = null;
  ingredients = [];
  generatedMenus = [];
  scheduledMeals = [];
  historyMenus = [];
  showScreen('login');
}

function setupUserUI(user) {
  const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Pengguna';
  const avatar = user.user_metadata?.avatar_url;

  document.getElementById('home-username').textContent = name;
  document.getElementById('profile-name').textContent = name;
  document.getElementById('profile-email').textContent = user.email;

  const avatarEl = document.getElementById('user-avatar');
  if (avatar) {
    avatarEl.innerHTML = `<img src="${avatar}" alt="${name}" />`;
  } else {
    avatarEl.textContent = name.charAt(0).toUpperCase();
  }

  // Greeting berdasarkan jam
  const h = new Date().getHours();
  const greet = h < 11 ? 'Selamat pagi 👋' : h < 15 ? 'Selamat siang 👋' : h < 18 ? 'Selamat sore 👋' : 'Selamat malam 👋';
  document.getElementById('home-greeting').textContent = greet;
}

document.getElementById('btn-login')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-login');
  btn.disabled = true;
  btn.textContent = 'Menghubungkan...';
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
  if (error) {
    showToast('Gagal login: ' + error.message);
    btn.disabled = false;
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 48 48">...</svg> Masuk dengan Google`;
  }
});

document.getElementById('btn-logout')?.addEventListener('click', async () => {
  await sb.auth.signOut();
  toggleProfileMenu();
});

// ===== LOAD ALL DATA =====
async function loadAll() {
  await Promise.all([
    loadIngredients(),
    loadSchedule(),
    loadHistory()
  ]);
  renderHome();
}

// ===== INGREDIENTS =====
async function loadIngredients() {
  if (!currentUser) return;
  const { data } = await sb.from('ingredients').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
  ingredients = data || [];
  renderIngredients();
  updateIngrSummary();
}

async function addIngredients() {
  const input = document.getElementById('ingr-input');
  const raw = input.value.trim();
  if (!raw) return;

  const items = raw.split(/[,،]+/).map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
  const existing = new Set(ingredients.map(i => i.name.toLowerCase()));
  const newItems = items.filter(i => !existing.has(i));

  if (!newItems.length) {
    showToast('Bahan sudah ada di daftar');
    input.value = '';
    return;
  }

  const rows = newItems.map(name => ({ user_id: currentUser.id, name, category: guessCategory(name) }));
  const { data, error } = await sb.from('ingredients').insert(rows).select();
  if (!error) {
    ingredients = [...(data || []), ...ingredients];
    input.value = '';
    renderIngredients();
    updateIngrSummary();
    updateStats();
    showToast(`${newItems.length} bahan ditambahkan`);
  }
}

async function deleteIngredient(id) {
  await sb.from('ingredients').delete().eq('id', id).eq('user_id', currentUser.id);
  ingredients = ingredients.filter(i => i.id !== id);
  renderIngredients();
  updateIngrSummary();
  updateStats();
}

function quickAdd(text) {
  document.getElementById('ingr-input').value = text;
  addIngredients();
}

function guessCategory(name) {
  const cats = {
    protein: ['ayam','daging','ikan','tahu','tempe','telur','udang','cumi','tuna','salmon'],
    sayuran: ['bayam','kangkung','brokoli','wortel','tomat','kubis','sawi','selada','kacang panjang','terong'],
    karbohidrat: ['beras','nasi','roti','oat','singkong','ubi','mie','pasta','kentang'],
    buah: ['pisang','apel','jeruk','mangga','pepaya','semangka','melon','anggur'],
    bumbu: ['bawang','jahe','kunyit','ketumbar','merica','cabai','lengkuas','serai']
  };
  for (const [cat, list] of Object.entries(cats)) {
    if (list.some(k => name.includes(k))) return cat;
  }
  return 'lainnya';
}

function renderIngredients() {
  const grid = document.getElementById('ingr-grid');
  const count = document.getElementById('ingr-count');
  count.textContent = ingredients.length;

  if (!ingredients.length) {
    grid.innerHTML = `<div class="empty-state"><span>🛒</span><p>Belum ada bahan. Tambahkan hasil belanjaan kamu!</p></div>`;
    return;
  }
  grid.innerHTML = ingredients.map(i => `
    <div class="ingr-tag">
      ${i.name}
      <button class="ingr-tag-del" onclick="deleteIngredient('${i.id}')" title="Hapus">✕</button>
    </div>
  `).join('');
}

function updateIngrSummary() {
  const el = document.getElementById('ingr-summary-text');
  if (!ingredients.length) {
    el.textContent = 'Belum ada bahan. Tambahkan bahan dulu di tab Bahan.';
  } else {
    const preview = ingredients.slice(0, 5).map(i => i.name).join(', ');
    const more = ingredients.length > 5 ? ` +${ingredients.length - 5} lainnya` : '';
    el.textContent = `${ingredients.length} bahan: ${preview}${more}`;
  }
}

// ===== GENERATE MENUS =====
async function generateMenus() {
  if (!ingredients.length) {
    showToast('Tambahkan bahan dulu!');
    switchTab('ingredients', document.querySelector('[data-tab=ingredients]'));
    return;
  }

  const btn = document.getElementById('btn-generate');
  btn.disabled = true;
  const results = document.getElementById('generate-results');
  results.innerHTML = `
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <p class="loading-text">AI sedang meracik menu sehat untukmu...</p>
    </div>`;

  const mealFilter = selectedMealType !== 'semua' ? `Fokus pada ${selectedMealType}.` : 'Variasikan untuk sarapan, makan siang, makan malam, dan camilan.';
  const prefText = selectedPrefs.length ? `Preferensi: ${selectedPrefs.join(', ')}.` : '';

  const prompt = `Kamu adalah ahli gizi dan chef masakan sehat Indonesia.

Bahan tersedia: ${ingredients.map(i => i.name).join(', ')}.
Untuk ${portions} orang. ${mealFilter} ${prefText}

Buat 6 ide menu sehat dari bahan-bahan tersebut. Utamakan resep Indonesia yang sehat dan bergizi.

Balas HANYA dengan JSON array (tanpa preamble, tanpa markdown backtick):
[
  {
    "id": 1,
    "name": "Nama Menu",
    "meal_type": "sarapan|makan siang|makan malam|camilan",
    "desc": "Deskripsi singkat 1-2 kalimat",
    "ingredients_used": ["bahan1", "bahan2", "bahan3"],
    "calories": "±XXX kkal/porsi",
    "protein": "XXg",
    "time": "XX menit",
    "difficulty": "Mudah|Sedang|Sulit",
    "recipe_steps": [
      "Langkah 1: ...",
      "Langkah 2: ...",
      "Langkah 3: ..."
    ],
    "tips": "Tips memasak atau variasi menu"
  }
]`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await resp.json();
    const text = data.content?.map(c => c.text || '').join('') || '';
    const clean = text.replace(/```json|```/g, '').trim();
    generatedMenus = JSON.parse(clean);

    // Simpan ke history
    await saveToHistory(generatedMenus);
    await loadHistory();

    renderMenuResults();
    updateStats();
  } catch (e) {
    results.innerHTML = `<div class="empty-state"><span>⚠️</span><p>Gagal generate menu. Periksa koneksi dan coba lagi.</p></div>`;
    console.error(e);
  } finally {
    btn.disabled = false;
  }
}

async function saveToHistory(menus) {
  const rows = menus.map(m => ({
    user_id: currentUser.id,
    name: m.name,
    meal_type: m.meal_type,
    description: m.desc,
    ingredients_used: m.ingredients_used,
    calories: m.calories,
    protein: m.protein,
    cook_time: m.time,
    difficulty: m.difficulty,
    recipe_steps: m.recipe_steps,
    tips: m.tips
  }));
  await sb.from('menus').insert(rows);
}

function renderMenuResults() {
  const results = document.getElementById('generate-results');
  if (!generatedMenus.length) {
    results.innerHTML = `<div class="empty-state"><span>🤔</span><p>Tidak ada menu yang bisa dibuat dari bahan ini</p></div>`;
    return;
  }

  const badgeClass = {
    'sarapan': 'badge-sarapan',
    'makan siang': 'badge-siang',
    'makan malam': 'badge-malam',
    'camilan': 'badge-camilan'
  };

  results.innerHTML = `
    <p class="results-label">Ditemukan <strong>${generatedMenus.length} menu</strong> dari bahan kamu</p>
    <div class="menu-cards">
      ${generatedMenus.map(m => `
        <div class="menu-card" id="mcard-${m.id}">
          <div class="menu-card-top">
            <span class="menu-card-badge ${badgeClass[m.meal_type] || 'badge-camilan'}">${m.meal_type}</span>
            <div class="menu-card-check">
              <svg width="12" height="10" fill="none" stroke="#1a1a1a" stroke-width="2.5" viewBox="0 0 12 10"><polyline points="1,5 4,8 11,1"/></svg>
            </div>
          </div>
          <div class="menu-card-name">${m.name}</div>
          <div class="menu-card-desc">${m.desc}</div>
          <div class="menu-card-chips">
            <span class="meta-chip">⏱ ${m.time}</span>
            <span class="meta-chip">🔥 ${m.calories}</span>
            <span class="meta-chip">💪 ${m.protein}</span>
            <span class="meta-chip">📊 ${m.difficulty}</span>
          </div>
          <div class="ingr-chips">${m.ingredients_used.map(i => `<span class="ingr-chip">${i}</span>`).join('')}</div>
          <div class="menu-card-footer">
            <button class="btn-recipe" onclick="openRecipeModal(${m.id})">Lihat Resep</button>
            <button class="btn-add-sched" onclick="openScheduleModal(${m.id})">+ Jadwalkan</button>
          </div>
        </div>
      `).join('')}
    </div>
    <button class="regen-btn" onclick="generateMenus()">🔄 Generate ulang</button>
  `;
}

// ===== MODAL RECIPE =====
function openRecipeModal(menuId) {
  const m = generatedMenus.find(x => x.id === menuId) || historyMenus.find(x => x.id === menuId);
  if (!m) return;
  currentMenu = m;

  const badgeClass = { 'sarapan': 'badge-sarapan', 'makan siang': 'badge-siang', 'makan malam': 'badge-malam', 'camilan': 'badge-camilan' };
  document.getElementById('modal-badge').innerHTML = `<span class="menu-card-badge ${badgeClass[m.meal_type] || 'badge-camilan'}">${m.meal_type}</span>`;
  document.getElementById('modal-title').textContent = m.name;
  document.getElementById('modal-meta').innerHTML = `
    <span class="meta-chip">⏱ ${m.time || m.cook_time}</span>
    <span class="meta-chip">🔥 ${m.calories}</span>
    <span class="meta-chip">💪 ${m.protein}</span>
    <span class="meta-chip">📊 ${m.difficulty || '-'}</span>
  `;
  document.getElementById('modal-ingredients').innerHTML = `
    <div class="modal-ingr-list">${(m.ingredients_used || []).map(i => `<span class="ingr-chip">${i}</span>`).join('')}</div>
  `;

  const steps = m.recipe_steps || [];
  if (steps.length) {
    document.getElementById('modal-recipe-steps').innerHTML = steps.map((s, idx) => {
      const text = s.replace(/^Langkah\s*\d+\s*[:\-]?\s*/i, '').trim();
      return `<div class="recipe-step"><div class="step-num">${idx + 1}</div><div class="step-text">${text}</div></div>`;
    }).join('');
  } else {
    document.getElementById('modal-recipe-steps').innerHTML = `<p class="modal-recipe-text">${m.recipe || 'Resep tidak tersedia'}</p>`;
  }

  if (m.tips) {
    document.getElementById('modal-recipe-steps').innerHTML += `
      <div style="margin-top:1rem; padding:12px; background:rgba(212,168,83,0.08); border-radius:10px; border-left:3px solid var(--accent)">
        <p style="font-size:12px;color:var(--text3);margin-bottom:4px">💡 TIPS</p>
        <p style="font-size:13px;color:var(--text2)">${m.tips}</p>
      </div>`;
  }

  document.getElementById('btn-schedule-this').onclick = () => {
    closeModal('modal-recipe');
    openScheduleModal(menuId);
  };

  openModal('modal-recipe');
}

// ===== MODAL SCHEDULE =====
function openScheduleModal(menuId) {
  const m = generatedMenus.find(x => x.id === menuId) || historyMenus.find(x => x.id === menuId);
  if (!m) return;
  currentMenu = m;

  document.getElementById('sched-menu-name').textContent = m.name;
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('sched-date').value = today;

  openModal('modal-schedule');
}

async function saveSchedule() {
  if (!currentMenu) return;
  const date = document.getElementById('sched-date').value;
  const note = document.getElementById('sched-note').value;
  if (!date) { showToast('Pilih tanggal dulu!'); return; }

  const menuId = currentMenu.id;
  // Cari menu dari history jika perlu
  let menuDbId = null;
  const dbMenu = historyMenus.find(h => h.name === currentMenu.name);
  if (dbMenu) menuDbId = dbMenu.id;

  const { error } = await sb.from('meal_schedule').insert({
    user_id: currentUser.id,
    menu_id: menuDbId,
    menu_name: currentMenu.name,
    meal_type: selectedMealTime,
    scheduled_date: date,
    note: note,
    menu_data: currentMenu
  });

  if (!error) {
    closeModal('modal-schedule');
    await loadSchedule();
    renderHome();
    renderScheduleGrid();
    updateStats();
    showToast('Menu berhasil dijadwalkan! 🎉');
    document.getElementById('sched-note').value = '';
  } else {
    showToast('Gagal menyimpan jadwal');
  }
}

function selectMealTime(btn) {
  document.querySelectorAll('#modal-schedule .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  selectedMealTime = btn.dataset.meal;
}

// ===== SCHEDULE =====
async function loadSchedule() {
  if (!currentUser) return;
  const { data } = await sb.from('meal_schedule')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('scheduled_date');
  scheduledMeals = data || [];
}

function renderScheduleGrid() {
  const grid = document.getElementById('schedule-grid');
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1 + (weekOffset * 7));

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    days.push(d);
  }

  const weekStart = days[0].toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  const weekEnd = days[6].toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  document.getElementById('week-label').textContent = weekOffset === 0 ? 'Minggu ini' : `${weekStart} – ${weekEnd}`;

  const dayNames = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  const mealDotClass = { 'Sarapan': 'dot-sarapan', 'Makan Siang': 'dot-siang', 'Makan Malam': 'dot-malam', 'Camilan': 'dot-camilan' };
  const todayStr = today.toISOString().split('T')[0];

  grid.innerHTML = days.map((d, i) => {
    const dateStr = d.toISOString().split('T')[0];
    const dayMeals = scheduledMeals.filter(m => m.scheduled_date === dateStr);
    const isToday = dateStr === todayStr;

    return `
      <div class="sched-day">
        <div class="sched-day-header${isToday ? ' today' : ''}">
          <span class="sched-day-name">${dayNames[i]}</span>
          <span class="sched-day-date">${d.getDate()} ${d.toLocaleDateString('id-ID', { month: 'short' })}</span>
        </div>
        <div class="sched-meals">
          ${dayMeals.length ? dayMeals.map(m => `
            <div class="sched-meal-item" onclick="openScheduledMeal('${m.id}')">
              <div class="sched-meal-dot ${mealDotClass[m.meal_type] || 'dot-camilan'}"></div>
              <div class="sched-meal-info">
                <div class="sched-meal-name">${m.menu_name}</div>
                <div class="sched-meal-type">${m.meal_type}</div>
              </div>
            </div>
          `).join('') : `<div class="sched-empty">—</div>`}
        </div>
      </div>
    `;
  }).join('');
}

function openScheduledMeal(id) {
  const meal = scheduledMeals.find(m => m.id === id);
  if (!meal || !meal.menu_data) return;
  const menu = meal.menu_data;
  menu.id = menu.id || 'sched_' + id;
  if (!generatedMenus.find(m => m.id === menu.id)) generatedMenus.push(menu);
  openRecipeModal(menu.id);
}

function changeWeek(dir) {
  weekOffset += dir;
  renderScheduleGrid();
}

// ===== HISTORY =====
async function loadHistory() {
  if (!currentUser) return;
  const { data } = await sb.from('menus')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(50);
  historyMenus = data || [];
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById('history-list');
  if (!historyMenus.length) {
    list.innerHTML = `<div class="empty-state"><span>📖</span><p>Belum ada riwayat menu</p></div>`;
    return;
  }
  const badgeClass = { 'sarapan': 'badge-sarapan', 'makan siang': 'badge-siang', 'makan malam': 'badge-malam', 'camilan': 'badge-camilan' };
  list.innerHTML = historyMenus.map(m => `
    <div class="history-item" onclick="openHistoryMenu('${m.id}')">
      <div class="history-item-top">
        <div>
          <span class="menu-card-badge ${badgeClass[m.meal_type] || 'badge-camilan'}" style="font-size:11px;margin-bottom:4px;display:inline-flex">${m.meal_type}</span>
          <div class="history-item-name">${m.name}</div>
        </div>
        <span class="history-item-date">${new Date(m.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
      </div>
      <div class="history-item-desc">${m.description || ''}</div>
      <div style="display:flex;gap:6px;margin-top:8px">
        <span class="meta-chip">⏱ ${m.cook_time}</span>
        <span class="meta-chip">🔥 ${m.calories}</span>
      </div>
    </div>
  `).join('');
}

function openHistoryMenu(id) {
  const m = historyMenus.find(x => x.id === id);
  if (!m) return;
  // Normalize ke format generatedMenus
  const normalized = {
    id: m.id,
    name: m.name,
    meal_type: m.meal_type,
    desc: m.description,
    ingredients_used: m.ingredients_used || [],
    calories: m.calories,
    protein: m.protein,
    time: m.cook_time,
    difficulty: m.difficulty,
    recipe_steps: m.recipe_steps || [],
    tips: m.tips
  };
  if (!generatedMenus.find(x => x.id === m.id)) generatedMenus.push(normalized);
  openRecipeModal(m.id);
}

// ===== HOME RENDER =====
function renderHome() {
  renderTodayMeals();
  updateStats();
}

function renderTodayMeals() {
  const todayStr = new Date().toISOString().split('T')[0];
  const todayMeals = scheduledMeals.filter(m => m.scheduled_date === todayStr);
  const container = document.getElementById('today-meals');
  const dotClass = { 'Sarapan': 'dot-sarapan', 'Makan Siang': 'dot-siang', 'Makan Malam': 'dot-malam', 'Camilan': 'dot-camilan' };

  if (!todayMeals.length) {
    container.innerHTML = `<div class="empty-state small"><span>🍽️</span><p>Belum ada menu dijadwalkan hari ini</p></div>`;
    return;
  }
  container.innerHTML = todayMeals.map(m => `
    <div class="today-meal-card" onclick="openScheduledMeal('${m.id}')">
      <div class="today-meal-dot ${dotClass[m.meal_type] || 'dot-camilan'}"></div>
      <div class="today-meal-info">
        <div class="today-meal-name">${m.menu_name}</div>
        <div class="today-meal-time">${m.meal_type}</div>
      </div>
      <div class="today-meal-cal">${m.menu_data?.calories || ''}</div>
    </div>
  `).join('');
}

function updateStats() {
  document.getElementById('stat-ingredients').textContent = ingredients.length;
  document.getElementById('stat-menus').textContent = historyMenus.length;
  document.getElementById('stat-scheduled').textContent = scheduledMeals.length;
}

// ===== UI HELPERS =====
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${name}`)?.classList.add('active');
}

function switchTab(name, btnEl) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${name}`)?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  // Render tab-spesifik
  if (name === 'schedule') renderScheduleGrid();
}

function openModal(id) {
  document.getElementById(id)?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  document.body.style.overflow = '';
}

function toggleProfileMenu() {
  document.getElementById('profile-menu')?.classList.toggle('open');
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ===== GENERATE OPTIONS =====
document.querySelectorAll('#meal-type-chips .chip').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#meal-type-chips .chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    selectedMealType = btn.dataset.val;
  });
});

function setPortions(btn) {
  document.querySelectorAll('[data-val]').forEach(b => {
    if (['1','2','4','6'].includes(b.dataset.val)) b.classList.remove('active');
  });
  btn.classList.add('active');
  portions = parseInt(btn.dataset.val);
}

function togglePref(btn) {
  const pref = btn.dataset.pref;
  btn.classList.toggle('active');
  if (btn.classList.contains('active')) {
    if (!selectedPrefs.includes(pref)) selectedPrefs.push(pref);
  } else {
    selectedPrefs = selectedPrefs.filter(p => p !== pref);
  }
}

// Tutup profile menu jika klik di luar
document.addEventListener('click', (e) => {
  const pm = document.getElementById('profile-menu');
  const av = document.getElementById('user-avatar');
  if (pm && !pm.contains(e.target) && !av?.contains(e.target)) {
    pm.classList.remove('open');
  }
});

// ===== SERVICE WORKER =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ===== INSTALL BANNER HTML (injected) =====
function injectInstallBanner() {
  const banner = document.createElement('div');
  banner.className = 'install-banner hidden';
  banner.id = 'install-banner';
  banner.innerHTML = `
    <span style="font-size:24px">🥗</span>
    <div class="install-banner-text">
      Install DapurSehat
      <span>Akses lebih cepat dari layar utama HP</span>
    </div>
    <button class="install-btn" onclick="installApp()">Install</button>
    <button class="install-close" onclick="document.getElementById('install-banner').classList.add('hidden')">✕</button>
  `;
  document.getElementById('screen-app')?.appendChild(banner);
}

async function installApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const result = await deferredInstallPrompt.userChoice;
  if (result.outcome === 'accepted') {
    document.getElementById('install-banner')?.classList.add('hidden');
  }
  deferredInstallPrompt = null;
}

// ===== BOOT =====
injectInstallBanner();
initAuth();
