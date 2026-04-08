# 🥗 DapurSehat — Panduan Setup

Aplikasi PWA untuk merencanakan menu sehat mingguan berdasarkan bahan belanjaan. Bisa diinstall di HP dan sync antar device via Supabase.

---

## 📁 Struktur File

```
dapursehat/
├── index.html       ← Halaman utama
├── style.css        ← Semua styling
├── app.js           ← Logic aplikasi
├── sw.js            ← Service Worker (offline support)
├── manifest.json    ← PWA manifest (install di HP)
├── schema.sql       ← Database schema Supabase
├── icons/
│   ├── icon-192.png ← Icon app (buat sendiri)
│   └── icon-512.png ← Icon app besar
└── README.md
```

---

## 🚀 Setup Step by Step

### 1. Buat Project Supabase
1. Buka [supabase.com](https://supabase.com) → New Project
2. Catat **Project URL** dan **Anon Key** (Settings > API)

### 2. Setup Database
1. Di Supabase → SQL Editor
2. Copy semua isi `schema.sql` → Run
3. Pastikan ada 3 tabel: `ingredients`, `menus`, `meal_schedule`

### 3. Aktifkan Google OAuth
1. Di Supabase → Authentication > Providers > Google → Enable
2. Buat Google OAuth credentials di [console.cloud.google.com](https://console.cloud.google.com):
   - Buat project → Enable Google+ API
   - Credentials → OAuth 2.0 Client ID
   - Authorized redirect URI: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
3. Copy Client ID & Secret → paste ke Supabase Google provider settings
4. Di Supabase → Authentication > URL Configuration:
   - Site URL: URL hosting kamu (misal `https://dapursehat.vercel.app`)
   - Redirect URLs: tambahkan URL yang sama

### 4. Isi Config di `app.js`
```javascript
const SUPABASE_URL = 'https://xxxxx.supabase.co';     // ← ganti
const SUPABASE_ANON_KEY = 'eyJxxxxx...';               // ← ganti
const ANTHROPIC_API_KEY = 'sk-ant-xxxxx...';           // ← ganti
```

> ⚠️ **Penting untuk produksi**: Jangan expose Anthropic API key di frontend.
> Pindahkan ke Supabase Edge Function. Lihat bagian Advanced di bawah.

### 5. Buat Icons
Buat folder `icons/` dan tambahkan:
- `icon-192.png` (192×192px) — bisa pakai [favicon.io](https://favicon.io)
- `icon-512.png` (512×512px)

### 6. Deploy
**Opsi A — Vercel (gratis, paling mudah):**
```bash
npm i -g vercel
vercel deploy
```

**Opsi B — Netlify (drag & drop):**
- Zip semua file → upload ke [netlify.com/drop](https://netlify.com/drop)

**Opsi C — GitHub Pages:**
- Push ke GitHub → Settings > Pages > Deploy from branch

---

## 🔒 Advanced: Amankan API Key (Rekomendasi Produksi)

Buat Supabase Edge Function agar API key tidak expose di browser:

```bash
supabase functions new generate-menu
```

```typescript
// supabase/functions/generate-menu/index.ts
import { serve } from 'https://deno.land/std/http/server.ts'

serve(async (req) => {
  const { prompt } = await req.json()
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
  })
  const data = await resp.json()
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
})
```

Deploy:
```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxx
supabase functions deploy generate-menu
```

Lalu di `app.js`, ganti fetch ke:
```javascript
const resp = await sb.functions.invoke('generate-menu', { body: { prompt } });
```

---

## ✅ Fitur Aplikasi

| Fitur | Keterangan |
|-------|-----------|
| 🔐 Login Google | Multi-user, data tersimpan per akun |
| 🛒 Input Bahan | Tambah/hapus bahan belanjaan |
| ✨ Generate Menu | AI buatkan 6 menu sehat dari bahan |
| 📋 Lihat Resep | Step-by-step cara memasak |
| 📅 Jadwal Makan | Atur tanggal & waktu makan |
| 📖 Riwayat Menu | Semua menu yang pernah di-generate |
| 📱 Install di HP | PWA — bisa install dari browser |
| 🔄 Sync Multi-device | Data tersimpan di cloud Supabase |
| 📶 Offline Mode | Bisa dibuka tanpa internet (data cache) |

---

## 🛟 Troubleshooting

**Login tidak berhasil?**
- Pastikan Redirect URL di Supabase sudah sesuai domain hosting

**Generate menu error?**
- Cek Anthropic API key sudah benar
- Pastikan ada bahan yang sudah ditambahkan

**Tidak bisa install di HP?**
- Harus via HTTPS (tidak bisa localhost)
- Chrome: menu ⋮ → "Tambahkan ke layar utama"
- Safari iOS: tombol Share → "Tambahkan ke Layar Utama"

---

*DapurSehat — Masak sehat, hidup sehat* 🥗
