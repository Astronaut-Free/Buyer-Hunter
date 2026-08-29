export const A2_CAPABILITY_ID = 'qianpulse.a2.proactive_buyer_development';
export const A3_CAPABILITY_ID = 'qianpulse.a3.purchase_timing';
export const A4_CAPABILITY_ID = 'qianpulse.a4.supply_match';
export const A5_CAPABILITY_ID = 'qianpulse.a5.trade_risk';
export const A6_CAPABILITY_ID = 'qianpulse.a6.opportunity_progression';

export const CAPABILITY_SLOT_BY_ID = Object.freeze({
  [A3_CAPABILITY_ID]: 'a3',
  [A4_CAPABILITY_ID]: 'a4',
  [A5_CAPABILITY_ID]: 'a5'
});

export function capabilitySlot(capabilityId) {
  return CAPABILITY_SLOT_BY_ID[capabilityId] || null;
}
