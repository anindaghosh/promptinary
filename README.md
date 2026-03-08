# Promptinary

**Promptinary** is a competitive multiplayer game where players race to recreate a reference image using AI — but with a strict token budget. You write the prompt, AI generates the image, and a Gemini-powered agent scores you on how close you got, how efficiently you wrote, and how fast you submitted. The fewer words it takes you to nail the image, the better.

It turns prompt engineering from a guessing game into a skill — one that's fast, social, and surprisingly addictive.

---

## How It Works

1. **Join or create a room** — share a room code with friends to start a multiplayer session.
2. **See the reference image** — a target image is revealed to all players simultaneously.
3. **Write your prompt** — craft a prompt to recreate the image using an AI image generator, but every token counts against your budget.
4. **Submit and score** — a Gemini-powered agent evaluates your generated image against the reference, scoring you on visual similarity, prompt efficiency, and submission speed.
5. **Leaderboard** — the player who nails the image with the fewest words and fastest time wins.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router) |
| Language | TypeScript |
| UI | React 19, [Lucide React](https://lucide.dev) |
| Real-time | [Socket.IO](https://socket.io) (custom Node.js server) |
| Database / Auth | [Firebase](https://firebase.google.com) (Firestore + Auth) |
| AI Image Generation | [Google Vertex AI](https://cloud.google.com/vertex-ai) — Imagen 3 |
| AI Scoring | [Google Gemini](https://deepmind.google/technologies/gemini/) via Vertex AI |
| Deployment | [Vercel](https://vercel.com) (Next.js app) + [Railway](https://railway.app) (Socket.IO server) |
| CI/CD | GitHub Actions |

---

## Getting Started

### Prerequisites

- Node.js 20+
- A Firebase project (Firestore + Authentication enabled)
- A Google Cloud project with Vertex AI API enabled and a service account key

### Installation

```bash
git clone https://github.com/anindaghosh/trendsiq-app.git
cd trendsiq-app
npm install
```

### Environment Variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SOCKET_URL` | Socket.IO server URL (leave empty for local dev) |
| `NEXT_APP_URL` | Your deployed Next.js app URL |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase client-side config values |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Firebase Admin SDK service account email |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Firebase Admin SDK private key |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID for Vertex AI |
| `GOOGLE_CLOUD_LOCATION` | GCP region (default: `us-central1`) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full service account JSON (minified to one line) |

### Running Locally

```bash
npm run dev
```

The custom `server.js` starts both the Next.js app and the Socket.IO server on [http://localhost:3000](http://localhost:3000).

### Building for Production

```bash
npm run build
npm start
```

---

## Deployment

- **Next.js app** → deployed to [Vercel](https://vercel.com) via GitHub Actions on pushes to `develop`.
- **Socket.IO server** → deployed to [Railway](https://railway.app); set `NEXT_PUBLIC_SOCKET_URL` to your Railway URL.

---

## Contributors

| GitHub | Role |
|---|---|
| [@anindaghosh](https://github.com/anindaghosh) | Contributor |
| [@abha224](https://github.com/abha224) | Contributor |
| [@laxmansrawat](https://github.com/laxmansrawat) | Contributor |

---

Built at **Columbia Hack 2026**.
