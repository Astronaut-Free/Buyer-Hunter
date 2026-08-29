# Buyer Hunter / 黔脉 QianPulse — unified entry point (Linux / macOS / WSL / CI).
# Windows: use run.ps1 instead.
#
#   make setup   install python + node deps
#   make db      build the decision store from the committed fixture
#   make export  bridge the store into the agent runtime feed
#   make import  import agent outcomes back into the store (reverse bridge)
#   make up      db + export + import, then run site + api + agent together
#   make test    pytest + agent npm test
#   make audit   cross-runtime audit -> docs/AUDIT_<date>.md

PY ?= python
PIP ?= pip
API_PORT ?= 8000
AGENT_PORT ?= 3317
SITE_PORT ?= 4180

.PHONY: setup db export import site api agent up test audit clean

setup:
	$(PIP) install -r requirements.txt
	cd agent && npm ci

db:
	$(PY) pipeline/build_opportunity_store_v1.py

export: db
	$(PY) scripts/export_opportunities_for_agent.py

import: db
	$(PY) scripts/import_agent_outcomes.py

site:
	$(PY) -m http.server $(SITE_PORT) --bind 127.0.0.1 --directory site

api:
	$(PY) -m uvicorn api.app:app --host 127.0.0.1 --port $(API_PORT)

agent:
	cd agent && PORT=$(AGENT_PORT) PYTHON_BIN=$(PY) node server/bootstrap.js

up: export import
	@echo "site -> http://127.0.0.1:$(SITE_PORT)   (front door)"
	@echo "api  -> http://127.0.0.1:$(API_PORT)"
	@echo "agent-> http://127.0.0.1:$(AGENT_PORT)   (workbench)"
	$(PY) -m http.server $(SITE_PORT) --bind 127.0.0.1 --directory site & \
	  $(PY) -m uvicorn api.app:app --host 127.0.0.1 --port $(API_PORT) & \
	  (cd agent && PORT=$(AGENT_PORT) PYTHON_BIN=$(PY) node server/bootstrap.js) & \
	  wait

test:
	$(PY) -m pytest -q
	cd agent && PYTHON_BIN=$(PY) npm test

audit:
	$(PY) scripts/audit.py

clean:
	rm -rf runtime agent/db/opportunities.json agent/db/opportunities.meta.json agent/db/agent-outcomes.json agent/db/agent-outcomes.meta.json agent/server/agent-state.json
