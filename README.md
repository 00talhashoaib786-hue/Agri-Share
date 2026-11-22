# PakAgriShare

Peer-to-peer agricultural machinery rental marketplace for Pakistan.
Principles of Marketing semester project (Section C), IBM, UET Lahore.

> Proposed concept prototype. Sample rates and listings are illustrative.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in /dist
```

Requires Node.js 20.19 or newer.

## Firebase setup (project agri-share-70fb1, one time)

1. **Authentication > Sign-in method**: enable **Email/Password**.
2. **Firestore Database > Create database** (location: asia-south1, Mumbai).
3. **Firestore Database > Rules**: paste `firestore.rules` and click **Publish**.
4. **Authentication > Settings > Authorized domains**: add your Vercel domain
   (for example `agri-share.vercel.app`). Needed for password reset emails and Phone OTP.
5. Optional, **Phone OTP**: Authentication > Sign-in method > enable **Phone**.
   Firebase sends SMS codes only on the **Blaze** (pay as you go) plan. On Spark the
   app shows "Phone sign-in is not available right now" and the user signs up with email.
   For a free class demo you can add a test number under Phone > "Phone numbers for
   testing" (for example +92 300 0000000 with code 123456); this may still require
   Blaze to enable the provider.

The web config in `src/firebase.js` is public by design; the rules protect the data.

### What syncs

| Collection | Contents | Who can read |
|---|---|---|
| `machinery_listings` | machine listings and admin approval status | everyone |
| `admin_settings/pilot` | diesel rate, active provinces | everyone |
| `bookings` | bookings, offers, Pay-After-Harvest status | signed-in members |
| `indrive_requests` | live InDrive requests | signed-in members |
| `mandi_crops` | Agri-Market crop posts and bids | signed-in members |
| `users` | name, mobile, role (Farmer, Owner, Crop Buyer, Agri-Agent), province, district, village (document id = auth uid) | signed-in members |

All open tabs and devices update live (`onSnapshot`). The Admin Panel shows a
sync badge. Visitors who are not signed in still see listings live; their own
bookings stay on their device until they sign in.

If Firebase cannot be reached or a rule refuses a write, the app keeps working
on `localStorage` and does not crash.

## Countries, currencies and machine photos

- Header (and Marketplace / Post a Request) has a **Country / region** selector:
  Pakistan (PKR), China (CNY), India (INR), USA / Europe (USD), Middle East / Africa (USD).
  It switches the currency, the local machinery catalog, sample listings and the location list.
- Amounts are stored in PKR and converted at fixed reference rates
  (1 USD ≈ 278 PKR ≈ 6.67 CNY ≈ 94 INR, Nov 2026). Regional hourly rates and diesel prices
  are indicative samples. Edit `COUNTRIES` near the top of `src/App.jsx` to change them.
- The interactive map covers Pakistan; other countries use a region list, village text and GPS.
- Machine photos are bundled in `src/assets/machines/` (resized from Wikimedia Commons, credits in
  the footer), so they load instantly and offline. Photos show the machine type, not always the exact model.

## Kisan Helper

- Works with no setup: built-in multilingual farming engine (English, Urdu,
  Roman Urdu, Punjabi, Sindhi, Pashto, Balochi) plus live voice
  (Chrome or Edge: speech recognition and spoken replies, hands-free).
- Optional Gemini answers: in Vercel add the environment variable
  `VITE_GEMINI_API_KEY` (and optionally `VITE_GEMINI_MODEL`), then redeploy.
  Restrict the key to your domain in Google Cloud, because `VITE_` values are
  visible in the browser bundle. If Gemini fails, the built-in engine answers.

## Deploy on Vercel

1. Push this folder to a GitHub repository (keep `src/`, `public/` and the
   config files at the root).
2. https://vercel.com/new, import the repository. Vercel detects **Vite**
   (build `npm run build`, output `dist`). Click **Deploy**.
3. Add the Vercel domain to Firebase Authorized domains (step 4 above).

## Security limits (honest)

- The admin PIN (1234) is a demo lock in the browser, not real security.
- Any signed-in member can edit shared records under these rules. Before a real
  launch, add an admin custom claim and check it in `firestore.rules`.
