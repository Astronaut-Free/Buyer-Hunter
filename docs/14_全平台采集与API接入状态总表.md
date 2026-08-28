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
| HKTDC Sourcing | Playwright 公开 RFQ 浏览器采集 | 当前公开页 20 条 RFQ；五品类 5 次精准搜索均 0 条 | `LIVE_PUBLIC_SEARCH` | 列表和搜索公开；Quote Now 需要供应商登录 |
| JETRO e-Venue | Playwright 公开案件搜索 | 当前公开页 20 条案件；五品类均启用采购意向筛选，5 次搜索均 0 条 | `LIVE_PUBLIC_SEARCH` | 搜索公开；联系案件发布者需要注册/登录 |

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
| Alibaba.com RFQ | 正式 API 连接器已写；公开 RFQ 列表/详情采集器已真实运行；最新 12/12 请求成功，122 条原始记录、11 条产品候选 | API 仍缺 ICBU/GGS 开发者资格与密钥；公开页报价动作要求登录 | 无账号时采集公开字段并保留页面快照；以后有资质再切正式 API，报价与联系人解锁不做绕过 |
| Trademo | 连接器已写 | 商务 API 合同、Key、Base URL、鉴权与端点路径 | 联系 Sales 申请 Sandbox/Production 参数 |
| Volza | 连接器已写 | `VOLZA_API_TOKEN` 和付费业务端点权限 | 购买/开通正式 API；禁止抓取其付费网站 |
| Apollo | 连接器已写 | `APOLLO_API_KEY`、套餐权限和 credits | 接公司搜索、企业补全和人员补全；公开 OpenAPI 暂无 Buying Intent 读取端点 |
| Clay | Webhook 连接器已写，当前 dry-run | `CLAY_WEBHOOK_URL` 和可选 Token | 创建 Monitor Webhook，先 smoke test 再真实推送 |

### B. 账号内可用，但没有可直接接入的公开 RFQ API

| 平台 | 当前状态 | 未实现原因 | 处理方式 |
|---|---|---|---|
| RangeMe | 未采集 | 封闭零售买家网络；未发现公开需求 API | 注册 Supplier，人工验证 Immediate Opportunities/合法导出能力 |
| Made-in-China | 未采集 | Sourcing Request 在供应商账号内；未发现普通供应商 RFQ API | 注册 Supplier，优先检查 CSV/Excel 导出，再评估授权会话采集 |
| Amazon Business | 已用真实浏览器验证 RFQ 官方说明页，0 条公开需求 | RFQ 是买家在商品页发起并在账号 Quotes Dashboard 管理；未发现卖家公开搜索全平台 Custom Quotes 的入口 | 只有真实 Business/Professional 账号且功能开放后才能继续，公开页面不计采购数据 |

### C. 已发现或试探，但尚无稳定采集器

| 平台/来源 | 已做工作 | 当前障碍 |
|---|---|---|
| ExportHub | 搜索索引发现过 RFQ 线索 | 源站 Cloudflare 403，未形成稳定详情采集器 |
| FreshDI | 搜索索引发现过买家公司/需求线索 | 源站 403，当前记录仍需源站补证 |
| Global Trade Plaza | Playwright 访问买家线索页和指定抹茶 lead | 两条官方入口均进入 Cloudflare 安全验证并返回 403；停止，不绕过 |
| ConnectAmericas | Playwright 访问 tea 商机详情 | 官方源站返回 403；搜索索引文本不作为源站已验证机会 |
| TradeFord | Playwright 访问 importer 专用入口 | Cloudflare 安全验证 403；停止，不绕过 |
| eWorldTrade | Playwright 访问 importer 入口 | 当前域名展示美国执法机构查封页，来源标记为不可用 |
| UN Global Marketplace | 公开页面 XHR 采集器已写并真实试跑 | Matcha 1 次、Tea 4 次搜索均 HTTP 200；精准关键词 0 条，当前不能计作采购机会 |
| USDA AMS Solicitations | Playwright 访问官方 Solicitations 与 Vendor 页面 | 两个官方页面均由 CDN 返回 Access Denied 403；停止，不绕过 |
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
| P0 | 稳定 Alibaba 公开 RFQ 采集，并择机办理 ICBU API 权限 | 公开页已经能取需求证据；API 用于提高稳定性，报价仍需真实供应商账号 |
| P1 | 接通 Volza/Trademo | 用真实贸易记录证明买家“确实买过/近期在买” |
| P1 | 接通 Apollo 后只补 A/B 级买家 | 控制 credits，补全公司和决策人 |
| P1 | 用 Clay 承接最终 A/B 级机会 | Clay 是编排出口，不是原始买家需求来源 |
| P2 | ExportHub、FreshDI、ConnectAmericas | 先解决合法访问边界，再开发采集器 |
| 暂缓 | Amazon Business、TikTok、6sense | 当前投入产出比最低 |

## 防止口径混淆

- **已实现采集**不等于数据全部合格：EC21 和 SAM 已跑通，但当前五品类精准结果很少。
- **尚未连 API**不等于没有代码：Trademo、Volza、Apollo、Clay 已有连接器，但没有凭据，不能宣称 `HEALTHY`。
- **公开页面采集有明确边界**：Alibaba 已取得公开 RFQ 列表和详情字段，但报价、联系人解锁仍要求真实登录；Amazon、ImportYeti 仍只有说明页/首页，不能计作有效需求。
- **买家目录/供应商入口**不等于采购需求：必须与 RFQ、招标公告、近期贸易记录分层保存。
