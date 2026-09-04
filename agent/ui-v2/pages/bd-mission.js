import { agentApi } from '../api-client.js';
import { navigate } from '../router.js';
import { el } from '../shared/dom.js';
import { button, errorState, pageRoot } from './page-utils.js';

function summaryCard(payload) {
  const target = payload?.input?.target || {};
  const buyer = payload?.input?.buyer_profile || {};
  const constraints = payload?.input?.constraints || {};
  return el('section', { className: 'qp-v2-card qp-v2-mission-preview' }, [
    el('header', { className: 'qp-v2-panel-head' }, [
      el('div', {}, [el('h3', { text: 'Mission 解析结果' }), el('p', { text: `解析源：${payload?.parsed_source || 'UNKNOWN'}` })]),
    ]),
    el('div', { className: 'qp-v2-mission-preview-grid' }, [
      el('div', {}, [el('span', { text: '目标市场' }), el('strong', { text: (target.countries || []).join('、') || 'UNKNOWN' })]),
      el('div', {}, [el('span', { text: '产品关键词' }), el('strong', { text: (target.product_keywords || []).join('、') || 'UNKNOWN' })]),
      el('div', {}, [el('span', { text: '买家类型' }), el('strong', { text: (buyer.company_types || []).join('、') || 'UNKNOWN' })]),
      el('div', {}, [el('span', { text: '执行渠道' }), el('strong', { text: payload?.input?.execution?.channel || 'UNKNOWN' })]),
      el('div', {}, [el('span', { text: '人工 Gate' }), el('strong', { text: payload?.input?.execution?.human_gate ? '开启' : '未开启' })]),
      el('div', {}, [el('span', { text: '候选上限' }), el('strong', { text: constraints.max_candidates ?? 'UNKNOWN' })]),
    ]),
  ]);
}

export async function renderBdMissionPage() {
  const root = pageRoot('BD Mission', '用自然语言下达全球生意开发目标，再由 A2 Runtime 执行。');
  const body = el('div', { className: 'qp-v2-page-body' });
  root.appendChild(body);

  const textarea = el('textarea', {
    className: 'qp-v2-textarea qp-v2-focus-ring',
    attrs: { rows: '5', placeholder: '例如：帮我找美国和德国正在采购抹茶的进口商和食品品牌，优先有有机认证需求的买家。' },
  });
  const status = el('div', { className: 'qp-v2-mission-status qp-v2-muted', text: '等待任务目标' });
  const preview = el('div');
  let parsedPayload = null;

  const parse = async () => {
    const text = textarea.value.trim();
    if (!text) return;
    status.textContent = '正在解析 Mission…';
    preview.replaceChildren();
    try {
      parsedPayload = await agentApi.parseMission({ text, language: 'auto' });
      preview.replaceChildren(summaryCard(parsedPayload));
      status.textContent = 'Mission 已解析，等待执行确认';
    } catch (error) {
      parsedPayload = null;
      preview.replaceChildren(errorState(error, parse));
      status.textContent = '解析失败';
    }
  };

  const execute = async () => {
    if (!parsedPayload) await parse();
    if (!parsedPayload) return;
    status.textContent = 'A2 Agent 正在执行…';
    try {
      const result = await agentApi.createRun(parsedPayload);
      const generated = result?.run?.generated_opportunity_ids || result?.generated_opportunity_ids || [];
      status.textContent = `Mission 已启动：${result?.run?.run_id || 'Run created'}`;
      if (generated[0]) navigate('workspace', { id: generated[0] });
      else preview.appendChild(el('pre', { className: 'qp-v2-json-preview', text: JSON.stringify(result, null, 2) }));
    } catch (error) {
      preview.prepend(errorState(error, execute));
      status.textContent = '执行失败';
    }
  };

  const composer = el('section', { className: 'qp-v2-card qp-v2-mission-composer' }, [
    el('header', { className: 'qp-v2-panel-head' }, [
      el('div', {}, [el('h3', { text: '创建 Mission' }), el('p', { text: '国家、产品、买家类型缺失时保持缺口，Parser 返回 422。' })]),
    ]),
    el('div', { className: 'qp-v2-mission-form' }, [
      textarea,
      status,
      el('div', { className: 'qp-v2-page-actions' }, [
        button('解析目标', parse, { secondary: true }),
        button('确认并执行', execute),
      ]),
    ]),
  ]);

  body.append(composer, preview);
  return root;
}
