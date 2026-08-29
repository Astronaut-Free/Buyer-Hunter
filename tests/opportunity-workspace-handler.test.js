import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpportunityWorkspaceHandler } from '../server/opportunity-workspace-handler.js';

function fixture() {
  const state = {
    opportunities: {
      opp1: {
        id: 'opp1',
        seller: { id: 'seller1', name: 'Seller One' },
        buyer: { id: 'buyer1', name: 'Buyer One' },
        status: 'ACTIVE',
        stage: 'QUALIFYING',
        evidence_ids: []
      }
    }
  };
  const canAccess = (user, opportunity) =>
    user?.role === 'INTERNAL' ||
    (user?.role === 'SELLER' && opportunity.seller?.id === user.id) ||
    (user?.role === 'BUYER' && opportunity.buyer?.id === user.id);
  return createOpportunityWorkspaceHandler({ getState: () => state, canAccess });
}

test('workspace handler requires authentication', () => {
  const handler = fixture();
  const result = handler({ opportunityId: 'opp1', user: null });
  assert.equal(result.status, 401);
  assert.equal(result.body.code, 'AUTH_REQUIRED');
});

test('workspace handler rejects users outside Opportunity', () => {
  const handler = fixture();
  const result = handler({ opportunityId: 'opp1', user: { id: 'seller2', role: 'SELLER' } });
  assert.equal(result.status, 403);
  assert.equal(result.body.code, 'FORBIDDEN');
});

test('workspace handler returns seller projection for authorized seller', () => {
  const handler = fixture();
  const result = handler({ opportunityId: 'opp1', user: { id: 'seller1', role: 'SELLER' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.opportunity.id, 'opp1');
  assert.equal(result.body.opportunity.seller.id, 'seller1');
});

test('workspace handler returns buyer-safe projection', () => {
  const handler = fixture();
  const result = handler({ opportunityId: 'opp1', user: { id: 'buyer1', role: 'BUYER' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.opportunity.seller, undefined);
  assert.equal(result.body.a2, undefined);
});
