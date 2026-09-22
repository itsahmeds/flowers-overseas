#!/usr/bin/env python3
"""Fleet ledger: parse every session transcript for this project and emit docs/ledger/ledger.json.

Run at session close, then republish the artifact (url in CLAUDE.md) with the refreshed data.
Reads only ~/.claude/projects/<project>/**/*.jsonl — no network, no secrets.
Sessions started outside the repo (e.g. from ~/dev) live under another project folder; list their
top-level transcript paths, one per line, in docs/ledger/extra-sessions.txt and they are read too,
with their subagents.
"""
import json, os, glob, re, collections, datetime
ROOT="/Users/ahmed/.claude/projects/-Users-ahmed-dev-flowers-overseas"
SCR=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "docs", "ledger")

PR2TASK={"71":"TASK-014","75":"TASK-015","32":"TASK-059","66":"TASK-088","65":"TASK-090",
 "70":"TASK-091","74":"TASK-092","68":"TASK-097","80":"TASK-098","72":"TASK-105",
 "76":"TASK-107","73":"TASK-108","77":"TASK-120","79":"TASK-122","78":"TASK-134",
 "67":"TASK-059","69":"TASK-059","60":"TASK-059","63":"TASK-087","64":"TASK-089","61":"TASK-056","62":"TASK-013"}
PLAIN={
 "TASK-124":"Poland's delivery rules, holidays and the data checks behind them",
 "TASK-125":"One price model feeding the product page, its markup and its sitemap row",
 "TASK-143":"Find and fix tests that could not fail",
 "TASK-016":"The catalogue and pricing tables",
 "TASK-080":"Put the first photographs on the site",
 "TASK-082":"Real image storage on Cloudflare R2",
 "TASK-093":"Structured data so Google understands the pages",
 "TASK-094":"Sitemaps and the language links between pages",
 "TASK-110":"Country category pages, e.g. roses in Poland",
 "TASK-111":"Country occasion pages, e.g. Mother's Day in Poland",
 "TASK-112":"Category and occasion hubs, with no country chosen",
 "TASK-113":"Publish the links that make the shop reachable",
 "TASK-114":"Sorting, paging, and what the URL may carry",
 "TASK-119":"Offer a better language without redirecting anyone",
 "TASK-121":"Product page URLs and which ones exist",
 "TASK-123":"The delivery calendar: cutoffs, holidays, time zones",
 "TASK-135":"Build the container without needing any credential",
 "TASK-137":"Give the browser tests an origin CI owns",
 "TASK-138":"Serve every photograph from R2, no database needed",
 "TASK-139":"Linux screenshots so the visual gate can pass",
 "TASK-144":"Prompt records for the remaining 144 images",
 "TASK-013":"Environment contract for the database and image storage",
 "TASK-014":"How database changes get written, applied and checked",
 "TASK-015":"The first big schema: languages, countries, cities, currencies",
 "TASK-056":"Turn the quality gates on so a bad build cannot merge",
 "TASK-059":"Make the design folder the single source of truth for every page",
 "TASK-087":"The country-guide content model and its first guide",
 "TASK-088":"Guide text for six more countries, plus British English versions",
 "TASK-089":"Work out when each gifting occasion falls, per country",
 "TASK-090":"The rule that decides which pages search engines may index",
 "TASK-091":"The country guide page itself",
 "TASK-092":"The all-destinations hub page and the links into it",
 "TASK-097":"One place that knows which environment the app is running in",
 "TASK-098":"Container image and the Railway staging service",
 "TASK-105":"Readable URLs and the builders that make them",
 "TASK-107":"One view model feeding the shop page, its markup and its sitemap row",
 "TASK-108":"The reusable shop parts: product card, grid, toolbar, paging",
 "TASK-109":"The country shop landing page",
 "TASK-120":"Remove delivery promises we cannot keep yet",
 "TASK-122":"The Orthodox Easter date rule for Romania",
 "TASK-134":"Stop two slow tests failing every pull request",
}
SESSNAME={}
def firstuser(path, limit=4000):
    try:
        with open(path, errors="replace") as fh:
            for line in fh:
                if '"user"' not in line: continue
                try: d=json.loads(line)
                except Exception: continue
                if d.get("type")!="user": continue
                c=(d.get("message") or {}).get("content")
                t=" ".join(x.get("text","") for x in c if isinstance(x,dict)) if isinstance(c,list) else (c if isinstance(c,str) else "")
                t=t.strip()
                if t: return t[:limit]
    except Exception: pass
    return ""
def scan(path):
    per=collections.defaultdict(lambda: collections.defaultdict(lambda: dict(msgs=0,out=0,newin=0,cr=0,think=0)))
    first=last=None
    with open(path, errors="replace") as fh:
        for line in fh:
            if '"usage"' not in line: continue
            try: d=json.loads(line)
            except Exception: continue
            m=d.get("message") or {}; u=m.get("usage") or {}; mod=m.get("model")
            if not mod or not isinstance(u,dict) or mod=="<synthetic>": continue
            ts=d.get("timestamp") or ""; day=ts[:10] or "unknown"
            r=per[mod][day]
            r["msgs"]+=1
            r["out"]+=u.get("output_tokens",0) or 0
            r["newin"]+=(u.get("input_tokens",0) or 0)+(u.get("cache_creation_input_tokens",0) or 0)
            r["cr"]+=u.get("cache_read_input_tokens",0) or 0
            r["think"]+=((u.get("output_tokens_details") or {}).get("thinking_tokens",0) or 0)
            if ts:
                if not first or ts<first: first=ts
                if not last or ts>last: last=ts
    return per, first, last
def dur(a,b):
    if not a or not b: return 0
    f="%Y-%m-%dT%H:%M:%S.%fZ"
    try: return int((datetime.datetime.strptime(b,f)-datetime.datetime.strptime(a,f)).total_seconds())
    except Exception: return 0

agents=[]; sessions=[]
EXTRA=os.path.join(SCR,"extra-sessions.txt")
extra=[l.strip() for l in open(EXTRA)] if os.path.exists(EXTRA) else []
extra=[l for l in extra if l and not l.startswith("#") and os.path.exists(l)]
for f in sorted(glob.glob(ROOT+"/*.jsonl"))+extra:
    sid=os.path.basename(f)[:-6]; per,fi,la=scan(f)
    rows=[]
    for mod,days in per.items():
        for day,r in days.items():
            rows.append(dict(model=mod, day=day, **r))
    if rows: sessions.append(dict(id=sid, short=sid[:8], first=fi, last=la, rows=rows))
for f in sorted(glob.glob(ROOT+"/*/subagents/agent-*.jsonl"))+sorted(g for e in extra for g in glob.glob(e[:-6]+"/subagents/agent-*.jsonl")):
    sid=f.split("/")[-3]; aid=os.path.basename(f)[6:-6]
    per,fi,la=scan(f); txt=firstuser(f)
    pr=re.search(r'/review\s+(\d+)', txt); task=re.search(r'TASK-(\d+)', txt)
    task="TASK-"+task.group(1) if task else None
    prn=pr.group(1) if pr else None
    if not task and prn: task=PR2TASK.get(prn)
    if prn and PR2TASK.get(prn): task=PR2TASK[prn]
    kind = "review" if (prn or "merge gate" in txt) else ("implement" if "/implement" in txt else ("design" if "artboard" in txt.lower() or "design" in txt[:200].lower() else "other"))
    rnd = 2 if re.search(r'round\s*2|ROUND 2', txt) else (1 if kind=="review" else None)
    mod=max(per, key=lambda m: sum(d["out"] for d in per[m].values())) if per else "?"
    agg=dict(msgs=0,out=0,newin=0,cr=0,think=0)
    day=None
    for m,days in per.items():
        for d,r in days.items():
            day=day or d
            for k in agg: agg[k]+=r[k]
    agents.append(dict(id=aid[:8], session=sid[:8], day=day or "?", task=task, plain=PLAIN.get(task,""), kind=kind, pr=prn,
                       model=mod, secs=dur(fi,la), **agg))
agents.sort(key=lambda a:(a["day"], a["id"]))
out=dict(generated=datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ"), sessions=sessions, agents=agents, plain=PLAIN)
json.dump(out, open(SCR+"/ledger.json","w"), separators=(",",":"))
tot=lambda k: sum(a[k] for a in agents)
print("agents",len(agents),"out",tot("out"),"newin",tot("newin"),"cr",tot("cr"),"think",tot("think"))
print("unlabelled:", sum(1 for a in agents if not a["task"]))
bym=collections.Counter()
for s in sessions:
    for r in s["rows"]: bym[r["model"]]+=r["out"]
print("orchestrator output by model:", dict(bym))
print("size", os.path.getsize(SCR+"/ledger.json"))
