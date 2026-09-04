import { el, formatDateTime, textOrUnknown, toneForStatus } from '../shared/dom.js';
import { renderViewState, ViewStatus } from '../view-state.js';

function array(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeConversationMessage(item = {}) {
  return {
    id: item.message_id || item.event_id || item.id || null,
    threadId: item.thread_id || null,
    direction: String(item.direction || 'UNKNOWN').toUpperCase(),
    channel: item.channel || item.source || 'unknown',
    content: item.content || item.transcript || null,
    timestamp: item.timestamp || item.created_at || null,
    senderRole: item.sender?.actor_role || item.actor_role || null,
    sourceRef: item.source_ref || item.evidence_ref || null,
    intent: item.intent || null,
    changedFields: array(item.changed_fields),
  };
}

function messageRow(raw) {
  const item = normalizeConversationMessage(raw);
  const inbound = item.direction === 'INBOUND';
  const tone = inbound ? 'success' : item.direction === 'OUTBOUND' ? 'warning' : 'unknown';
  return el('article', { className: `qp-v2-conversation-message ${inbound ? 'is-inbound' : 'is-outbound'}` }, [
    el('div', { className: 'qp-v2-conversation-rail' }, [
      el('span', { className: 'qp-v2-conversation-dot', dataset: { tone } }),
    ]),
    el('div', { className: 'qp-v2-conversation-body' }, [
      el('header', { className: 'qp-v2-conversation-head' }, [
        el('div', {}, [
          el('strong', { text: inbound ? '买家 → 我方' : item.direction === 'OUTBOUND' ? '我方 → 买家' : '系统消息' }),
          el('span', { text: `${item.channel} · ${formatDateTime(item.timestamp)}` }),
        ]),
        el('span', { className: 'qp-v2-tag', text: item.direction, dataset: { tone: toneForStatus(inbound ? 'READY' : item.direction) } }),
      ]),
      el('p', { text: textOrUnknown(item.content, '消息内容不可见或待核验') }),
      item.intent ? el('div', { className: 'qp-v2-conversation-meta' }, [
        el('span', { text: `Intent ${item.intent.label || 'UNKNOWN'}` }),
        item.intent.score !== undefined && item.intent.score !== null ? el('span', { text: `Score ${item.intent.score}` }) : null,
      ]) : null,
      item.changedFields.length ? el('div', { className: 'qp-v2-conversation-fields' }, item.changedFields.map(field => el('span', { className: 'qp-v2-chip', text: field }))) : null,
    ]),
  ]);
}

export function renderConversationTimeline(input = {}, { title = '对话推进' } = {}) {
  const rows = Array.isArray(input) ? input : (input.messages || input.activity?.messages || []);
  const messages = rows.map(normalizeConversationMessage).sort((a, b) => {
    return new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime();
  });
  const panel = el('section', { className: 'qp-v2-card qp-v2-conversation-timeline' });

  panel.appendChild(el('header', { className: 'qp-v2-panel-head' }, [
    el('div', {}, [
      el('h3', { text: title }),
      el('p', { text: 'Email、IM、语音统一进入 Conversation Contract。' }),
    ]),
    el('span', { className: 'qp-v2-tag', text: `${messages.length} 条`, dataset: { tone: messages.length ? 'success' : 'unknown' } }),
  ]));

  if (!messages.length) {
    panel.appendChild(renderViewState({
      status: ViewStatus.UNKNOWN,
      title: '尚未发生商务对话',
      message: '当前没有可追溯消息，意向与对话阶段保持 UNKNOWN。',
    }));
    return panel;
  }

  const list = el('div', { className: 'qp-v2-conversation-list' });
  rows.sort((a, b) => String(a.timestamp || a.created_at || '').localeCompare(String(b.timestamp || b.created_at || '')))
    .map(messageRow)
    .forEach(row => list.appendChild(row));
  panel.appendChild(list);
  return panel;
}
