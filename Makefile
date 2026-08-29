# Buyer Hunter / 黔脉 QianPulse — unified entry point (Linux / macOS / WSL / CI).
# Windows: use run.ps1 instead.
#
#   make setup   install python + node deps
#   make db      build the decision store from the committed fixture
#   make export  bridge the store into the agent runtime feed
#   make up      db + export, then run api + agent + demo together
#   make test    pytest + agent npm test
#   make audit   cross-runtime audit -> docs/AUDIT_<date>.md

PY ?= python
PIP ?= pip
API_PORT ?= 8000
AGENT_PORT ?= 3317
DEMO_PORT ?= 4173

.PHONY: setup db export api agent demo up test audit clean

setup:
	$(PIP) install -r requirements.txt
	cd agent && npm ci
	cd demo && npm ci

db:
	$(PY) pipeline/build_opportunity_store_v1.py

export: db
	$(PY) scripts/export_opportunities_for_agent.py

api:
	$(PY) -m uvicorn api.app:app --host 127.0.0.1 --port $(API_PORT)

agent:
	cd agent && PORT=$(AGENT_PORT) node server/bootstrap.js

demo:
	cd demo && npm run dev -- --host 127.0.0.1 --port $(DEMO_PORT)

up: export
	@echo "api  -> http://127.0.0.1:$(API_PORT)"
	@echo "agent-> http://127.0.0.1:$(AGENT_PORT)"
	@echo "demo -> http://127.0.0.1:$(DEMO_PORT)"
	$(PY) -m uvicorn api.app:app --host 127.0.0.1 --port $(API_PORT) & \
	  (cd agent && PORT=$(AGENT_PORT) node server/bootstrap.js) & \
	  (cd demo && npm run dev -- --host 127.0.0.1 --port $(DEMO_PORT)) & \
	  wait

test:
	$(PY) -m pytest -q
	cd agent && npm test

audit:
	$(PY) scripts/audit.py

clean:
	rm -rf runtime agent/db/opportunities.json agent/db/opportunities.meta.json agent/server/agent-state.json
