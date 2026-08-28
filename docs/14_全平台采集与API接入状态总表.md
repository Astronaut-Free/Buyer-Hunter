# Buyer Hunter 全平台采集与 API 接入状态总表

更新时间：2026-08-28

## 统计口径

只分两类：

1. **已经实现采集**：仓库中已有采集器，并且至少一次真实运行产生了原始快照和结构化记录。
2. **尚未实现或尚未连通**：仅调研、仅访问说明页、仅通过搜索索引发现、被登录/Cloudflare 阻断，或者连接器已写但缺少 API 凭据。

“访问官网 HTTP 200”不等于“采到买家需求”；“有连接器代码”也不等于“API 已连通”。

## 第一类：已经实现采集

| 平台/来源 | 方式 | 已产出 | 当前状态 | 数据定位 |
|---|---|---:|---|---|
| TradeKey Buy Offers | 公开列表页爬虫 | 清洗后 72 条 | `LIVE` | 直接 RFQ/Buy Offer；仍需去旧帖、诈骗文本和错误分类 |
| go4WorldBusiness | 公开列表页爬虫 | 清洗后 89 条 | `LIVE` | Buy Lead 与买家目录混合；不能全部视为近期需求 |
| TradeWheel | 公开列表与详情页爬虫 | 首轮 7 条直接需求，去重后 6 条 | `IMPLEMENTED_BUT_UNSTABLE` | 曾真实抓取成功；后续出现 403，当前只能低频运行，不能绕过限制 |
| EC21 Buying Leads | 公开列表页爬虫 | 首轮 88 条；美日欧扩展 62 条 | `LIVE_PARTIAL` | 能抓列表，但详情/部分请求会 403；严格复核后当前 0 条合格机会 |
| SAM.gov | 官方 API | 40 条原始，12 条相邻食品采购 | `LIVE_API` | 美国政府采购；五品类精准命中为 0，不能把泛食品机会冒充抹茶/蓝莓需求 |
| USAspending | 官方开放 API | 10 条 | `LIVE_API` | 历史政府采购记录，只做历史行为证据，不是当前 RFQ |
| TED 欧盟招标 | 官方开放 API | 33 条初筛，18 条精准 | `LIVE_API` | 欧洲公共采购；当前精准结果集中在辣椒类 |
| Walmart Supplier Portal | 公开网页采集 | 1 条采购入口 | `LIMITED_LIVE` | 只能证明存在供应商准入渠道，不能证明当前正在采购五品类 |
| 独立买家公司官网 | 公开官网联系方式补全 | Berry Fresh LLC 找到 5 个公开企业渠道 | `LIMITED_LIVE` | 买家实体和公开业务联系方式补全，不是 RFQ 主来源 |

### 已实现来源的合计说明

- B2B 公共渠道最新一轮：TradeKey + go4WorldBusiness 原始 167 条，去重 161 条，B 级合格 21 条。
- TradeWheel 首轮贡献 6 条去重后的直接需求，但当前稳定性低于 TradeKey/go4WorldBusiness。
- EC21 有真实采集能力，但数据陈旧、买方身份缺失和产地不匹配问题明显。
- SAM、USAspending、TED 属于 API 采集，不是网页爬虫。
- Walmart 和独立买家公司官网属于采购入口/实体补全，不进入“正在买”数量统计。

## 第二类：尚未实现或尚未连通

### A. 连接器已经写好，但 API/凭据未连通

| 平台 | 当前进度 | 缺少内容 | 下一步 |
|---|---|---|---|
| Alibaba.com RFQ | 已找到正式 RFQ API；尚未创建应用 | ICBU/GGS 开发者资格、应用类目、App Key、App Secret、Session Key | 用国际站卖家/供应商账号申请 `alibaba.icbu.rfq.search` 和 `rfqdetail.get` |
| Trademo | 连接器已写 | 商务 API 合同、Key、Base URL、鉴权与端点路径 | 联系 Sales 申请 Sandbox/Production 参数 |
| Volza | 连接器已写 | `VOLZA_API_TOKEN` 和付费业务端点权限 | 购买/开通正式 API；禁止抓取其付费网站 |
| Apollo | 连接器已写 | `APOLLO_API_KEY`、套餐权限和 credits | 接公司搜索、企业补全和人员补全；公开 OpenAPI 暂无 Buying Intent 读取端点 |
| Clay | Webhook 连接器已写，当前 dry-run | `CLAY_WEBHOOK_URL` 和可选 Token | 创建 Monitor Webhook，先 smoke test 再真实推送 |

### B. 账号内可用，但没有可直接接入的公开 RFQ API

| 平台 | 当前状态 | 未实现原因 | 处理方式 |
|---|---|---|---|
| RangeMe | 未采集 | 封闭零售买家网络；未发现公开需求 API | 注册 Supplier，人工验证 Immediate Opportunities/合法导出能力 |
| Made-in-China | 未采集 | Sourcing Request 在供应商账号内；未发现普通供应商 RFQ API | 注册 Supplier，优先检查 CSV/Excel 导出，再评估授权会话采集 |
| Amazon Business | 只访问过 RFQ 说明页，0 条数据 | 未发现卖家搜索全平台 Custom Quotes 的公开 SP-API | 已有 Professional Seller 且功能开放后再评估 |

### C. 已发现或试探，但尚无稳定采集器

| 平台/来源 | 已做工作 | 当前障碍 |
|---|---|---|
| ExportHub | 搜索索引发现过 RFQ 线索 | 源站 Cloudflare 403，未形成稳定详情采集器 |
| FreshDI | 搜索索引发现过买家公司/需求线索 | 源站 403，当前记录仍需源站补证 |
| Global Trade Plaza | 建立来源登记 | Cloudflare 403，未采集 |
| ConnectAmericas | 建立来源登记 | 需要进一步验证公开详情和账号边界 |
| TradeFord | 建立来源登记 | 页面质量和阻断情况尚未通过验收 |
| eWorldTrade | 建立来源登记 | 尚未开发和运行采集器 |
| HKTDC Sourcing | 建立来源登记 | 需要账号/公开边界验证 |
| UN Global Marketplace | 建立来源登记 | 尚未接公开搜索或 OAuth API |
| JETRO Business Matching | 建立来源登记 | 日本业务撮合入口，尚未形成采集器 |
| USDA AMS Solicitations | 已发现官方采购文档入口 | 尚未开发文档/附件采集器 |
| ImportYeti | 只访问首页，0 条贸易记录 | 尚未实现具体公司/产品搜索采集器 |
| Sysco Supplier Portal | 页面抓取 HTTP 200，但解析 0 条 | 静态正文不足，尚未做动态页面适配 |
| Target / Whole Foods / Kroger / Costco | 仅列入独立零售采购入口 | 尚未开发；即使采集也只能算采购渠道，不算当前需求 |
| US Foods / UNFI / KeHE | 仅列入食品分销商入口 | 尚未开发；需要区分供应商准入和真实采购动作 |
| TikTok 评论区 | 仅做可行性讨论 | 账号、反自动化、隐私和低 B2B 真实性问题；未实现 |

### D. 明确暂缓

| 平台 | 状态 | 原因 |
|---|---|---|
| 6sense | `DEFERRED` | 企业级意图产品，接入成本高；当前 36 小时 Demo 不接 |

## 当前优先级

| 优先级 | 要做的事 | 原因 |
|---:|---|---|
| P0 | 稳定 TradeKey、go4WorldBusiness、TradeWheel、EC21 | 已有真实数据，继续扩量成本最低 |
| P0 | 保持 SAM、TED、USAspending API 定时运行 | 官方证据强，可作为四维验真的交叉证据 |
| P0 | 办理 Alibaba ICBU RFQ 权限 | 能直接获得平台 RFQ，是最重要的账号型缺口 |
| P1 | 接通 Volza/Trademo | 用真实贸易记录证明买家“确实买过/近期在买” |
| P1 | 接通 Apollo 后只补 A/B 级买家 | 控制 credits，补全公司和决策人 |
| P1 | 用 Clay 承接最终 A/B 级机会 | Clay 是编排出口，不是原始买家需求来源 |
| P2 | ExportHub、FreshDI、ConnectAmericas | 先解决合法访问边界，再开发采集器 |
| 暂缓 | Amazon Business、TikTok、6sense | 当前投入产出比最低 |

## 防止口径混淆

- **已实现采集**不等于数据全部合格：EC21 和 SAM 已跑通，但当前五品类精准结果很少。
- **尚未连 API**不等于没有代码：Trademo、Volza、Apollo、Clay 已有连接器，但没有凭据，不能宣称 `HEALTHY`。
- **公开说明页可访问**不等于采到需求：Alibaba、Amazon、ImportYeti 的说明页/首页均为 0 条有效记录。
- **买家目录/供应商入口**不等于采购需求：必须与 RFQ、招标公告、近期贸易记录分层保存。
