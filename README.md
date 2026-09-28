# Reaction API Store

Gateway API berbasis akun + coin untuk meneruskan request reaction ke API ZXC.

## Arsitektur

Browser -> Web Gateway -> ZXC Reaction API

API key ZXC hanya disimpan di `.env` server dan tidak pernah dikirim ke browser.

## Fitur

- Register / login akun.
- Dashboard saldo coin.
- API key per akun.
- Endpoint `POST /api/v1/reaction`.
- 1 coin dipotong hanya setelah upstream mengembalikan `success: true`.
- Paket coin: 100 coin = Rp5.000 dan kelipatannya.
- Paket dapat diberi masa berlaku: permanent / 7 hari / 30 hari.
- Custom coin hanya bilangan bulat dan minimal 100.
- Order top-up.
- Bukti pembayaran manual.
- Admin dapat approve/reject order.
- Riwayat penggunaan API.
- Admin dashboard.
- CORS dapat dikunci ke domain sendiri.

## Instalasi

```bash
npm install
cp .env.example .env
nano .env
npm start
```

Buka:

- Website: `http://IP-SERVER:3000`
- Admin: `http://IP-SERVER:3000/admin.html`
- API docs: `http://IP-SERVER:3000/docs.html`

## Domain sendiri

Reverse proxy Nginx/Cloudflare diarahkan ke port Node, misalnya:

`https://api.domain-lo.com -> http://127.0.0.1:3000`

Lalu set:

```env
PUBLIC_URL=https://api.domain-lo.com
CORS_ORIGIN=https://api.domain-lo.com
```

## Cara jual coin

1. User register/login.
2. User buka Pricing.
3. Pilih paket atau Custom.
4. Sistem membuat order.
5. User mengikuti instruksi pembayaran dan upload bukti.
6. Admin login ke `/admin.html`.
7. Admin approve.
8. Coin masuk ke akun user.

## API

Request:

```http
POST /api/v1/reaction
Authorization: Bearer YOUR_USER_API_KEY
Content-Type: application/json

{
  "url": "https://whatsapp.com/channel/....",
  "reaction": "❤️"
}
```

Atau:

```http
POST /api/v1/reaction
X-API-Key: YOUR_USER_API_KEY
Content-Type: application/json

{
  "url": "https://whatsapp.com/channel/....",
  "reaction": "🔥"
}
```

Sukses:

```json
{
  "success": true,
  "message": "Reaction berhasil diproses.",
  "coin_used": 1,
  "coin_remaining": 99,
  "task": {},
  "vip": {}
}
```

Jika coin habis:

```json
{
  "success": false,
  "error": "INSUFFICIENT_COINS"
}
```

## Catatan payment

Versi ini memakai approval pembayaran manual agar bisa langsung dipasang tanpa mengikat project ke provider pembayaran tertentu. Untuk payment gateway otomatis, bagian order service bisa dihubungkan ke provider pilihan Anda.
