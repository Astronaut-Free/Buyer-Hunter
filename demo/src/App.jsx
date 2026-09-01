import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
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
        <div><strong>买家猎手</strong><span>Buyer Hunter</span></div>
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

function Sidebar({ page, setPage }) {
  return (
    <aside className="sidebar">
      <div className="nav-label">销售决策台</div>
      <nav>
        {navItems.map(([id, label, Icon]) => (
          <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}>
            <Icon size={19} weight={page === id ? "fill" : "regular"} />
            <span>{label}</span>
            {id === "opportunities" && <em>5</em>}
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
          <Pill tone={item.decisionTone}>{item.decisionLabel}</Pill>
          <Pill>{item.window}</Pill>
          <Pill tone={isMember ? "success" : "neutral"}>{isMember ? "完整判断" : "决策摘要"}</Pill>
        </div>
        <h3>{item.buyerName}</h3>
        <p>{item.demand} · {item.quantity}</p>
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
  const [product, setProduct] = useState("ALL");
  const [market, setMarket] = useState("ALL");
  const [scanning, setScanning] = useState(false);
  const counts = {
    pursue: items.filter((item) => item.decision === "PURSUE_NOW").length,
    verify: items.filter((item) => item.decision === "VERIFY_FIRST").length,
    watch: items.filter((item) => item.decision === "WATCH").length,
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
        <div><span className="eyebrow">TODAY'S OPPORTUNITY DECISIONS</span><h1>今天销售先追谁</h1><p>系统已筛出 {items.length} 个符合当前选品与市场的采购机会。</p></div>
        <div className="data-mode"><span className="status-dot" /> {dataMode === "LIVE_PIPELINE" ? "LIVE PIPELINE · 今日快照" : "FALLBACK · 演示样例"}</div>
      </section>
      <section className="query-bar">
        <div className="query-input"><MagnifyingGlass size={19} /><select className="product-select" value={product} onChange={changeProduct} aria-label="目标产品"><option value="ALL">全部品类</option><option value="MATCHA">贵州抹茶</option><option value="BLUEBERRY">贵州蓝莓</option><option value="ROSA_ROXBURGHII">贵州刺梨</option><option value="CHILI">贵州辣椒</option><option value="TEA">贵州茶</option></select></div>
        <select value={market} onChange={changeMarket} aria-label="目标市场"><option value="ALL">全球市场</option><option value="US">美国</option><option value="EU">欧盟</option><option value="JP">日本</option><option value="GB">英国</option><option value="AU">澳大利亚</option></select>
        <button className="primary" onClick={() => runScan()} disabled={scanning}>{scanning ? "正在重算证据与匹配…" : "刷新机会判断"}</button>
      </section>
      <section className="kpi-grid">
        <div className="kpi featured"><span>立即追</span><strong>{counts.pursue}</strong><small>无硬阻断</small></div>
        <div className="kpi"><span>补证后追</span><strong>{counts.verify}</strong><small>先消除关键 Gap</small></div>
        <div className="kpi"><span>继续观察</span><strong>{counts.watch}</strong><small>采购量尚未形成</small></div>
        <div className="kpi"><span>今日行动</span><strong>0/{items.length}</strong><small>等待销售确认</small></div>
      </section>
      <section className="list-section">
        <div className="section-heading"><div><h2>当前选品机会</h2><p>按采购窗口、卖方匹配、市场准入、风险和可执行性动态排序</p></div><button className="filter-button"><Funnel size={16} />筛选</button></div>
        <div className="opportunity-list">
          {items.length ? items.map((item) => <OpportunityCard key={item.id} item={item} isMember={isMember} onOpen={onOpen} />) : <div className="empty-state compact-empty"><MagnifyingGlass size={30} /><h3>当前组合暂无合格机会</h3><p>更换品类或市场，系统会立即重新筛选。</p></div>}
        </div>
      </section>
    </div>
  );
}
const CHECK_TONE = { PASS: "success", FAIL: "danger", UNKNOWN: "warning", NA: "neutral" };

function SkuMatchCard({ match }) {
  const hard = match.checks.filter((c) => c.kind === "HARD");
  const soft = match.checks.filter((c) => c.kind === "SOFT");
  return (
    <div className={`sku-match sku-${match.verdictTone}`}>
      <div className="sku-head">
        <div>
          <strong>{match.product}</strong>
          <span>{match.seller} · {match.sku}{match.grade ? ` · ${match.grade}` : ""}</span>
        </div>
        <div className="sku-verdict">
          <Pill tone={match.verdictTone}>{match.verdictLabel}</Pill>
          <small>匹配度 {match.fitPoints}</small>
        </div>
      </div>
      <div className="sku-checks">
        {[...hard, ...soft].map((c) => (
          <span key={c.dim} className={`check check-${CHECK_TONE[c.status] || "neutral"}`} title={c.detail}>
            <em>{c.kind === "HARD" ? "硬" : "软"}</em>{c.dim} · {c.status}
          </span>
        ))}
      </div>
      {(match.blockers.length > 0 || match.gaps.length > 0) && (
        <ul className="sku-notes">
          {match.blockers.map((b) => <li key={b} className="blocker">{b}</li>)}
          {match.gaps.map((g) => <li key={g}>{g}</li>)}
        </ul>
      )}
    </div>
  );
}

function SupplyDemandFit({ item }) {
  const shown = item.skuMatches.slice(0, 3);
  return (
    <section className="detail-section">
      <div className="detail-title">
        <h3>供需匹配 · 贵州 Seller × SKU</h3>
        {item.supplyPoolLabel && <Pill tone={item.supplyPoolTone}>{item.supplyPoolLabel}</Pill>}
      </div>
      <p className="fit-summary">{item.supplySummary || `匹配度 ${item.fit}`}</p>
      {shown.length ? (
        <div className="sku-match-list">
          {shown.map((m) => <SkuMatchCard key={m.sku} match={m} />)}
          {item.skuMatches.length > shown.length && (
            <p className="sku-more">另有 {item.skuMatches.length - shown.length} 款可匹配 SKU（前端仅展示前 3）</p>
          )}
        </div>
      ) : (
        <div className="empty-state compact-empty"><Database size={26} /><h3>贵州供给池暂无符合条件产品</h3><p>{item.supplySummary || "换品类或补充卖方 SKU 后重试"}</p></div>
      )}
    </section>
  );
}

function DecisionDetails({ item }) {
  return (
    <>
      <SupplyDemandFit item={item} />
      <section className="detail-section"><h3>证据时间线</h3><div className="timeline">{item.evidence.map(([d, src, text, level]) => <div key={d + src}><time>{d}</time><i /><div><strong>{src}<Pill tone={level === "FACT" ? "success" : level === "DERIVED" ? "blue" : "warning"}>{level}</Pill></strong><p>{text}</p></div></div>)}</div></section>
      <section className="detail-section gap-section"><WarningCircle size={19} /><div><h3>当前缺口 / 风险</h3><p>{item.gap}</p></div></section>
      <section className="detail-section action-section"><Lightning size={19} weight="fill" /><div><h3>今天怎么做</h3><p>{item.action}</p></div></section>
    </>
  );
}

function DetailPanel({ item, isMember, accessUnlocked, onClose, onUnlockAccess, onMembership, onSetStage, stage }) {
  if (!item) return null;
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
          {isMember ? <DecisionDetails item={item} /> : (
            <section className="decision-gate">
              <div className="lock-orb"><LockKey size={24} /></div>
              <div><span className="eyebrow">DECISION MEMBERSHIP</span><h3>解锁完整机会判断</h3><p>查看供需匹配矩阵、证据链、准入风险、关键 Gap 和今天的行动方案。</p></div>
              <button className="primary" onClick={onMembership}>查看决策会员</button>
            </section>
          )}
          {isMember && !accessUnlocked && item.leadAccessStatus === "UNAVAILABLE" && (
            <section className="unlock-card execution-card">
              <div className="lock-orb"><IdentificationCard size={24} /></div>
              <div><span className="eyebrow">LEAD ACCESS · 执行层</span><h3>暂无可验证的站外触达资源</h3><p>系统不会伪造邮箱或电话；当前先通过原始需求页面询盘，并继续补全公司主体。</p></div>
              <a className="primary access-link" href={item.procurementUrl} target="_blank" rel="noreferrer">查看原始需求</a>
            </section>
          )}
          {isMember && !accessUnlocked && item.leadAccessStatus !== "UNAVAILABLE" && (
            <section className="unlock-card execution-card">
              <div className="lock-orb"><IdentificationCard size={24} /></div>
              <div><span className="eyebrow">LEAD ACCESS · 执行层</span><h3>需要触达时，再解锁公开商务渠道</h3><p>1 次额度仅用于采购入口与已经验证的公开商务邮箱。</p></div>
              <button className="primary" onClick={onUnlockAccess}>使用 1 次触达额度</button>
            </section>
          )}
          {isMember && accessUnlocked && (
            <section className="access-card">
              <div className="access-title"><CheckCircle size={22} weight="fill" /><div><span>已解锁触达资源</span><small>联系方式来自公开企业渠道</small></div></div>
              <div className="access-row"><span>采购入口</span><a href={item.procurementUrl} target="_blank" rel="noreferrer">{item.procurementUrl}</a></div>
              <div className="access-row"><span>商务邮箱</span><strong>{item.contact}</strong></div>
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
        </div>
        <div className="quota-note">另含每月 20 次 Lead Access 触达资源额度</div>
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
  return <div className="page-content"><section className="page-title-row"><div><span className="eyebrow">LEAD ACCESS · EXECUTION LAYER</span><h1>触达资源</h1><p>只在决定执行机会后，管理已解锁的采购入口和公开商务渠道。</p></div></section>{items.length ? <div className="unlocked-grid">{items.map((item) => <button key={item.id} onClick={() => onOpen(item)}><div className="buyer-avatar">{item.buyerName.slice(0, 1)}</div><div><strong>{item.buyerName}</strong><span>{item.country} · {item.demand}</span><small>{item.contact}</small></div><ArrowRight size={18} /></button>)}</div> : <div className="empty-state"><IdentificationCard size={32} /><h3>尚未解锁触达资源</h3><p>先完成机会判断，决定执行后再消耗额度获取采购入口。</p></div>}</div>;
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
        const fallback = filters.categoryCode === "ALL" || filters.categoryCode === "MATCHA" ? opportunities : [];
        setLiveItems(fallback);
        setDataMode("FALLBACK");
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
      <Sidebar page={page} setPage={setPage} />
      <main className="main-stage">{currentPage}</main>
      <MobileNav page={page} setPage={setPage} />
      <DetailPanel item={selected} isMember={isMember} accessUnlocked={selected ? accessIds.has(selected.id) : false} onClose={() => setSelected(null)} onUnlockAccess={unlockAccess} onMembership={() => setShowMembership(true)} onSetStage={setStage} stage={selected ? followStages[selected.id] : null} />
      {showMembership && <MembershipModal onClose={() => setShowMembership(false)} onActivate={activate} />}
    </div>
  );
}
