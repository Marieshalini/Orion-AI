"""
Orion AI — Backend API
FastAPI + LangChain + Groq
6 Features: Input → Smart Questions → Agent Debate → Final Strategy → What-If
"""

import os
import json
import asyncio
from typing import AsyncGenerator
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage

load_dotenv()

app = FastAPI(title="Orion AI Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────────────────────

class BusinessInput(BaseModel):
    revenue: float
    marketing_budget: float
    employees: int
    main_problem: str

class FullSimulationInput(BaseModel):
    revenue: float
    marketing_budget: float
    employees: int
    main_problem: str
    # What-if overrides (optional)
    what_if_marketing: float | None = None
    what_if_employees: int | None = None
    # Follow-up answers (optional)
    followup_answers: list[str] = []
    followup_questions: list[str] = []

# ─────────────────────────────────────────────────────────────────────────────
# LLM factory
# ─────────────────────────────────────────────────────────────────────────────

def get_llm(temperature: float = 0.7) -> ChatGroq:
    return ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=temperature,
        groq_api_key=os.getenv("GROQ_API_KEY"),
        streaming=True,
    )

# ─────────────────────────────────────────────────────────────────────────────
# Agent personas
# ─────────────────────────────────────────────────────────────────────────────

AGENTS = [
    {
        "id": "sales",
        "name": "Sales Agent",
        "emoji": "📈",
        "color": "#a855f7",
        "system": (
            "You are the Sales Director in a high-stakes boardroom. "
            "You are aggressive, optimistic, and always push for revenue growth. "
            "You focus on sales tactics, pipeline, conversions, and market expansion. "
            "Give your opinion in 3–4 punchy, direct sentences. Be specific with the numbers given. "
            "Do not hedge; recommend boldly."
        ),
    },
    {
        "id": "marketing",
        "name": "Marketing Agent",
        "emoji": "🎯",
        "color": "#c084fc",
        "system": (
            "You are the Chief Marketing Officer. "
            "You are creative, data-driven, and obsessed with brand, acquisition, and ROI. "
            "You focus on channels, campaigns, content, and customer lifetime value. "
            "Give your opinion in 3–4 sentences. Reference the specific numbers and problem given."
        ),
    },
    {
        "id": "finance",
        "name": "Finance Agent",
        "emoji": "💎",
        "color": "#e879f9",
        "system": (
            "You are the CFO. You are conservative, precise, and protect the bottom line. "
            "You focus on cash flow, burn rate, ROI thresholds, and financial risk. "
            "Give your opinion in 3–4 sentences. Call out risks clearly. Reference the numbers given."
        ),
    },
    {
        "id": "operations",
        "name": "Operations Agent",
        "emoji": "⚡",
        "color": "#7c3aed",
        "system": (
            "You are the COO. You are efficiency-obsessed and execution-focused. "
            "You care about processes, team capacity, scalability, and operational feasibility. "
            "Give your opinion in 3–4 sentences. Reference headcount and operational constraints in the data."
        ),
    },
]

# ─────────────────────────────────────────────────────────────────────────────
# Feature 2: Smart follow-up questions
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/smart-questions")
async def smart_questions(data: BusinessInput):
    """
    Analyse business input and return 2-3 smart follow-up questions (streaming SSE).
    """
    async def generate() -> AsyncGenerator[str, None]:
        llm = get_llm(temperature=0.5)
        prompt = f"""
You are a sharp business consultant. A business owner has submitted this profile:
- Monthly Revenue: ₹{data.revenue:,.0f}
- Marketing Budget: ₹{data.marketing_budget:,.0f}
- Employees: {data.employees}
- Main Problem: {data.main_problem}

Generate exactly 2–3 insightful follow-up questions that would help you give better strategy advice.
Focus on the most critical unknown gaps in the information provided.
Format: return ONLY a JSON array of question strings. No extra text. No markdown. Example:
["Question 1?", "Question 2?", "Question 3?"]
""".strip()

        full = ""
        async for chunk in llm.astream([HumanMessage(content=prompt)]):
            if chunk.content:
                full += chunk.content

        # Parse and emit
        try:
            clean = full.strip().replace("```json", "").replace("```", "").strip()
            questions = json.loads(clean)
        except Exception:
            questions = [
                "What marketing channels are you currently using?",
                "Who is your primary target customer?",
                "What does success look like for you in the next 6 months?",
            ]

        yield f"data: {json.dumps({'questions': questions})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

# ─────────────────────────────────────────────────────────────────────────────
# Feature 3-5: Full simulation (agents + final strategy) via SSE
# ─────────────────────────────────────────────────────────────────────────────

def build_context(data: FullSimulationInput) -> str:
    effective_budget = data.what_if_marketing or data.marketing_budget
    effective_employees = data.what_if_employees or data.employees
    is_whatif = (data.what_if_marketing is not None or data.what_if_employees is not None)

    context = f"""
Business Profile:
- Monthly Revenue: ₹{data.revenue:,.0f}
- Marketing Budget: ₹{effective_budget:,.0f}{' (What-If scenario)' if is_whatif else ''}
- Employees: {effective_employees}{' (What-If scenario)' if is_whatif else ''}
- Main Problem: {data.main_problem}
""".strip()

    if data.followup_questions and data.followup_answers:
        context += "\n\nAdditional Context (from follow-up Q&A):"
        for q, a in zip(data.followup_questions, data.followup_answers):
            if a.strip():
                context += f"\n- Q: {q}\n  A: {a}"

    return context


async def stream_full_simulation(data: FullSimulationInput) -> AsyncGenerator[str, None]:
    context = build_context(data)

    # ── Signal start ──
    yield f"data: {json.dumps({'type': 'start', 'context': context})}\n\n"
    await asyncio.sleep(0.1)

    llm = get_llm(temperature=0.75)
    agent_responses: dict[str, str] = {}

    # ── Feature 3 & 4: Each agent debates ──
    for agent in AGENTS:
        yield f"data: {json.dumps({'type': 'agent_start', 'agent': agent['id'], 'name': agent['name'], 'emoji': agent['emoji'], 'color': agent['color']})}\n\n"

        messages = [
            SystemMessage(content=agent["system"]),
            HumanMessage(content=context),
        ]

        full_response = ""
        async for chunk in llm.astream(messages):
            token = chunk.content
            if token:
                full_response += token
                yield f"data: {json.dumps({'type': 'token', 'agent': agent['id'], 'token': token})}\n\n"

        agent_responses[agent["id"]] = full_response
        yield f"data: {json.dumps({'type': 'agent_done', 'agent': agent['id']})}\n\n"
        await asyncio.sleep(0.15)

    # ── Feature 5: Final strategy synthesis ──
    yield f"data: {json.dumps({'type': 'strategy_start'})}\n\n"

    strategy_system = (
        "You are ORION, a master AI business strategist. "
        "You have listened to your Sales, Marketing, Finance, and Operations team. "
        "Now synthesize their views into ONE decisive, actionable business strategy. "
        "Structure your response EXACTLY as:\n\n"
        "**ORION STRATEGY:**\n[2–3 sentence executive recommendation]\n\n"
        "**TOP 3 ACTIONS:**\n1. [Action]\n2. [Action]\n3. [Action]\n\n"
        "**PROJECTED IMPACT:**\n[1–2 sentences on expected outcomes with specific numbers where possible]\n\n"
        "**CRITICAL RISK:**\n[1 sentence on the biggest risk to watch]"
    )

    strategy_user = f"""
Business Context:
{context}

Team Debate:
- Sales: {agent_responses.get('sales', '')}
- Marketing: {agent_responses.get('marketing', '')}
- Finance: {agent_responses.get('finance', '')}
- Operations: {agent_responses.get('operations', '')}

Synthesize the above into your final ORION strategy.
""".strip()

    synth_llm = get_llm(temperature=0.35)
    async for chunk in synth_llm.astream([
        SystemMessage(content=strategy_system),
        HumanMessage(content=strategy_user),
    ]):
        token = chunk.content
        if token:
            yield f"data: {json.dumps({'type': 'strategy_token', 'token': token})}\n\n"

    yield f"data: {json.dumps({'type': 'done'})}\n\n"


@app.post("/simulate")
async def simulate(data: FullSimulationInput):
    """Main SSE simulation endpoint."""
    return StreamingResponse(
        stream_full_simulation(data),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/health")
async def health():
    return {"status": "ok", "service": "Orion AI"}
