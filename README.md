# 🌌 Orion AI — Business Strategy Command Center

> **DSOC 2026 Hackathon Submission**  
> *AI-Powered Multi-Agent Business Strategy Simulator*

A galaxy-themed war room where 4 AI agents (Sales, Marketing, Finance, Operations) debate your business problem in real time, ask smart follow-up questions, and synthesize a final strategy — with a live what-if simulator for scenario planning.

---

## 🚀 File Structure

```
orion-ai/
├── backend/
│   ├── main.py              # FastAPI + LangChain + Groq  (all 6 features)
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx     # Full Orion UI (all 6 features)
│   │   │   ├── layout.tsx
│   │   │   └── globals.css  # Galaxy/nebula purple theme
│   │   └── lib/
│   │       └── utils.ts
│   ├── package.json
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── .env.example
└── README.md
```

---

## ✨ 6 Features Implemented

| # | Feature | How |
|---|---------|-----|
| 1 | Business Input Form | Revenue, budget, employees, main problem |
| 2 | Smart AI Follow-up Questions | LLM generates 2-3 targeted questions via SSE |
| 3 | 4 AI Department Agents | Sales · Marketing · Finance · Operations |
| 4 | Live Agent Debate | Streaming SSE token-by-token in chat UI |
| 5 | Final Orion Strategy | Synthesizer agent creates actionable plan |
| 6 | What-If Simulation | Sliders for budget + employees → re-runs debate |

---

## ⚡ Quick Start

### Prerequisites
- Python 3.10+, Node.js 18+
- Groq API key (free at [console.groq.com](https://console.groq.com))

### Backend
```bash
cd backend
cp .env.example .env        # Add your GROQ_API_KEY
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
cp .env.example .env.local  # NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev
# → http://localhost:3000
```

---

## 🌐 Deployment

### Frontend → Vercel
1. Import `frontend/` on [vercel.com](https://vercel.com)
2. Set env var: `NEXT_PUBLIC_API_URL=https://your-api.onrender.com`
3. Deploy

### Backend → Render
1. New Web Service on [render.com](https://render.com)
2. Root: `backend/`
3. Build: `pip install -r requirements.txt`
4. Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Set env var: `GROQ_API_KEY=gsk_...`

> Update `allow_origins` in `main.py` to your Vercel domain for production.

---

## 🎨 Design

- **Theme**: Deep space · galaxy · nebula purple + black
- **Fonts**: Cinzel (display) + Outfit (body) + JetBrains Mono
- **Effects**: Animated star field, glowing cards, scanning ring animations, SSE token streaming

---

## 🛠 Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 15, Tailwind CSS |
| Backend | FastAPI, Python |
| AI | Groq API + Llama-3.1-70B |
| Agents | LangChain LCEL |
| Streaming | Server-Sent Events (SSE) |
