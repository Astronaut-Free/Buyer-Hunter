import { agentApi } from '../api-client.js';
import {
  renderApprovalPanel,
  renderConversationTimeline,
  renderHumanTakeoverPanel,
  renderVoiceConversationPanel,
} from '../components/index.js';
import { el } from '../shared/dom.js';
import { button, errorState, loading, pageRoot } from './page-utils.js';

function takeoverFromWorkspace(workspace) {
  const blocker = (workspace.blockers || []).find(item => item.type === 'HUMAN_APPROVAL');
  if (!blocker) return { required: false, status: 'NOT_REQUIRED' };
  return {
    required: true,
    status: 'PENDING',
    reason_code: blocker.code || 'HUMAN_APPROVAL',
    reason: blocker.description || '等待人工审批',
    created_at: workspace.approvals?.find(item => item.approval_id === blocker.approval_id)?.created_at || null,
  };
}

export async function renderConversationPage({ route } = {}) {
  const opportunityId = route?.params?.id;
  const root = pageRoot('沟通推进', `Opportunity ${opportunityId || 'UNKNOWN'} 的对话、AI 辅助、审批和人工接管。`);
  const body = el('div', { className: 'qp-v2-page-body' }, [loading()]);
  root.appendChild(body);

  const load = async () => {
    body.replaceChildren(loading('正在读取对话与审批状态。'));
    try {
      const workspace = await agentApi.workspace(opportunityId);
      const advisorOutput = el('div', { className: 'qp-v2-advisor-output qp-v2-muted', text: '可以询问：这笔商机该怎么回、还缺什么事实、下一步应该推进什么。' });
      const input = el('textarea', {
        className: 'qp-v2-textarea qp-v2-focus-ring',
        attrs: { rows: '3', placeholder: '向 AI 商机助手提问' },
      });
      const ask = async () => {
        const message = input.value.trim();
        if (!message) return;
        advisorOutput.textContent = '正在分析…';
        try {
          const result = await agentApi.chat({ opportunity_id: opportunityId, message });
          advisorOutput.textContent = result.answer || 'AI 未返回可展示答案';
        } catch (error) {
          advisorOutput.textContent = `分析失败：${error.message}`;
        }
      };
      const advisor = el('section', { className: 'qp-v2-card qp-v2-advisor-card' }, [
        el('header', { className: 'qp-v2-panel-head' }, [
          el('div', {}, [el('h3', { text: 'AI 商机助手' }), el('p', { text: '只读取当前 Opportunity 上下文，不直接发送给买家。' })]),
        ]),
        el('div', { className: 'qp-v2-advisor-form' }, [input, button('分析并建议', ask), advisorOutput]),
      ]);

      const submitApproval = async (approval, status) => {
        await agentApi.approve(approval.id || approval.approval_id, { status });
        await load();
      };

      body.replaceChildren(
        el('div', { className: 'qp-v2-workspace-grid' }, [
          renderConversationTimeline(workspace.activity || {}),
          advisor,
          renderApprovalPanel(workspace, {
            onApprove: approval => submitApproval(approval, 'APPROVED'),
            onReject: approval => submitApproval(approval, 'REJECTED'),
          }),
          renderHumanTakeoverPanel(takeoverFromWorkspace(workspace)),
          renderVoiceConversationPanel({}, { title: '语音对话' }),
        ]),
      );
    } catch (error) {
      body.replaceChildren(errorState(error, load));
    }
  };

  await load();
  return root;
}
