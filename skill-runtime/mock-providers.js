const copy = value => JSON.parse(JSON.stringify(value));

export function createMockProviders(seed = {}) {
  const buyers = seed.buyers || [
    {
      buyer_company_id: 'buyer_company_demo_001',
      legal_or_display_name: 'Northstar Food Ingredients LLC',
      country: 'US',
      domain: 'northstar.example',
      buyer_type: 'importer',
      sells_or_uses_product: true,
      product_evidence: ['ev_product_demo_001'],
      import_evidence: ['ev_trade_demo_001'],
      why_fit: '食品原料进口与分销业务覆盖茶粉、饮品原料场景。',
      why_now: '存在近期相关品类贸易记录。',
      evidence_refs: ['ev_company_demo_001']
    }
  ];
  const contacts = seed.contacts || {
    buyer_company_demo_001: [
      {
        contact_id: 'contact_demo_001',
        buyer_company_id: 'buyer_company_demo_001',
        name: 'Demo Procurement Manager',
        title: 'Procurement Manager',
        work_email: 'procurement@northstar.example',
        email_status: 'verified',
        role_reason: '采购负责人',
        source_refs: ['ev_contact_demo_001']
      }
    ]
  };
  const sent = [];

  return {
    trade_data: {
      async search_buyers() { return copy({ companies: buyers, evidence_refs: buyers.flatMap(item => item.evidence_refs || []) }); }
    },
    contact_data: {
      async search_people({ buyer_company_id }) { return copy(contacts[buyer_company_id] || []); }
    },
    email_transport: {
      async send(payload) {
        const record = { external_message_id: `mock_msg_${sent.length + 1}`, ...copy(payload), status: 'SENT' };
        sent.push(record);
        return copy(record);
      },
      async reply(payload) {
        const record = { external_message_id: `mock_reply_${sent.length + 1}`, ...copy(payload), status: 'SENT' };
        sent.push(record);
        return copy(record);
      },
      sent
    }
  };
}
