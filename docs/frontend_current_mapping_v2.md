# QianPulse Frontend Current to V2 Migration Mapping

## Branch

feature/qianpulse-frontend-v2

## Goal

Based on existing Buyer-Hunter frontend and Agent Runtime, incrementally evolve from lead/customer display to global opportunity operation workspace.

## Migration Principle

Keep:

- Opportunity model
- A2-A6 runtime
- Evidence layer
- Agent state
- Existing API contracts

Add:

- Opportunity Dashboard
- Opportunity Workspace
- Signal visualization
- Buyer Intelligence
- Conversation Progression UI
- BD Mission workspace

## Page Mapping

| Current Concept | V2 Page |
|---|---|
| Lead List | Opportunity Dashboard |
| Lead Detail | Opportunity Workspace |
| Customer Profile | Buyer Intelligence |
| AI Analysis | Signal + Evidence Panel |
| Content Generation | BD Conversation Kit |
| Follow Up | Conversation Progression |

## Component Layers

L1 Page Components

- Dashboard
- OpportunityRadar
- OpportunityWorkspace
- BuyerIntelligence
- MissionWorkspace
- Conversation
- Playbook

L2 Business Components

- OpportunityCard
- SignalTimeline
- BuyerProfile
- DemandCard
- SupplierGraph
- EvidencePanel
- ActionPanel
- ConversationTimeline

L3 Common Components

- ScoreBadge
- StatusTag
- SourceTag
- EvidenceTag
- RiskBadge

## API Direction

Frontend should consume business contracts, not data-source-specific fields.

Data sources:

API + crawler + user input

flow into:

Evidence -> Opportunity -> Action -> Outcome
