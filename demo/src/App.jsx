import { useMemo, useState } from "react";
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

const navItems = [
  ["opportunities", "今日机会", Crosshair],
  ["radar", "需求雷达", GlobeHemisphereWest],
  ["profile", "我的匹配条件", SlidersHorizontal],
  ["unlocked", "已解锁买家", Key],
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
        <span>搜索海外买家需求、产品或国家</span>
        <kbd>⌘ K</kbd>
      </div>
      <button className={`member-status ${isMember ? "active" : ""}`} onClick={onMembership}>
        {isMember ? <Crown size={17} weight="fill" /> : <LockKey size={17} />}
        <span>{isMember ? `专业会员 · 剩余 ${quota}` : "免费预览"}</span>
      </button>
      <button className="icon-button" aria-label="账户"><UserCircle size={23} /></button>
    </header>
  );
}

function Sidebar({ page, setPage }) {
  return (
    <aside className="sidebar">
      <div className="nav-label">工作台</div>
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
        <div><strong>数据覆盖 86%</strong><span>最后更新 2 小时前</span></div>
      </div>
    </aside>
  );
}

function MobileNav({ page, setPage }) {
  return (
    <nav className="mobile-nav">
      {navItems.slice(0, 4).map(([id, label, Icon]) => (
        <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}>
          <Icon size={20} weight={page === id ? "fill" : "regular"} /><span>{label.replace("我的匹配条件", "匹配")}</span>
        </button>
      ))}
    </nav>
  );
}

function OpportunityCard({ item, isMember, unlocked, onOpen }) {
  const name = unlocked ? item.buyerName : item.maskedName;
  return (
    <button className="opportunity-card" onClick={() => onOpen(item)}>
      <div className="opp-score"><strong>{item.score}</strong><span>机会分</span></div>
      <div className="opp-main">
        <div className="opp-meta">
          <Pill>{item.window}</Pill>
          <Pill tone={item.accessTone}>{item.access}</Pill>
          {!unlocked && <Pill tone="neutral"><LockKey size={11} /> 身份受限</Pill>}
        </div>
        <h3>{name}</h3>
        <p>{item.demand} · {item.quantity}</p>
        <div className="why-line"><Sparkle size={15} weight="fill" /><span>{item.whyNow}</span></div>
      </div>
      <div className="opp-side">
        <span><MapPin size={15} />{item.country}</span>
        <span><ClockCounterClockwise size={15} />{item.published}</span>
        <div className="fit-meter"><i style={{ width: `${item.fit}%` }} /></div>
        <small>匹配度 {item.fit}%</small>
        <ArrowRight size={18} />
      </div>
    </button>
  );
}

function OpportunitiesPage({ isMember, unlockedIds, onOpen, onScan }) {
  const [product, setProduct] = useState("贵州抹茶");
  const [scanning, setScanning] = useState(false);
  const runScan = () => {
    setScanning(true);
    onScan?.();
    window.setTimeout(() => setScanning(false), 900);
  };
  return (
    <div className="page-content">
      <section className="page-title-row">
        <div><span className="eyebrow">TODAY'S BUYING MOMENTS</span><h1>今日最值得追的买家</h1><p>先看真实需求，再决定把销售时间投给谁。</p></div>
        <div className="data-mode"><span className="status-dot" /> CACHED · 2 小时前更新</div>
      </section>
      <section className="query-bar">
        <div className="query-input"><MagnifyingGlass size={19} /><input value={product} onChange={(e) => setProduct(e.target.value)} aria-label="目标产品" /></div>
        <select aria-label="目标市场"><option>全球市场</option><option>美国</option><option>欧盟</option><option>日本</option></select>
        <button className="primary" onClick={runScan} disabled={scanning}>{scanning ? "正在扫描 2 个来源…" : "扫描新需求"}</button>
      </section>
      <section className="kpi-grid">
        <div className="kpi"><span>候选采购信号</span><strong>36</strong><small>2 个公开源</small></div>
        <div className="kpi"><span>标准买家主体</span><strong>12</strong><small>已完成去重</small></div>
        <div className="kpi featured"><span>高优机会</span><strong>5</strong><small>Truth ≥ 60</small></div>
        <div className="kpi"><span>待补证据</span><strong>2</strong><small>未进入 Top 5</small></div>
      </section>
      <section className="list-section">
        <div className="section-heading"><div><h2>Top 5 机会</h2><p>按采购意图、供需匹配、时点和可触达性排序</p></div><button className="filter-button"><Funnel size={16} />筛选</button></div>
        <div className="opportunity-list">
          {opportunities.map((item) => <OpportunityCard key={item.id} item={item} isMember={isMember} unlocked={unlockedIds.has(item.id)} onOpen={onOpen} />)}
        </div>
      </section>
    </div>
  );
}

function DetailPanel({ item, isMember, unlocked, onClose, onUnlock, onMembership, onSetStage, stage }) {
  if (!item) return null;
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="detail-drawer" role="dialog" aria-modal="true" aria-label="买家机会详情">
        <div className="drawer-head">
          <div><span className="eyebrow">OPPORTUNITY · {item.score}</span><h2>{unlocked ? item.buyerName : item.maskedName}</h2><p>{item.country} · {item.industry} · {item.demand}</p></div>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><X size={20} /></button>
        </div>
        <div className="drawer-scroll">
          <div className="truth-strip">
            <div><strong>{item.truth}</strong><span>需求真实性</span></div>
            <div><strong>{item.fit}%</strong><span>供需匹配</span></div>
            <div><strong>3</strong><span>有效证据</span></div>
            <div><strong className={`tone-${item.accessTone}`}>{item.access}</strong><span>市场准入</span></div>
          </div>
          <section className="detail-section accent-section"><span className="section-icon"><Sparkle size={17} weight="fill" /></span><div><h3>为什么是现在</h3><p>{item.whyNow}</p></div></section>
          <section className="detail-section"><h3>采购需求</h3><div className="tag-row">{item.tags.map((t) => <span key={t}>{t}</span>)}</div></section>
          <section className="detail-section"><div className="detail-title"><h3>供需匹配</h3><Pill tone="success">{item.fit}% 匹配</Pill></div><div className="match-table">{item.matches.map(([f, b, s, state]) => <div key={f}><span>{f}</span><span>{b}</span><span>{s}</span><Pill tone={state === "PASS" ? "success" : "warning"}>{state}</Pill></div>)}</div></section>
          <section className="detail-section"><h3>证据时间线</h3><div className="timeline">{item.evidence.map(([d, src, text, level]) => <div key={d + src}><time>{d}</time><i /><div><strong>{src}<Pill tone={level === "FACT" ? "success" : level === "DERIVED" ? "blue" : "warning"}>{level}</Pill></strong><p>{text}</p></div></div>)}</div></section>
          <section className="detail-section gap-section"><WarningCircle size={19} /><div><h3>当前缺口</h3><p>{item.gap}</p></div></section>
          <section className="detail-section"><h3>建议下一步</h3><p>{item.action}</p></section>
          {!unlocked ? (
            <section className="unlock-card">
              <div className="lock-orb"><LockKey size={24} /></div>
              <div><span className="eyebrow">MEMBER ACCESS</span><h3>解锁完整买家身份与采购入口</h3><p>包含公司名称、官方采购页、公开商务联系方式和来源证明。</p></div>
              <button className="primary" onClick={isMember ? onUnlock : onMembership}>{isMember ? "使用 1 次额度解锁" : "查看会员权益"}</button>
            </section>
          ) : (
            <section className="access-card">
              <div className="access-title"><CheckCircle size={22} weight="fill" /><div><span>已解锁买家入口</span><small>联系方式来自公开企业渠道</small></div></div>
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
      <div className="member-modal" role="dialog" aria-modal="true" aria-label="会员权益">
        <button className="icon-button modal-close" onClick={onClose} aria-label="关闭"><X size={20} /></button>
        <div className="crown-orb"><Crown size={30} weight="fill" /></div>
        <span className="eyebrow">PROFESSIONAL MEMBERSHIP</span>
        <h2>不是更多名单，是更少的无效联系</h2>
        <p>专业会员按月获得经过验真和智能匹配的海外买家需求入口。</p>
        <div className="benefits">
          <div><ShieldCheck size={19} /><span>完整买家身份与证据链</span></div>
          <div><IdentificationCard size={19} /><span>采购入口与公开 B2B 联系方式</span></div>
          <div><Crosshair size={19} /><span>每月 20 次机会解锁</span></div>
        </div>
        <div className="price"><strong>¥599</strong><span>/ 月 · Demo 套餐</span></div>
        <button className="primary wide" onClick={onActivate}>切换至演示会员</button>
        <small>本 Demo 不接真实支付，只模拟会员权限。</small>
      </div>
    </div>
  );
}

function RadarPage() {
  return <div className="page-content"><section className="page-title-row"><div><span className="eyebrow">GLOBAL DEMAND RADAR</span><h1>海外需求雷达</h1><p>过去 30 天已验证需求的国家分布。</p></div></section><div className="radar-layout"><section className="radar-panel"><div className="radar-heading"><GlobeHemisphereWest size={24} /><div><strong>36 条采购信号</strong><span>覆盖 8 个国家与地区</span></div></div><div className="country-bars">{countrySignals.map(([name, value, width]) => <div key={name}><span>{name}</span><div><i style={{ width: `${width}%` }} /></div><strong>{value}</strong></div>)}</div></section><section className="radar-side"><h3>本周变化</h3><div><Pill tone="success">+18%</Pill><p>美国饮品类抹茶需求</p></div><div><Pill tone="blue">3 条</Pill><p>日本第二供应源信号</p></div><div><Pill tone="warning">2 条</Pill><p>欧盟准入待核验</p></div></section></div></div>;
}

function ProfilePage() {
  return <div className="page-content"><section className="page-title-row"><div><span className="eyebrow">PRIVATE MATCHING PROFILE</span><h1>我的匹配条件</h1><p>这些资料只用于计算 Fit，不会生成商品页或向买家公开。</p></div><Pill tone="success">资料完整度 86%</Pill></section><div className="profile-grid"><section className="form-card"><h3>目标产品</h3><label>产品关键词<input defaultValue="贵州抹茶粉" /></label><div className="form-row"><label>目标市场<select defaultValue="global"><option value="global">全球</option><option>美国</option><option>欧盟</option></select></label><label>产品形态<select><option>饮料级抹茶粉</option><option>烘焙级抹茶粉</option></select></label></div><h3>供货条件</h3><div className="form-row"><label>最低起订量<input defaultValue="100 kg" /></label><label>月产能<input defaultValue="8,000 kg" /></label></div><label>认证与能力<input defaultValue="HACCP / ISO 22000 / OEM" /></label><button className="primary">保存私有匹配条件</button></section><aside className="privacy-note"><ShieldCheck size={25} /><h3>不会成为商品展示</h3><p>只有当前账号的匹配引擎可以读取这些字段。其他卖家和海外买家均不可见。</p></aside></div></div>;
}

function UnlockedPage({ unlockedIds, onOpen }) {
  const items = opportunities.filter((o) => unlockedIds.has(o.id));
  return <div className="page-content"><section className="page-title-row"><div><span className="eyebrow">BUYER ACCESS</span><h1>已解锁买家</h1><p>集中管理已获得访问授权的买家需求。</p></div></section>{items.length ? <div className="unlocked-grid">{items.map((item) => <button key={item.id} onClick={() => onOpen(item)}><div className="buyer-avatar">{item.buyerName.slice(0, 1)}</div><div><strong>{item.buyerName}</strong><span>{item.country} · {item.demand}</span><small>{item.contact}</small></div><ArrowRight size={18} /></button>)}</div> : <div className="empty-state"><LockKey size={32} /><h3>还没有解锁买家</h3><p>从今日机会中解锁采购入口后，会集中显示在这里。</p></div>}</div>;
}

function MembershipPage({ isMember, quota, onActivate }) {
  return <div className="page-content"><section className="page-title-row"><div><span className="eyebrow">MEMBERSHIP</span><h1>会员中心</h1><p>按月获取经过验真、匹配和更新的海外买家需求。</p></div></section><div className={`membership-card ${isMember ? "active" : ""}`}><div><Crown size={28} weight="fill" /><span>{isMember ? "专业会员" : "免费预览"}</span><h2>{isMember ? "会员有效至 2026/09/28" : "升级后解锁买家入口"}</h2><p>{isMember ? `本周期剩余 ${quota} / 20 次解锁额度` : "免费态仅展示受限需求摘要。"}</p></div><button className="primary" onClick={onActivate}>{isMember ? "当前套餐" : "切换至演示会员"}</button></div></div>;
}

export function App() {
  const [page, setPage] = useState("opportunities");
  const [selected, setSelected] = useState(null);
  const [isMember, setIsMember] = useState(false);
  const [showMembership, setShowMembership] = useState(false);
  const [unlockedIds, setUnlockedIds] = useState(new Set());
  const [followStages, setFollowStages] = useState({});
  const quota = 20 - unlockedIds.size;

  const currentPage = useMemo(() => {
    if (page === "radar") return <RadarPage />;
    if (page === "profile") return <ProfilePage />;
    if (page === "unlocked") return <UnlockedPage unlockedIds={unlockedIds} onOpen={setSelected} />;
    if (page === "membership") return <MembershipPage isMember={isMember} quota={quota} onActivate={() => isMember ? null : setShowMembership(true)} />;
    return <OpportunitiesPage isMember={isMember} unlockedIds={unlockedIds} onOpen={setSelected} />;
  }, [page, isMember, quota, unlockedIds]);

  const unlock = () => {
    if (!selected || !isMember) return;
    setUnlockedIds((prev) => new Set(prev).add(selected.id));
  };
  const activate = () => { setIsMember(true); setShowMembership(false); };
  const setStage = (stage) => selected && setFollowStages((prev) => ({ ...prev, [selected.id]: stage }));

  return (
    <div className="app-shell">
      <AppHeader isMember={isMember} quota={quota} onMembership={() => setShowMembership(true)} />
      <Sidebar page={page} setPage={setPage} />
      <main className="main-stage">{currentPage}</main>
      <MobileNav page={page} setPage={setPage} />
      <DetailPanel item={selected} isMember={isMember} unlocked={selected ? unlockedIds.has(selected.id) : false} onClose={() => setSelected(null)} onUnlock={unlock} onMembership={() => setShowMembership(true)} onSetStage={setStage} stage={selected ? followStages[selected.id] : null} />
      {showMembership && <MembershipModal onClose={() => setShowMembership(false)} onActivate={activate} />}
    </div>
  );
}
