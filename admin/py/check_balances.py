"""check_balances.py — vigila el crédito por proveedor y AVISA POR EMAIL cuando se agota.
Calcula restante = credit - gastado (data/usage.jsonl). Si restante <= alertAt, manda un correo
(Resend SMTP) a alertEmail y lo marca (no repite hasta que el saldo se recupere y vuelva a bajar).
Escribe data/alerts.json para el banner del dashboard. Lo corre el cron diario.
Uso: python py/check_balances.py [--force]
"""
import os, sys, json, smtplib, datetime
from email.mime.text import MIMEText

ADMIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def load_env(p):
    if not os.path.exists(p): return
    for line in open(p, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1); os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
load_env(os.path.join(ADMIN, ".env"))
load_env(os.path.join(ADMIN, "..", "apps", "workers", ".env"))  # SMTP (Resend) + NOTIFY_EMAIL

BAL = json.load(open(os.path.join(ADMIN, "data", "balances.json"), encoding="utf-8"))
TO = BAL.get("alertEmail") or os.environ.get("NOTIFY_EMAIL") or "info@passkal.com"

# gasto por proveedor (usd) desde usage.jsonl
spent = {}
uf = os.path.join(ADMIN, "data", "usage.jsonl")
if os.path.exists(uf):
    for line in open(uf, encoding="utf-8"):
        line = line.strip()
        if not line: continue
        try: r = json.loads(line)
        except: continue
        spent[r.get("provider", "?")] = spent.get(r.get("provider", "?"), 0) + (float(r.get("usd") or 0))

rows = []
for p in BAL.get("providers", []):
    rem = round(float(p.get("credit", 0)) - spent.get(p["key"], 0), 2)
    rows.append({"key": p["key"], "label": p.get("label", p["key"]), "credit": p.get("credit", 0),
                 "remaining": rem, "alertAt": float(p.get("alertAt", 0)), "low": rem <= float(p.get("alertAt", 0))})

# estado previo (para no repetir el aviso)
af = os.path.join(ADMIN, "data", "alerts.json")
prev = json.load(open(af, encoding="utf-8")) if os.path.exists(af) else {"alerted": []}
alerted = set(prev.get("alerted", []))
force = "--force" in sys.argv

def send(subj, body):
    host = os.environ.get("SMTP_HOST"); user = os.environ.get("SMTP_USER"); pw = os.environ.get("SMTP_PASS")
    frm = os.environ.get("SMTP_FROM", "Viralytic <noreply@rumbatown.com>")
    if not (host and user and pw):
        print("  (sin SMTP configurado, no se envía email)"); return False
    msg = MIMEText(body, "plain", "utf-8"); msg["Subject"] = subj; msg["From"] = frm; msg["To"] = TO
    port = int(os.environ.get("SMTP_PORT", 465))
    try:
        if port == 465:
            s = smtplib.SMTP_SSL(host, port, timeout=30)
        else:
            s = smtplib.SMTP(host, port, timeout=30); s.starttls()
        s.login(user, pw); s.sendmail(frm, [TO], msg.as_string()); s.quit()
        return True
    except Exception as e:
        print("  email err:", str(e)[:120]); return False

now_low = [r for r in rows if r["low"]]
new_alerts = []
for r in now_low:
    if force or r["key"] not in alerted:
        subj = f"⚠️ Crédito BAJO: {r['label']} — quedan ${r['remaining']}"
        body = (f"El crédito de {r['label']} está por agotarse.\n\n"
                f"Restante: ${r['remaining']} (umbral de aviso: ${r['alertAt']}, crédito total: ${r['credit']}).\n\n"
                f"Recarga ese proveedor o ese motor dejará de generar.\n\n— Viralytic Admin")
        if send(subj, body):
            print(f"  ✉️  aviso enviado: {r['label']} (${r['remaining']}) -> {TO}")
            new_alerts.append(r["key"])

# nuevos alerted = los que siguen bajos (mantener marca) ; recuperados salen de la lista
still = set(r["key"] for r in now_low)
final_alerted = list((alerted | set(new_alerts)) & still)
json.dump({"updatedAt": datetime.datetime.now().isoformat(timespec="seconds"), "alerted": final_alerted,
           "low": now_low, "all": rows}, open(af, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"check_balances: {len(now_low)} proveedor(es) en alerta · email a {TO}")
for r in rows:
    print(f"  {r['label']:<38} restante ${r['remaining']:<8} umbral ${r['alertAt']}  {'⚠️ BAJO' if r['low'] else 'ok'}")
