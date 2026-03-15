"""
Orion AI — Backend API
FastAPI + LangChain + Groq
Features: Smart Questions → Planner → Agent Debate → Real Financial Projections → Final Strategy
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

app = FastAPI(title="Orion AI Backend", version="2.0.0")

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
    # Core business metrics
    revenue: float
    marketing_budget: float
    employees: int
    main_problem: str
    # Optional financial inputs (asked if missing)
    avg_salary: float = 30000        # monthly avg salary per employee (₹)
    cac: float = 500                 # customer acquisition cost (₹)
    avg_order_value: float = 0       # average order/transaction value (₹). 0 = unknown
    gross_margin_pct: float = 0      # gross margin % (0 = unknown, will estimate)
    # What-if overrides
    what_if_marketing: float | None = None
    what_if_employees: int | None = None
    # Custom scenario (free text)
    custom_scenario: str = ""
    # Follow-up Q&A
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
# Real Financial Projections
# ─────────────────────────────────────────────────────────────────────────────

def compute_projections(data: FullSimulationInput) -> dict:
    """
    Real financial calculations based on standard business formulas.
    Uses actual input values; falls back to industry averages where data is missing.
    """
    rev = data.revenue
    mkt = data.what_if_marketing or data.marketing_budget
    base_mkt = data.marketing_budget
    emp = data.what_if_employees or data.employees
    salary = data.avg_salary  # monthly per employee
    cac = data.cac if data.cac > 0 else 500
    aov = data.avg_order_value if data.avg_order_value > 0 else rev * 0.01  # estimate if unknown
    gm_pct = data.gross_margin_pct if data.gross_margin_pct > 0 else 40.0  # industry avg 40%

    # ── 1. Cost structure ──────────────────────────────────────────────────
    monthly_payroll   = emp * salary
    total_opex        = monthly_payroll + mkt          # simplified opex
    base_opex         = (data.employees * salary) + base_mkt

    # ── 2. Gross Profit (current) ──────────────────────────────────────────
    gross_profit      = rev * (gm_pct / 100)
    net_profit        = gross_profit - total_opex
    base_net_profit   = rev * (gm_pct / 100) - base_opex
    net_margin_pct    = (net_profit / rev * 100) if rev > 0 else 0

    # ── 3. Customer metrics ────────────────────────────────────────────────
    # Estimated new customers from marketing spend using CAC
    new_customers_base    = base_mkt / cac if cac > 0 else 0
    new_customers_whatif  = mkt / cac if cac > 0 else 0
    incremental_customers = new_customers_whatif - new_customers_base

    # ── 4. Revenue projections ─────────────────────────────────────────────
    # Revenue uplift = incremental customers × average order value
    # Marketing ROI benchmark: ₹1 spent = ₹5 returned (industry avg 5:1 ROMI)
    # We blend CAC-based estimate with ROMI for robustness
    cac_based_uplift  = incremental_customers * aov
    romi_based_uplift = max(0, mkt - base_mkt) * 5.0   # 5:1 ROMI
    # Weight: 60% CAC-based, 40% ROMI — more conservative
    blended_uplift    = (cac_based_uplift * 0.6) + (romi_based_uplift * 0.4)
    projected_revenue = rev + blended_uplift
    revenue_uplift_pct = (blended_uplift / rev * 100) if rev > 0 else 0

    # ── 5. ROMI (Return on Marketing Investment) ───────────────────────────
    extra_mkt_spend = max(0, mkt - base_mkt)
    romi = ((blended_uplift - extra_mkt_spend) / extra_mkt_spend * 100) if extra_mkt_spend > 0 else 0

    # ── 6. Break-even analysis ─────────────────────────────────────────────
    # How many months to recover extra marketing spend from revenue uplift
    monthly_uplift     = blended_uplift
    payback_months     = (extra_mkt_spend / monthly_uplift) if monthly_uplift > 0 else 0

    # ── 7. Risk score (0–100) ──────────────────────────────────────────────
    # Components:
    #   a) Marketing spend ratio risk: >30% of revenue = high risk
    mkt_ratio       = (mkt / rev * 100) if rev > 0 else 0
    mkt_risk        = min(40, mkt_ratio * 1.3)
    #   b) Payroll burden: >60% of revenue = high risk
    payroll_ratio   = (monthly_payroll / rev * 100) if rev > 0 else 0
    payroll_risk    = min(30, payroll_ratio * 0.5)
    #   c) Profitability risk: negative net margin = high risk
    profit_risk     = 30 if net_profit < 0 else max(0, 30 - net_margin_pct)
    risk_score      = round(min(100, mkt_risk + payroll_risk + profit_risk), 1)

    # ── 8. Reward score (0–100) ────────────────────────────────────────────
    # Based on revenue uplift potential relative to spend
    uplift_ratio    = (blended_uplift / mkt * 100) if mkt > 0 else 0
    reward_score    = round(min(100, max(10, uplift_ratio * 0.8)), 1)

    # ── 9. CAC efficiency ──────────────────────────────────────────────────
    ltv             = aov * 12   # simplified LTV = AOV × 12 months
    ltv_cac_ratio   = round(ltv / cac, 2) if cac > 0 else 0

    return {
        # Revenue
        "baseline_revenue":      round(rev, 0),
        "projected_revenue":     round(projected_revenue, 0),
        "revenue_uplift":        round(blended_uplift, 0),
        "revenue_uplift_pct":    round(revenue_uplift_pct, 1),
        # Costs
        "baseline_costs":        round(base_opex, 0),
        "projected_costs":       round(total_opex, 0),
        "monthly_payroll":       round(monthly_payroll, 0),
        # Profit
        "gross_profit":          round(gross_profit, 0),
        "net_profit":            round(net_profit, 0),
        "base_net_profit":       round(base_net_profit, 0),
        "net_margin_pct":        round(net_margin_pct, 1),
        # Marketing
        "new_customers_base":    round(new_customers_base, 0),
        "new_customers_whatif":  round(new_customers_whatif, 0),
        "romi":                  round(romi, 1),
        "payback_months":        round(payback_months, 1),
        # Customer metrics
        "cac":                   round(cac, 0),
        "ltv":                   round(ltv, 0),
        "ltv_cac_ratio":         ltv_cac_ratio,
        # Scores
        "risk_score":            risk_score,
        "reward_score":          reward_score,
        # Flags
        "used_estimates":        {
            "aov":        data.avg_order_value == 0,
            "gm_pct":     data.gross_margin_pct == 0,
            "salary":     data.avg_salary == 30000,
        }
    }

# ─────────────────────────────────────────────────────────────────────────────
# Feature 2: Smart follow-up questions
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/smart-questions")
async def smart_questions(data: BusinessInput):
    async def generate() -> AsyncGenerator[str, None]:
        llm = get_llm(temperature=0.5)
        prompt = f"""
You are a sharp business consultant. A business owner has submitted this profile:
- Monthly Revenue: ₹{data.revenue:,.0f}
- Marketing Budget: ₹{data.marketing_budget:,.0f}
- Employees: {data.employees}
- Main Problem: {data.main_problem}

Generate exactly 2–3 insightful follow-up questions that would help give better strategy advice.
Focus on the most critical unknown gaps. Include at least one question about:
- Customer acquisition cost OR average order value (needed for financial projections)
Format: return ONLY a JSON array of question strings. No extra text. No markdown.
["Question 1?", "Question 2?", "Question 3?"]
""".strip()

        full = ""
        async for chunk in llm.astream([HumanMessage(content=prompt)]):
            if chunk.content:
                full += chunk.content

        try:
            clean = full.strip().replace("```json", "").replace("```", "").strip()
            questions = json.loads(clean)
        except Exception:
            questions = [
                "What is your average customer acquisition cost (CAC) or cost per lead?",
                "What is your average order/transaction value per customer?",
                "What marketing channels are currently driving the most revenue?",
            ]

        yield f"data: {json.dumps({'questions': questions})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

# ─────────────────────────────────────────────────────────────────────────────
# Context builder
# ─────────────────────────────────────────────────────────────────────────────

def build_context(data: FullSimulationInput, projections: dict) -> str:
    eff_mkt = data.what_if_marketing or data.marketing_budget
    eff_emp = data.what_if_employees or data.employees
    is_whatif = data.what_if_marketing is not None or data.what_if_employees is not None
    has_custom = bool(data.custom_scenario.strip())

    ctx = f"""
Business Profile:
- Monthly Revenue: ₹{data.revenue:,.0f}
- Marketing Budget: ₹{eff_mkt:,.0f}{' (What-If)' if is_whatif else ''}
- Employees: {eff_emp}{' (What-If)' if is_whatif else ''}
- Avg Salary: ₹{data.avg_salary:,.0f}/month
- Customer Acquisition Cost (CAC): ₹{data.cac:,.0f}
- Average Order Value: ₹{data.avg_order_value:,.0f}{' (estimated)' if data.avg_order_value == 0 else ''}
- Gross Margin: {data.gross_margin_pct if data.gross_margin_pct > 0 else '~40 (estimated)'}%
- Main Problem: {data.main_problem}

Financial Projections (calculated):
- Projected Revenue: ₹{projections['projected_revenue']:,.0f} (+{projections['revenue_uplift_pct']}%)
- Net Profit (projected): ₹{projections['net_profit']:,.0f} ({projections['net_margin_pct']}% margin)
- ROMI: {projections['romi']}% | Payback: {projections['payback_months']} months
- New Customers: {int(projections['new_customers_base'])} → {int(projections['new_customers_whatif'])}
- LTV/CAC Ratio: {projections['ltv_cac_ratio']} (>3 is healthy)
- Risk Score: {projections['risk_score']}/100 | Reward Score: {projections['reward_score']}/100
""".strip()

    if has_custom:
        ctx += f"\n\nCustom Scenario to Analyze:\n{data.custom_scenario}"

    if data.followup_questions and data.followup_answers:
        ctx += "\n\nAdditional Context (Q&A):"
        for q, a in zip(data.followup_questions, data.followup_answers):
            if a.strip():
                ctx += f"\n- Q: {q}\n  A: {a}"

    return ctx

# ─────────────────────────────────────────────────────────────────────────────
# Main simulation stream
# ─────────────────────────────────────────────────────────────────────────────

async def stream_full_simulation(data: FullSimulationInput) -> AsyncGenerator[str, None]:

    # ── 1. Compute real financial projections first ──────────────────────────
    projections = compute_projections(data)
    yield f"data: {json.dumps({'type': 'projections', 'data': projections})}\n\n"
    await asyncio.sleep(0.05)

    context = build_context(data, projections)

    # ── 2. Planner bubble ───────────────────────────────────────────────────
    eff_mkt = data.what_if_marketing or data.marketing_budget
    has_custom = bool(data.custom_scenario.strip())
    planner_lines = [
        f"Analyzing {data.employees} employees, ₹{data.revenue:,.0f} revenue, ₹{eff_mkt:,.0f} marketing budget.",
        f"Projected revenue uplift: +{projections['revenue_uplift_pct']}% → ₹{projections['projected_revenue']:,.0f}.",
        f"Risk score: {projections['risk_score']}/100 · Reward score: {projections['reward_score']}/100.",
    ]
    if has_custom:
        planner_lines.append(f"Custom scenario loaded: \"{data.custom_scenario[:80]}{'...' if len(data.custom_scenario) > 80 else ''}\"")
    if projections["used_estimates"]["aov"]:
        planner_lines.append("⚠️ Average order value was estimated — enter it for more accurate projections.")
    if projections["used_estimates"]["gm_pct"]:
        planner_lines.append("⚠️ Gross margin was estimated at 40% — enter your actual margin for precision.")

    planner_msg = " ".join(planner_lines) + " Routing to department heads now."
    yield f"data: {json.dumps({'type': 'planner', 'content': planner_msg})}\n\n"
    await asyncio.sleep(0.3)

    # ── 3. Agent debate ─────────────────────────────────────────────────────
    llm = get_llm(temperature=0.75)
    agent_responses: dict[str, str] = {}

    for agent in AGENTS:
        yield f"data: {json.dumps({'type': 'agent_start', 'agent': agent['id']})}\n\n"

        full_response = ""
        async for chunk in llm.astream([
            SystemMessage(content=agent["system"]),
            HumanMessage(content=context),
        ]):
            if chunk.content:
                full_response += chunk.content
                yield f"data: {json.dumps({'type': 'token', 'agent': agent['id'], 'token': chunk.content})}\n\n"

        agent_responses[agent["id"]] = full_response
        yield f"data: {json.dumps({'type': 'agent_done', 'agent': agent['id']})}\n\n"
        await asyncio.sleep(0.15)

    # ── 4. Final strategy synthesis ─────────────────────────────────────────
    yield f"data: {json.dumps({'type': 'strategy_start'})}\n\n"

    custom_note = f"\nAlso specifically address the custom scenario: {data.custom_scenario}" if has_custom else ""

    strategy_system = (
        "You are ORION, a master AI business strategist. "
        "Synthesize the team debate into ONE decisive, actionable strategy. "
        "Structure your response EXACTLY as:\n\n"
        "**ORION STRATEGY:**\n[2–3 sentence executive recommendation]\n\n"
        "**TOP 3 ACTIONS:**\n1. [Specific action with metric]\n2. [Specific action with metric]\n3. [Specific action with metric]\n\n"
        "**PROJECTED IMPACT:**\n[Use the exact financial numbers from the projections provided]\n\n"
        "**CRITICAL RISK:**\n[1 sentence on the biggest risk]"
    )

    strategy_user = f"""
Business Context + Financials:
{context}

Team Debate:
- Sales: {agent_responses.get('sales', '')}
- Marketing: {agent_responses.get('marketing', '')}
- Finance: {agent_responses.get('finance', '')}
- Operations: {agent_responses.get('operations', '')}
{custom_note}

Synthesize into the final ORION strategy using the exact financial numbers above.
""".strip()

    async for chunk in get_llm(temperature=0.35).astream([
        SystemMessage(content=strategy_system),
        HumanMessage(content=strategy_user),
    ]):
        if chunk.content:
            yield f"data: {json.dumps({'type': 'strategy_token', 'token': chunk.content})}\n\n"

    yield f"data: {json.dumps({'type': 'done'})}\n\n"


@app.post("/simulate")
async def simulate(data: FullSimulationInput):
    return StreamingResponse(
        stream_full_simulation(data),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/health")
async def health():
    return {"status": "ok", "service": "Orion AI v2"}