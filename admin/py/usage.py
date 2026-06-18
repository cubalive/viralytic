"""usage.py — REGISTRO DE GASTOS de APIs (Centro de Gastos).
record(...) añade una línea a data/usage.jsonl y calcula el USD según data/pricing.json.
Lo usan todos los generadores (Veo, OpenAI gpt-image / gpt-4o, ElevenLabs, Whisper).
Nunca lanza excepción: si algo falla, no rompe la generación.
"""
import os, json, datetime
ADMIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USAGEF = os.path.join(ADMIN, "data", "usage.jsonl")
PRICEF = os.path.join(ADMIN, "data", "pricing.json")

def _pricing():
    try: return json.load(open(PRICEF, encoding="utf-8"))
    except Exception: return {}

def _rate(provider, model):
    pr = _pricing().get(provider, {}) or {}
    return pr.get(model) or pr.get("default") or {}

def record(project, kind, provider, model, units, usd=None, note=""):
    r = _rate(provider, model)
    try:
        if usd is None: usd = float(units) * float(r.get("usd", 0))
    except Exception: usd = 0
    line = {"ts": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "project": project or "?", "kind": kind, "provider": provider, "model": model,
            "units": round(float(units or 0), 3), "unit": r.get("per", "unit"),
            "usd": round(float(usd or 0), 6), "note": str(note)[:120]}
    try:
        os.makedirs(os.path.dirname(USAGEF), exist_ok=True)
        with open(USAGEF, "a", encoding="utf-8") as f: f.write(json.dumps(line, ensure_ascii=False) + "\n")
    except Exception: pass
    return line["usd"]

def record_tokens(project, kind, model, tin, tout, note=""):
    r = _rate("openai", model)
    try: usd = (tin / 1000.0) * float(r.get("usd_in", 0)) + (tout / 1000.0) * float(r.get("usd", 0))
    except Exception: usd = 0
    return record(project, kind, "openai", model, (tin or 0) + (tout or 0), usd=usd, note=note)
