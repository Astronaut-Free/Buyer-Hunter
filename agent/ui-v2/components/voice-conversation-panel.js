import { el, formatDateTime, textOrUnknown, toneForStatus } from '../shared/dom.js';
import { renderViewState, ViewStatus } from '../view-state.js';

function array(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeVoiceSession(input = {}) {
  const source = input.voice_session || input.voiceSession || input;
  return {
    sessionId: source.session_id || source.id || null,
    opportunityId: source.opportunity_id || null,
    threadId: source.thread_id || null,
    mediaRef: source.media_ref || null,
    startedAt: source.started_at || null,
    endedAt: source.ended_at || null,
    transcriptStatus: source.transcript_status || 'UNKNOWN',
    transcript: source.transcript || null,
    transcriptRef: source.transcript_ref || null,
    summary: source.summary || null,
    extractedFactIds: array(source.extracted_fact_ids),
    handoffStatus: source.handoff_status || 'AUTO',
  };
}

export function renderVoiceConversationPanel(input = {}, {
  title = '语音对话',
  onStart,
  onStop,
  onHumanTakeover,
} = {}) {
  const session = normalizeVoiceSession(input);
  const panel = el('section', { className: 'qp-v2-card qp-v2-voice-panel' });
  const active = Boolean(session.sessionId && !session.endedAt);
  const canStart = typeof onStart === 'function';
  const canStop = typeof onStop === 'function';
  const canTakeover = typeof onHumanTakeover === 'function';

  panel.appendChild(el('header', { className: 'qp-v2-panel-head' }, [
    el('div', {}, [
      el('h3', { text: title }),
      el('p', { text: '语音转写进入 Conversation Event；语音模块不直接修改 Opportunity Stage。' }),
    ]),
    el('span', {
      className: 'qp-v2-tag',
      text: session.transcriptStatus,
      dataset: { tone: toneForStatus(session.transcriptStatus === 'FINAL' ? 'COMPLETED' : session.transcriptStatus) },
    }),
  ]));

  if (!session.sessionId) {
    panel.appendChild(renderViewState({
      status: ViewStatus.EMPTY,
      title: canStart ? '尚未开始语音会话' : '语音通道待接线',
      message: canStart
        ? '开始后，STT 转写、事实提取与人工接管共用 Conversation Contract。'
        : '前端组件已就位；STT / TTS / Voice Session API 未接入前保持不可执行。',
    }));
  } else {
    panel.appendChild(el('div', { className: 'qp-v2-voice-session' }, [
      el('div', { className: 'qp-v2-voice-status' }, [
        el('span', { className: `qp-v2-voice-pulse${active ? ' is-live' : ''}`, attrs: { 'aria-hidden': 'true' } }),
        el('div', {}, [
          el('strong', { text: active ? '语音会话进行中' : '语音会话已结束' }),
          el('p', { text: `${formatDateTime(session.startedAt)}${session.endedAt ? ` → ${formatDateTime(session.endedAt)}` : ''}` }),
        ]),
      ]),
      el('div', { className: 'qp-v2-voice-facts' }, [
        el('span', { text: '已提取事实' }),
        el('strong', { text: String(session.extractedFactIds.length) }),
      ]),
    ]));

    panel.appendChild(el('section', { className: 'qp-v2-voice-transcript' }, [
      el('h4', { text: '实时 / 最终转写' }),
      el('p', { text: textOrUnknown(session.transcript, '转写内容待生成') }),
    ]));

    if (session.summary) {
      panel.appendChild(el('section', { className: 'qp-v2-voice-summary' }, [
        el('h4', { text: '通话总结' }),
        el('p', { text: session.summary }),
      ]));
    }
  }

  const actions = el('footer', { className: 'qp-v2-action-actions' });
  if (!active) {
    actions.appendChild(el('button', {
      className: 'qp-v2-primary-button qp-v2-focus-ring',
      text: canStart ? '开始语音会话' : '语音能力待接线',
      attrs: { type: 'button', disabled: canStart ? null : 'disabled' },
      on: { click: canStart ? () => onStart() : undefined },
    }));
  } else {
    actions.appendChild(el('button', {
      className: 'qp-v2-secondary-button qp-v2-focus-ring',
      text: '人工接管',
      attrs: { type: 'button', disabled: canTakeover ? null : 'disabled' },
      on: { click: canTakeover ? () => onHumanTakeover(session) : undefined },
    }));
    actions.appendChild(el('button', {
      className: 'qp-v2-primary-button qp-v2-focus-ring',
      text: '结束会话',
      attrs: { type: 'button', disabled: canStop ? null : 'disabled' },
      on: { click: canStop ? () => onStop(session) : undefined },
    }));
  }
  panel.appendChild(actions);

  return panel;
}
