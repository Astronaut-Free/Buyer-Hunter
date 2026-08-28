import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowSquareOut,
  CheckCircle,
  ClockCounterClockwise,
  Crown,
  Crosshair,
  Database,
  Funnel,
  GlobeHemisphereWest,
  IdentificationCard,
  Key,
  Lightning,
  LockKey,
  MagnifyingGlass,
  MapPin,
  ShieldCheck,
  SlidersHorizontal,
  Sparkle,
  UserCircle,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { countrySignals, opportunities } from "./data.js";
import { loadOpportunityDetail, loadTodayOpportunities } from "./api.js";
import "./decision.css";
import "./filters.css";

const navItems = [
  ["opportunities", "今日决策", Crosshair],
  ["radar", "机会监控", GlobeHemisphereWest],
  ["profile", "卖方能力", SlidersHorizontal],
  ["unlocked", "触达资源", Key],
  ["membership", "会员中心", Crown],
];

function Pill({ children, tone = "blue" }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function AppHeader({ isMember, quota, onMembership }) {
  return (
    <header className="app-header">
      <div className="brand-lockup">
        <div className="brand-mark"><Crosshair size={19} weight="bold" /></div>
        <div><strong>黔脉</strong><span>QianPulse · 全球采购机会智能平台</span></div>
      </div>
      <div className="header-search">
        <MagnifyingGlass size={17} />
        <span>搜索采购机会、产品或国家</span>
        <kbd>⌘ K</kbd>
      </div>
      <button className={`member-status ${isMember ? "active" : ""}`} onClick={onMembership}>
        {isMember ? <Crown size={17} weight="fill" /> : <LockKey size={17} />}
        <span>{isMember ? `决策会员 · 触达额度 ${quota}` : "查看决策会员"}</span>
      </button>
      <button className="icon-button" aria-label="账户"><UserCircle size={23} /></button>
    </header>
  );
}

function Sidebar({ page, setPage, opportunityCount }) {
  return (
    <aside className="sidebar">
      <div className="nav-label">销售决策台</div>
      <nav>
        {navItems.map(([id, label, Icon]) => (
          <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}>
            <Icon size={19} weight={page === id ? "fill" : "regular"} />
            <span>{label}</span>
            {id === "opportunities" && <em>{opportunityCount}</em>}
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <div className="coverage-icon"><Database size={19} /></div>
        <div><strong>机会规则 v1.0</strong><span>证据更新 2 小时前</span></div>
      </div>
    </aside>
  );
}

function MobileNav({ page, setPage }) {
  return (
    <nav className="mobile-nav">
      {navItems.slice(0, 4).map(([id, label, Icon]) => (
        <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}>
          <Icon size={20} weight={page === id ? "fill" : "regular"} /><span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function OpportunityCard({ item, isMember, onOpen }) {
  return (
    <button className="opportunity-card" onClick={() => onOpen(item)}>
      <div className="opp-score"><small>#{item.rank}</small><strong>{item.score}</strong><span>机会分</span></div>
      <div className="opp-main">
        <div className="opp-meta">
          <Pill tone={item.signalTone}>{item.signalLabel}</Pill>
          <Pill tone={item.decisionTone}>{item.decisionLabel}</Pill>
          <Pill>{item.window}</Pill>
          <Pill tone={isMember ? "success" : "neutral"}>{isMember ? "完整判断" : "决策摘要"}</Pill>
          {!isMember && (item.contact || item.procurementUrl) && <Pill tone="warning">订阅可解锁联系方式或网页</Pill>}
        </div>
        <h3>{item.buyerName}</h3>
        <p>{item.demand} · {item.quantity}</p>
        <div className="source-line"><Database size={14} /><span>{item.sourceName} · {item.entityStatus}</span></div>
        <div className="why-line"><Sparkle size={15} weight="fill" /><span>{item.whyNow}</span></div>
        <div className="action-line"><Lightning size={14} weight="fill" /><span>下一步：{item.action}</span></div>
      </div>
      <div className="opp-side">
        <span><MapPin size={15} />{item.country}</span>
        <span><ClockCounterClockwise size={15} />{item.published}</span>
        <div className="fit-meter"><i style={{ width: `${item.fit}%` }} /></div>
        <small>匹配 {item.fit}% · {item.risk}</small>
        <ArrowRight size={18} />
      </div>
    </button>
  );
}

function OpportunitiesPage({ isMember, items, dataMode, onOpen, onScan }) {
  const [product, setProduct] = useState("MATCHA");
  const [market, setMarket] = useState("ALL");
  const [scanning, setScanning] = useState(false);
  const [signal, setSignal] = useState("ALL");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [fieldFilter, setFieldFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("SCORE");
  const signalItems = signal === "ALL" ? items : items.filter((item) => item.signalType === signal);
  const fieldFilteredItems = signalItems.filter((item) => {
    if (fieldFilter === "ACTIVE_RFQ") return item.signalType === "RFQ" && item.score >= 80;
    if (fieldFilter === "NAMED_COMPANY") return item.entityStatus?.includes("实名公司");
    if (fieldFilter === "QUANTITY_KNOWN") return item.quantity && !item.quantity.includes("未披露") && !item.quantity.includes("公开页未披露");
    if (fieldFilter === "HIGH_CONFIDENCE") return item.truth >= 90;
    return true;
  });
  const visibleItems = [...fieldFilteredItems].sort((a, b) => {
    if (sortBy === "LATEST") return String(b.published).localeCompare(String(a.published));
    if (sortBy === "CONFIDENCE") return b.truth - a.truth || b.score - a.score;
    return b.score - a.score;
  });
  const activeFieldFilterCount = fieldFilter === "ALL" ? 0 : 1;
  const counts = {
    rfq: items.filter((item) => item.signalType === "RFQ").length,
    trade: items.filter((item) => item.signalType === "TRADE_RECORD").length,
    profile: items.filter((item) => item.signalType === "BUYER_PROFILE").length,
    named: items.filter((item) => item.entityStatus?.includes("实名公司")).length,
  };
  const runScan = (nextProduct = product, nextMarket = market) => {
    setScanning(true);
    Promise.resolve(onScan?.({ categoryCode: nextProduct, marketCode: nextMarket }))
      .finally(() => window.setTimeout(() => setScanning(false), 350));
  };
  const changeProduct = (event) => {
    const value = event.target.value;
    setProduct(value);
    runScan(value, market);
  };
  const changeMarket = (event) => {
    const value = event.target.value;
    setMarket(value);
    runScan(product, value);
  };
  return (
    <div className="page-content">
      <section className="page-title-row">
        <div><span className="eyebrow">GLOBAL MATCHA BUYER INTELLIGENCE</span><h1>全球抹茶采购证据池</h1><p>共 {items.length} 条可回溯机会，严格区分 RFQ、真实采购记录与待复核买家档案。</p></div>
        <div className="data-mode"><span className="status-dot" /> VERIFIED SOURCES · 2026-08-28</div>
      </section>
      <section className="query-bar">
        <div className="query-input"><MagnifyingGlass size={19} /><select className="product-select" value={product} onChange={changeProduct} aria-label="目标产品"><option value="MATCHA">贵州抹茶</option><option value="ALL">全部品类</option></select></div>
        <select value={market} onChange={changeMarket} aria-label="目标市场"><option value="ALL">全球市场</option><option value="US">美国</option><option value="EU">欧盟</option><option value="JP">日本</option><option value="GB">英国</option><option value="AU">澳大利亚</option></select>
        <select value={signal} onChange={(event) => setSignal(event.target.value)} aria-label="证据类型"><option value="ALL">全部证据类型</option><option value="RFQ">公开 RFQ</option><option value="TRADE_RECORD">采购记录</option><option value="BUYER_PROFILE">买家档案</option></select>
        <button className="primary" onClick={() => runScan()} disabled={scanning}>{scanning ? "正在重算证据与匹配…" : "刷新机会判断"}</button>
      </section>
      <section className="kpi-grid">
        <div className="kpi featured"><span>近期公开 RFQ</span><strong>{counts.rfq}</strong><small>需求原文与日期可回溯</small></div>
        <div className="kpi"><span>进口采购记录</span><strong>{counts.trade}</strong><small>公司与票数可验证</small></div>
        <div className="kpi"><span>买家档案</span><strong>{counts.profile}</strong><small>需复核当前采购窗口</small></div>
        <div className="kpi"><span>实名公司</span><strong>{counts.named}</strong><small>未将联系人冒充公司</small></div>
      </section>
      <section className="evidence-standard"><ShieldCheck size={20} /><div><strong>证据口径</strong><p>“RFQ”代表公开询价；“采购记录”代表历史进口事实，不等同于此刻询价；“买家档案”只证明平台自述需求。所有缺失字段均保持待核验。</p></div></section>
      <section className="list-section">
        <div className="section-heading"><div><h2>当前证据机会（{visibleItems.length}）</h2><p>按需求明确度、买方身份、数量、时效和来源可信度综合排序</p></div><button className={`filter-button ${showAdvancedFilters ? "active" : ""}`} onClick={() => setShowAdvancedFilters((value) => !value)} aria-expanded={showAdvancedFilters} aria-controls="advanced-evidence-filters"><Funnel size={16} />筛选与排序{activeFieldFilterCount > 0 && <em>{activeFieldFilterCount}</em>}</button></div>
        {showAdvancedFilters && <div className="advanced-filters" id="advanced-evidence-filters">
          <div className="filter-group"><span>优先查看</span><div className="filter-chips">
            {[["ALL","全部"],["ACTIVE_RFQ","当前 RFQ"],["NAMED_COMPANY","实名公司"],["QUANTITY_KNOWN","数量明确"],["HIGH_CONFIDENCE","高可信 ≥90"]].map(([value, label]) => <button key={value} className={fieldFilter === value ? "active" : ""} onClick={() => setFieldFilter(value)}>{label}</button>)}
          </div></div>
          <label className="sort-control"><span>排序方式</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="SCORE">机会分从高到低</option><option value="LATEST">证据日期从新到旧</option><option value="CONFIDENCE">证据可信度从高到低</option></select></label>
          {(fieldFilter !== "ALL" || sortBy !== "SCORE") && <button className="reset-filter" onClick={() => { setFieldFilter("ALL"); setSortBy("SCORE"); }}>重置</button>}
        </div>}
        <div className="opportunity-list">
          {visibleItems.length ? visibleItems.map((item) => <OpportunityCard key={item.id} item={item} isMember={isMember} onOpen={onOpen} />) : <div className="empty-state compact-empty"><MagnifyingGlass size={30} /><h3>当前组合暂无合格机会</h3><p>更换证据类型或市场后重试。</p></div>}
        </div>
      </section>
    </div>
  );
}
function DecisionDetails({ item }) {
  return (
    <>
      <section className="detail-section"><div className="detail-title"><h3>供需匹配</h3><Pill tone="success">{item.fit}% 匹配</Pill></div><div className="match-table">{item.matches.map(([f, b, s, state]) => <div key={f}><span>{f}</span><span>{b}</span><span>{s}</span><Pill tone={state === "PASS" ? "success" : "warning"}>{state}</Pill></div>)}</div></section>
      <section className="detail-section"><h3>证据时间线</h3><div className="timeline">{item.evidence.map(([d, src, text, level, url]) => <div key={d + src}><time>{d}</time><i /><div><strong>{src}<Pill tone={level === "FACT" ? "success" : level === "DERIVED" ? "blue" : "warning"}>{level}</Pill></strong><p>{text}</p>{url && <a className="evidence-link" href={url} target="_blank" rel="noreferrer">打开原始证据 <ArrowSquareOut size={14} /></a>}</div></div>)}</div></section>
      <section className="detail-section gap-section"><WarningCircle size={19} /><div><h3>当前缺口 / 风险</h3><p>{item.gap}</p></div></section>
      <section className="detail-section action-section"><Lightning size={19} weight="fill" /><div><h3>今天怎么做</h3><p>{item.action}</p></div></section>
    </>
  );
}

function DetailPanel({ item, isMember, accessUnlocked, onClose, onUnlockAccess, onMembership, onSetStage, stage }) {
  if (!item) return null;
  const hasDirectContact = Boolean(item.contact?.includes("@"));
  const hasProcurementPage = Boolean(item.procurementUrl);
  const hasUnlockableResource = hasDirectContact || hasProcurementPage;
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="detail-drawer" role="dialog" aria-modal="true" aria-label="采购机会决策详情">
        <div className="drawer-head">
          <div><span className="eyebrow">#{item.rank} · {item.decisionLabel} · OPPORTUNITY {item.score}</span><h2>{item.buyerName}</h2><p>{item.country} · {item.industry} · {item.demand}</p></div>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><X size={20} /></button>
        </div>
        <div className="drawer-scroll">
          <section className={`decision-banner decision-${item.decision.toLowerCase()}`}>
            <div><Pill tone={item.decisionTone}>{item.decisionLabel}</Pill><h3>{item.decision === "PURSUE_NOW" ? "今天值得投入销售时间" : item.decision === "VERIFY_FIRST" ? "先补关键证据，再投入销售时间" : "保留监控，暂不主动投入"}</h3><p>{item.action}</p></div>
          </section>
          <div className="truth-strip">
            <div><strong>{item.score}</strong><span>机会优先级</span></div>
            <div><strong>{item.truth}</strong><span>真实性门槛</span></div>
            <div><strong>{item.fit}%</strong><span>卖方匹配</span></div>
            <div><strong className={`tone-${item.accessTone}`}>{item.access}</strong><span>市场准入</span></div>
          </div>
          <section className="detail-section accent-section"><span className="section-icon"><Sparkle size={17} weight="fill" /></span><div><h3>为什么是现在</h3><ul className="reason-list">{item.whyNowReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div></section>
          <section className="detail-section"><h3>采购需求</h3><div className="tag-row">{item.tags.map((t) => <span key={t}>{t}</span>)}</div></section>
          <DecisionDetails item={item} />
          {!isMember && hasUnlockableResource && (
            <section className="unlock-card subscriber-lock-card">
              <div className="lock-orb"><IdentificationCard size={24} /></div>
              <div>
                <span className="eyebrow">SUBSCRIBER CONTACT ACCESS</span>
                <h3>订阅会员解锁买家联系方式或采购网页</h3>
                <p>解锁后展开当前已验证的企业官网、采购入口、站内询盘路径或公开商务邮箱。</p>
                <div className="locked-resource-preview"><span>买家联系方式</span><strong>••••••••</strong><span>企业 / 采购网页</span><strong>••••••••</strong></div>
              </div>
              <button className="primary" onClick={onMembership}>订阅并解锁</button>
            </section>
          )}
          {!isMember && !hasUnlockableResource && (
            <section className="unlock-card execution-card">
              <div className="lock-orb"><IdentificationCard size={24} /></div>
              <div><span className="eyebrow">CONTACT STATUS</span><h3>该机会暂无可验证联系方式</h3><p>订阅不会解锁虚构数据；可先查看原始需求页面，等待企业主体补全。</p></div>
            </section>
          )}
          {isMember && !accessUnlocked && hasUnlockableResource && (
            <section className="unlock-card execution-card">
              <div className="lock-orb"><IdentificationCard size={24} /></div>
              <div><span className="eyebrow">LEAD ACCESS · 会员资源</span><h3>解锁买家联系方式或采购网页</h3><p>使用 1 次额度，展开已验证的企业官网、采购入口、站内询盘路径或公开商务邮箱。</p></div>
              <button className="primary" onClick={onUnlockAccess}>使用 1 次额度解锁</button>
            </section>
          )}
          {isMember && !accessUnlocked && !hasUnlockableResource && (
            <section className="unlock-card execution-card">
              <div className="lock-orb"><IdentificationCard size={24} /></div>
              <div><span className="eyebrow">LEAD ACCESS · 会员资源</span><h3>暂无可验证的联系资源</h3><p>当前不消耗额度，系统会继续补全企业主体与公开触达渠道。</p></div>
            </section>
          )}
          {isMember && accessUnlocked && (
            <section className="access-card">
              <div className="access-title"><CheckCircle size={22} weight="fill" /><div><span>已解锁触达资源</span><small>联系方式来自公开企业渠道</small></div></div>
              {hasProcurementPage && <div className="access-row"><span>企业 / 采购网页</span><a href={item.procurementUrl} target="_blank" rel="noreferrer">打开已验证网页 <ArrowSquareOut size={14} /></a></div>}
              <div className="access-row"><span>买家联系方式</span>{hasDirectContact ? <strong>{item.contact}</strong> : <strong>通过上述网页进入站内询盘或企业联系页</strong>}</div>
              <button className="primary wide" onClick={() => onSetStage("FOLLOW_UP")}>{stage ? `当前状态：${stage === "FOLLOW_UP" ? "已跟进" : stage === "NEGOTIATING" ? "洽谈中" : stage === "WON" ? "已成交" : "未成交"}` : "记录为已开始跟进"}</button>
              {stage && <div className="stage-row"><button className={stage === "NEGOTIATING" ? "active" : ""} onClick={() => onSetStage("NEGOTIATING")}>洽谈中</button><button className={stage === "WON" ? "active" : ""} onClick={() => onSetStage("WON")}>已成交</button><button className={stage === "LOST" ? "active" : ""} onClick={() => onSetStage("LOST")}>未成交</button></div>}
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

function MembershipModal({ onClose, onActivate }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="member-modal" role="dialog" aria-modal="true" aria-label="决策会员权益">
        <button className="icon-button modal-close" onClick={onClose} aria-label="关闭"><X size={20} /></button>
        <div className="crown-orb"><Crown size={30} weight="fill" /></div>
        <span className="eyebrow">OPPORTUNITY DECISION MEMBERSHIP</span>
        <h2>买的不是名单，是每天少做错误判断</h2>
        <p>系统每天告诉销售最值得追的 5 个采购机会，以及为什么、能不能做和今天怎么做。</p>
        <div className="benefits">
          <div><Crosshair size={19} /><span>每日 Top 5 采购机会决策</span></div>
          <div><ShieldCheck size={19} /><span>完整匹配、准入、风险与证据链</span></div>
          <div><Lightning size={19} /><span>关键 Gap 与下一步行动方案</span></div>
          <div><IdentificationCard size={19} /><span>每月 20 次商家联系方式解锁额度</span></div>
        </div>
        <div className="quota-note">另含每月 20 次联系方式或采购网页解锁额度</div>
        <div className="price"><strong>¥599</strong><span>/ 月 · Demo 套餐</span></div>
        <button className="primary wide" onClick={onActivate}>切换至演示会员</button>
        <small>本 Demo 不接真实支付，只模拟决策权限与触达额度。</small>
      </div>
    </div>
  );
}

function RadarPage() {
  return <div className="page-content"><section className="page-title-row"><div><span className="eyebrow">OPPORTUNITY MONITOR</span><h1>采购机会监控</h1><p>持续观察海外需求变化，并判断哪些变化值得进入销售队列。</p></div></section><div className="radar-layout"><section className="radar-panel"><div className="radar-heading"><GlobeHemisphereWest size={24} /><div><strong>36 条候选信号</strong><span>加工为 5 条今日机会</span></div></div><div className="country-bars">{countrySignals.map(([name, value, width]) => <div key={name}><span>{name}</span><div><i style={{ width: `${width}%` }} /></div><strong>{value}</strong></div>)}</div></section><section className="radar-side"><h3>本周判断变化</h3><div><Pill tone="success">+18%</Pill><p>美国饮品类抹茶采购窗口</p></div><div><Pill tone="blue">3 条</Pill><p>日本第二供应源机会</p></div><div><Pill tone="warning">2 条</Pill><p>欧盟准入待补证</p></div></section></div></div>;
}

function ProfilePage() {
  return <div className="page-content"><section className="page-title-row"><div><span className="eyebrow">PRIVATE SELLER CAPABILITY</span><h1>卖方能力档案</h1><p>这是个性化判断“能不能做”的依据，不会生成商品页或向买家公开。</p></div><Pill tone="success">资料完整度 86%</Pill></section><div className="profile-grid"><section className="form-card"><h3>目标产品</h3><label>产品关键词<input defaultValue="贵州抹茶 / 蓝莓 / 刺梨 / 辣椒 / 茶" /></label><div className="form-row"><label>目标市场<select defaultValue="global"><option value="global">全球</option><option>美国</option><option>欧盟</option><option>日本</option></select></label><label>产品形态<select><option>饮料级抹茶粉</option><option>烘焙级抹茶粉</option></select></label></div><h3>供货与准入能力</h3><div className="form-row"><label>最低起订量<input defaultValue="100 kg" /></label><label>月产能<input defaultValue="8,000 kg" /></label></div><label>认证与能力<input defaultValue="HACCP / ISO 22000 / OEM / COA" /></label><button className="primary">保存卖方能力档案</button></section><aside className="privacy-note"><ShieldCheck size={25} /><h3>卖方能力决定机会排序</h3><p>同一条采购需求，对不同卖方会得到不同的匹配、准入、风险和行动建议。</p></aside></div></div>;
}

function AccessPage({ accessIds, opportunities: liveItems, onOpen }) {
  const items = liveItems.filter((o) => accessIds.has(o.id));
  return <div className="page-content"><section className="page-title-row"><div><span className="eyebrow">LEAD ACCESS · EXECUTION LAYER</span><h1>触达资源</h1><p>管理已解锁的买家联系方式、企业官网与采购入口。</p></div></section>{items.length ? <div className="unlocked-grid">{items.map((item) => <button key={item.id} onClick={() => onOpen(item)}><div className="buyer-avatar">{item.buyerName.slice(0, 1)}</div><div><strong>{item.buyerName}</strong><span>{item.country} · {item.demand}</span><small>{item.contact?.includes("@") ? item.contact : "企业 / 采购网页已解锁"}</small></div><ArrowRight size={18} /></button>)}</div> : <div className="empty-state"><IdentificationCard size={32} /><h3>尚未解锁触达资源</h3><p>订阅后可使用额度展开买家联系方式或采购网页。</p></div>}</div>;
}

function MembershipPage({ isMember, quota, onActivate }) {
  return <div className="page-content"><section className="page-title-row"><div><span className="eyebrow">DECISION MEMBERSHIP</span><h1>会员中心</h1><p>会员核心权益是每日机会判断；联系方式属于执行资源。</p></div></section><div className={`membership-card ${isMember ? "active" : ""}`}><div><Crown size={28} weight="fill" /><span>{isMember ? "决策会员" : "免费决策摘要"}</span><h2>{isMember ? "完整机会判断已启用" : "升级后获得完整判断与行动方案"}</h2><p>{isMember ? `本周期另有 ${quota} / 20 次触达资源额度` : "免费态可看买家与判断摘要，完整决策需会员。"}</p></div><button className="primary" onClick={onActivate}>{isMember ? "当前套餐" : "切换至演示会员"}</button></div></div>;
}

export function App() {
  const [page, setPage] = useState("opportunities");
  const [selected, setSelected] = useState(null);
  const [isMember, setIsMember] = useState(false);
  const [showMembership, setShowMembership] = useState(false);
  const [accessIds, setAccessIds] = useState(new Set());
  const [followStages, setFollowStages] = useState({});
  const [liveItems, setLiveItems] = useState(opportunities);
  const [dataMode, setDataMode] = useState("FALLBACK");
  const [activeFilters, setActiveFilters] = useState({ categoryCode: "ALL", marketCode: "ALL" });
  const quota = 20 - accessIds.size;

  const refreshFeed = (filters = activeFilters) => {
    setActiveFilters(filters);
    return loadTodayOpportunities(isMember, filters)
      .then(({ items, dataMode: mode }) => { setLiveItems(items); setDataMode(mode); })
      .catch(() => {
        const productItems = filters.categoryCode === "ALL" || filters.categoryCode === "MATCHA" ? opportunities : [];
        const fallback = filters.marketCode === "ALL" ? productItems : productItems.filter((item) => item.marketCode === filters.marketCode);
        setLiveItems(fallback);
        setDataMode("VERIFIED_STATIC");
      });
  };

  useEffect(() => { refreshFeed(activeFilters); }, [isMember]);

  const openOpportunity = (item) => {
    setSelected(item);
    loadOpportunityDetail(item.id, isMember).then(setSelected).catch(() => null);
  };

  const currentPage = useMemo(() => {
    if (page === "radar") return <RadarPage />;
    if (page === "profile") return <ProfilePage />;
    if (page === "unlocked") return <AccessPage accessIds={accessIds} opportunities={liveItems} onOpen={openOpportunity} />;
    if (page === "membership") return <MembershipPage isMember={isMember} quota={quota} onActivate={() => isMember ? null : setShowMembership(true)} />;
    return <OpportunitiesPage isMember={isMember} items={liveItems} dataMode={dataMode} onOpen={openOpportunity} onScan={refreshFeed} />;
  }, [page, isMember, quota, accessIds, liveItems, dataMode, activeFilters]);

  const unlockAccess = () => {
    if (!selected || !isMember) return;
    setAccessIds((prev) => new Set(prev).add(selected.id));
  };
  const activate = () => {
    setIsMember(true);
    setShowMembership(false);
    if (selected) loadOpportunityDetail(selected.id, true).then(setSelected).catch(() => null);
  };
  const setStage = (stage) => selected && setFollowStages((prev) => ({ ...prev, [selected.id]: stage }));

  return (
    <div className="app-shell">
      <AppHeader isMember={isMember} quota={quota} onMembership={() => setShowMembership(true)} />
      <Sidebar page={page} setPage={setPage} opportunityCount={liveItems.length} />
      <main className="main-stage">{currentPage}</main>
      <MobileNav page={page} setPage={setPage} />
      <DetailPanel item={selected} isMember={isMember} accessUnlocked={selected ? accessIds.has(selected.id) : false} onClose={() => setSelected(null)} onUnlockAccess={unlockAccess} onMembership={() => setShowMembership(true)} onSetStage={setStage} stage={selected ? followStages[selected.id] : null} />
      {showMembership && <MembershipModal onClose={() => setShowMembership(false)} onActivate={activate} />}
    </div>
  );
}

