-- ====================================================
-- DapurSehat — Supabase Database Schema
-- Jalankan di Supabase SQL Editor
-- ====================================================

-- 1. INGREDIENTS — bahan belanjaan per user
CREATE TABLE ingredients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'lainnya', -- protein, sayuran, karbohidrat, buah, bumbu, lainnya
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. MENUS — history menu yang pernah di-generate
CREATE TABLE menus (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  meal_type TEXT NOT NULL, -- sarapan, makan siang, makan malam, camilan
  description TEXT,
  ingredients_used TEXT[],
  calories TEXT,
  protein TEXT,
  cook_time TEXT,
  difficulty TEXT,
  recipe_steps TEXT[],
  tips TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. MEAL_SCHEDULE — jadwal makan per tanggal
CREATE TABLE meal_schedule (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  menu_id UUID REFERENCES menus(id) ON DELETE SET NULL,
  menu_name TEXT NOT NULL,
  meal_type TEXT NOT NULL, -- Sarapan, Makan Siang, Makan Malam, Camilan
  scheduled_date DATE NOT NULL,
  note TEXT,
  menu_data JSONB, -- simpan full data menu untuk akses offline
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================
-- ROW LEVEL SECURITY — WAJIB diaktifkan
-- ====================================================

ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_schedule ENABLE ROW LEVEL SECURITY;

-- Policy: user hanya bisa akses data miliknya sendiri

CREATE POLICY "ingredients: own data" ON ingredients
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "menus: own data" ON menus
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "meal_schedule: own data" ON meal_schedule
  FOR ALL USING (auth.uid() = user_id);

-- ====================================================
-- INDEXES — untuk performa query
-- ====================================================

CREATE INDEX idx_ingredients_user ON ingredients(user_id);
CREATE INDEX idx_menus_user ON menus(user_id);
CREATE INDEX idx_schedule_user_date ON meal_schedule(user_id, scheduled_date);

-- ====================================================
-- SELESAI! Selanjutnya:
-- 1. Aktifkan Google OAuth di Supabase Auth > Providers
-- 2. Set Redirect URL ke domain app kamu
-- 3. Isi SUPABASE_URL dan SUPABASE_ANON_KEY di app.js
-- ====================================================
