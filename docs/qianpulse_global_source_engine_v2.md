# 黔脉 / 全球派 V2｜Global Source Engine 现有代码升级工程文档

> 文档版本：V2.0  
> 项目：黔脉 QianPulse / 全球派  
> 仓库：`Astronaut-Free/Buyer-Hunter`  
> 当前主分支：`main`  
> 当前核对基线：`5950ebddf226dc9010a145c30dfccba7dc601b34`  
> 推荐实施分支：`feature/qianpulse-source-engine-v1`  
> 文档性质：PRD + Engineering Design + Migration Plan  
> 核心原则：保留现有 Opportunity / Evidence / A2–A6 主链，在现有采集管道上做增量升级。

---

# 0. 结论

经过对当前 `Buyer-Hunter` 主分支代码、Pipeline、Source Registry、Opportunity Store、Evidence Schema、Agent Runtime 的核对，结论如下：

## 0.1 这个方向已经存在，完成度约 2/3

现有代码已经具备：

```text
Source Registry
↓
多来源 Collector
↓
公开网页 / API Fetch
↓
robots / access policy
↓
Raw Snapshot
↓
Evidence
↓
字段抽取
↓
Clean / Score
↓
Aggregate
↓
Opportunity Store
↓
Buyer / Signal / Requirement
↓
A2–A6 Agent Runtime
```

当前缺口集中在：

```text
“新增一个网站”
仍然需要
开发人员手写 Collector / Parser / Pipeline Step
```

因此，本项目不应新建第二套 Global Source Engine。

正确方向是：

# 在现有 `pipeline` 上增加 Source Compiler + SourceSpec + Generic Runtime

把：

```text
人工研究网站
→ 手写 Collector
→ 手写 Parser
→ 手工接 Pipeline
```

升级成：

```text
输入公开网站
→ 自动分析
→ 生成 SourceSpec
→ Generic Runtime 执行
→ 自动 Eval
→ 注册 Source
→ 输出 Canonical Record
→ 进入现有 Opportunity 链
```

---

# 1. 项目定位

## 1.1 项目名称

# Global Source Engine

中文：

# 全球商机源引擎

所属产品：

# 黔脉 QianPulse / 全球派

战略位置：

# “发现全球需求”的基础能力层

---

## 1.2 一句话定义

> 把全球公开网站自动转换为可持续运行的结构化商机来源，并统一接入全球派现有 Opportunity 经营链。

---

## 1.3 对外表达

对外不重点讲：

```text
爬虫
MCP
Playwright
网页自动化
HTML Parser
```

对外核心表达：

> 用户告诉全球派“我有什么货”，系统持续扩展全球公开商机来源，发现哪里正在真实需要它。

---

# 2. 现有代码审查

---

## 2.1 当前仓库

```text
Astronaut-Free/Buyer-Hunter
```

当前默认分支：

```text
main
```

当前核对主分支 Commit：

```text
5950ebddf226dc9010a145c30dfccba7dc601b34
```

现有重要分支包括：

```text
main
Free
MVP
brand2
Agent
feature/qianpulse-frontend-v2
feat/a345-agent-runtime
codex/a2-closed-loop-repair
codex/a6-opportunity-progression
integration
```

Source Engine 本轮不要直接进入：

```text
main
```

推荐独立分支：

```text
feature/qianpulse-source-engine-v1
```

---

# 3. 当前代码已经具备的 Source Engine 雏形

---

## 3.1 Source Registry 已存在

当前文件：

```text
pipeline/b2b_source_registry_v3.json
```

已经登记大量来源：

```text
TradeKey
go4WorldBusiness
EC21
SAM.gov
TED EU
USDA AMS
TradeWheel
ExportHub
FreshDI
Global Trade Plaza
ConnectAmericas
TradeFord
HKTDC
UNGM
JETRO
Alibaba RFQ
ImportYeti
Volza
Trademo
...
```

已有字段：

```text
code
name
layer
regions
access_mode
priority
adapter_status
entry_url
```

现有 Policy 已经明确：

```text
Only public pages or authorized APIs.
No login.
No paywall.
No CAPTCHA bypass.
No contact masking bypass.
No rate-limit bypass.
```

因此，本轮“去掉需要登录页面点击逻辑”的要求，与现有工程边界一致。

---

## 3.2 已有公开网页采集 Runtime

当前：

```text
pipeline/collect_samples.py
```

已经具备：

```text
robots.txt 检查
↓
HTTP GET / POST
↓
响应大小限制
↓
HTML / JSON 自动判断
↓
Raw Snapshot
↓
SHA256
↓
结构化字段提取
↓
records.jsonl
↓
field_inventory.csv
```

并明确禁止：

```text
login bypass
CAPTCHA bypass
paywall bypass
access control bypass
```

所以 Fetch Runtime 不需要推倒重写。

本轮要做的是抽象和通用化。

---

## 3.3 Evidence 机制已经成熟

现有采集运行会保留：

```text
raw/
probe_results.json
records.jsonl
field_inventory.csv
```

Evidence 相关信息已经包括：

```text
source_url
observed_at
published_at
snapshot_sha256
snapshot_path
evidence_span
data_mode
```

现有代码的正确原则：

# 先保存证据，再做判断

这一点必须保留。

---

## 3.4 Pipeline 主链已经存在

当前：

```text
python pipeline/run_pipeline.py
```

执行：

```text
collectors
↓
clean / score
↓
aggregate_full_collection_v1.py
↓
build_opportunity_store_v1.py
```

当前 Collector 包括：

```text
collect_b2b_public_v3.py
collect_alibaba_public_rfq.py
collect_ted_precise.py
collect_ec21_regions.py
collect_sam_precise.py
collect_ungm_public.py
collect_samples_v2.py
```

Pipeline 已经支持：

```text
单 Collector 失败隔离
PARTIAL 状态
缺凭据自动 SKIPPED
Required Step
运行日志
定时运行
```

这些都应该直接复用。

---

# 4. 当前最关键的工程缺口

---

## 4.1 每个网站仍然需要手写 Collector

例如：

```text
pipeline/collect_b2b_public_v3.py
```

内部硬编码：

```text
LISTINGS = [...]
```

同时硬编码：

```text
PARSERS = {
    tradekey,
    go4worldbusiness
}
```

网站增加一个：

```text
新 URL
↓
新增代码
↓
新增 Parser
↓
新增字段规则
↓
新增测试
↓
改 run_pipeline.py
```

扩展成本会线性增加。

---

## 4.2 Parser 仍然以站点专用逻辑为主

当前：

```text
pipeline/parser_quality_v1_1.py
```

包含：

```text
extract_tradekey_card()
extract_go4worldbusiness_card()
```

这一层已经具备高质量 Evidence-bound extraction 思路，但缺少：

```text
Declarative Parser
SourceSpec Parser
Generic Extractor
```

---

## 4.3 当前 Source 配置存在多个事实入口

现在至少有：

```text
pipeline/b2b_source_registry_v3.json
pipeline/sources.json
pipeline/run_pipeline.py::STEPS
```

三个位置同时表达 Source / Collector / Pipeline 信息。

风险：

```text
Source 注册了
Collector 没接

Collector 在跑
Registry 状态没更新

sources.json 已改
run_pipeline.py 未同步
```

V2 必须收敛成：

# Single Source Truth

---

# 5. V2 目标架构

```text
Seller Goal
产品 + 目标市场
        ↓
Global Source Engine
        ↓
┌───────────────────────────────┐
│ Source Registry               │
│ Source Discovery              │
│ Source Compiler               │
│ SourceSpec                    │
│ Generic Fetch Runtime         │
│ Generic Extractor             │
│ Source Validator              │
│ Source Health / Eval          │
└───────────────────────────────┘
        ↓
Canonical Source Record
        ↓
现有 Clean / Score
        ↓
现有 aggregate_full_collection
        ↓
现有 build_opportunity_store
        ↓
Opportunity
        ↓
A2 Buyer Discovery / Research
        ↓
A3 Timing
A4 Supply Fit
A5 Risk
        ↓
A6 Opportunity Progression
        ↓
Action
        ↓
Feedback
        ↓
Deal
```

---

# 6. 核心原则

## 6.1 不新建第二套 Opportunity

保留现有：

```text
Opportunity
Buyer
Signal
Evidence
Requirement
Field Observation
Score Breakdown
```

---

## 6.2 不新建第二套 Agent Runtime

A2–A6 继续使用现有：

```text
agent/
pipeline/skills/
agent/skill-runtime/
```

---

## 6.3 不推翻现有 Evidence Contract

Source Engine 输出必须继续保留：

```text
source_url
raw snapshot
snapshot_sha256
observed_at
published_at
evidence span
source code
data mode
```

---

## 6.4 MCP 放在外层

内部架构：

```text
Website
↓
SourceSpec
↓
Source Runtime
↓
Canonical Record
```

外部生态需要时：

```text
Global Source Engine
↓
QianPulse MCP
↓
External Agent
```

不要把内部实现绑死在 MCP。

---

# 7. 新增核心：SourceSpec

每一个 Source 最终由一份可执行配置表达。

示例：

```yaml
code: tradekey

version: 1

type: DIRECT_RFQ

regions:
  - GLOBAL

access:
  mode: PUBLIC_HTML
  login_required: false
  captcha_bypass: false
  paywall_bypass: false

entry:
  url_template: https://www.tradekey.com/{product}-buyer/

fetch:
  mode: HTTP
  method: GET
  min_interval_ms: 2000
  max_response_bytes: 2097152

records:
  type: list
  selector: div.cwrap

fields:
  title:
    selector: h2.search-title a
    extract: text

  source_url:
    selector: h2.search-title a
    extract: href

  buyer_country_raw:
    selector: .location
    extract: text

  quantity_raw:
    extractor: regex
    pattern: "Initial quantity\\s*:\\s*(.+)"

  published_at:
    extractor: platform_date

policy:
  save_raw_snapshot: true
  require_source_url: true
  require_evidence_span: true

output:
  schema: qianpulse_source_record_v1
```

---

# 8. SourceSpec 解决什么

现有：

```text
一个网站 = 一个 Collector Python 文件
```

升级后：

```text
一个网站 = 一份 SourceSpec
```

只有真正复杂的网站才需要：

```text
Custom Adapter
```

目标：

```text
80% Source
→ Declarative SourceSpec

20% Source
→ Custom Adapter
```

---

# 9. Source Compiler

输入：

```text
https://example.com
```

Source Compiler 执行：

```text
1. Access Policy Check
↓
2. robots.txt
↓
3. sitemap / RSS
↓
4. HTML 分析
↓
5. JSON-LD / Schema.org 分析
↓
6. 公开 XHR / fetch 分析
↓
7. REST / GraphQL Detection
↓
8. 列表结构识别
↓
9. 详情结构识别
↓
10. 分页规则识别
↓
11. Candidate Field Detection
↓
12. 生成 SourceSpec Draft
↓
13. 跑 Sample
↓
14. Field Coverage Eval
↓
15. Evidence Eval
↓
16. Source Validation
↓
17. Registry Registration
```

---

# 10. 技术优先级

统一采用：

```text
1. 官方公开 API
↓
2. 页面公开 REST / GraphQL / XHR
↓
3. HTTP + HTML
↓
4. Crawl4AI / Firecrawl
↓
5. Playwright 仅用于公开 JS 页面渲染
```

明确排除：

```text
登录后操作
账号内页面点击
自动支付
自动购买
登录绕过
验证码绕过
付费墙绕过
权限绕过
```

---

# 11. 新目录结构

建议：

```text
pipeline/
│
├── source_engine/
│   ├── __init__.py
│   ├── source_spec.py
│   ├── registry.py
│   ├── discovery.py
│   ├── fetcher.py
│   ├── api_discovery.py
│   ├── html_discovery.py
│   ├── extractor.py
│   ├── normalizer.py
│   ├── compiler.py
│   ├── validator.py
│   ├── health.py
│   ├── eval.py
│   └── runner.py
│
├── source_specs/
│   ├── tradekey.yaml
│   ├── go4worldbusiness.yaml
│   ├── ec21.yaml
│   └── ...
│
├── source_registry_v4.json
│
├── aggregate_full_collection_v1.py
├── build_opportunity_store_v1.py
└── run_pipeline.py
```

---

# 12. Source Registry V4

把当前多个事实入口收敛。

建议：

```json
{
  "version": "4.0",
  "sources": [
    {
      "code": "tradekey",
      "type": "DIRECT_RFQ",
      "regions": ["GLOBAL"],
      "spec": "source_specs/tradekey.yaml",
      "status": "LIVE",
      "priority": "P0",
      "health": "HEALTHY"
    }
  ]
}
```

以后：

```text
Registry
↓
自动加载 SourceSpec
↓
Runner
```

`run_pipeline.py` 不再手工维护一长串站点 Collector。

---

# 13. Canonical Source Record

所有 Source Runtime 输出统一：

```json
{
  "source_code": "tradekey",
  "source_type": "DIRECT_RFQ",
  "source_url": "...",
  "listing_url": "...",
  "title": "...",
  "description_raw": "...",
  "buyer_name_raw": null,
  "contact_person_raw": null,
  "buyer_country_raw": "...",
  "quantity_raw": "...",
  "published_at": "...",
  "deadline_at": null,
  "observed_at": "...",
  "snapshot_sha256": "...",
  "snapshot_path": "...",
  "data_mode": "LIVE",
  "verification_status": "...",
  "field_observations": []
}
```

后续继续交给：

```text
clean
score
aggregate
opportunity store
```

---

# 14. 与现有数据库的关系

当前数据库已经具备：

```text
source
crawl_run
crawl_item
evidence
buyer
signal
signal_evidence
field_observation
requirement
opportunity
score_breakdown
```

所以 V2 不需要重新设计核心业务库。

建议新增或扩展：

```text
source_spec_version
source_health
source_eval
source_schema_version
source_last_success_at
source_last_failure_at
source_yield
source_valid_rate
```

可优先放：

```text
runtime / JSONL
```

等稳定后再迁移数据库。

---

# 15. Source Graph

后期形成：

```text
Website
├── Country
├── Region
├── Language
├── Industry
├── Source Type
├── Access Mode
├── Reliability
├── Update Frequency
├── Historical Yield
├── Valid Opportunity Rate
├── Duplicate Rate
├── Buyer Reply Rate
├── Deal Contribution
├── Extraction Stability
└── SourceSpec Version
```

系统最终能够回答：

```text
德国抹茶需求去哪里找效果最好？
日本食品买家在哪些 Source 出现最多？
哪个 Source 看起来数据量大，但有效商机低？
哪个 Source 产生过买家回复？
哪个 Source 产生过成交？
哪个 Source 最近结构变化导致失效？
```

---

# 16. Source Agent

后续阶段：

用户输入：

> 我要把贵州抹茶卖到中东。

Source Agent：

```text
寻找公开采购网站
↓
寻找政府采购
↓
寻找行业协会
↓
寻找展会 / 企业目录
↓
判断公开访问边界
↓
生成 SourceSpec
↓
运行 Sample
↓
Evaluate
↓
注册高价值 Source
↓
持续更新
```

最终形成：

# 自扩张全球商机网络

---

# 17. 与现有 A2–A6 的关系

现有主链：

```text
Seller Target
↓
A2 Buyer Discovery
↓
Opportunity
↓
A3 Timing
↓
A4 Supply Fit
↓
A5 Risk
↓
Outreach
↓
Buyer Reply
↓
A6 Progression
```

Global Source Engine 的职责只负责：

```text
更早
更广
更稳定
地产生可信 Opportunity 输入
```

不侵入：

```text
A3
A4
A5
A6
Human Gate
Outreach Runtime
Smartlead
```

---

# 18. MVP 迁移计划

第一阶段只迁两个成熟来源：

```text
TradeKey
go4WorldBusiness
```

原因：

- 已有成熟 Collector
- 已有 Parser
- 已有真实 Raw Snapshot
- 已有字段抽取规则
- 已有 Candidate 判断
- 已进入 Opportunity Pipeline

---

# 19. AB Test

旧链：

```text
collect_b2b_public_v3.py
↓
Output A
```

新链：

```text
tradekey.yaml
go4worldbusiness.yaml
↓
Generic Source Runtime
↓
Output B
```

对比：

```text
source_url
title
buyer_country_raw
quantity_raw
published_at
evidence_span
snapshot_sha256
candidate_count
qualified_count
opportunity_count
```

验收：

```text
Output B >= Output A
```

并且：

```text
不能减少 Evidence
不能提升错误字段置信度
不能制造 Buyer Identity
不能制造 Quantity
不能制造 Destination
```

---

# 20. 第一阶段 P0

## P0-1 SourceSpec Contract

完成：

```text
source_spec.py
schema
validation
version
```

---

## P0-2 Generic HTTP Fetcher

复用现有：

```text
robots
timeout
response cap
retry
snapshot
sha256
```

---

## P0-3 Generic HTML Extractor

支持：

```text
CSS Selector
Attribute
Text
Regex
Date Parser
URL Join
Evidence Span
```

---

## P0-4 Registry V4

统一：

```text
b2b_source_registry_v3.json
sources.json
run_pipeline.py steps
```

---

## P0-5 TradeKey Migration

旧 Collector 与新 Runtime 并行。

---

## P0-6 go4WorldBusiness Migration

完成同等 AB Test。

---

## P0-7 Pipeline Dynamic Loading

从：

```text
hard-coded Step
```

升级：

```text
Registry
↓
Runtime
```

---

# 21. P1

```text
Source Discovery
API Discovery
JSON-LD Detection
XHR Detection
SourceSpec Draft Generator
Source Health
Field Coverage Eval
Automatic Parser Regression
Site Change Detection
```

---

# 22. P2

```text
Source Agent
Automatic Source Discovery
Automatic SourceSpec Generation
Automatic Source Ranking
Source Graph
Source ROI
Outcome Feedback
Deal Contribution Scoring
```

---

# 23. Source Quality Score

建议建立：

```text
Source Quality Score
```

维度：

| 维度 | 权重建议 |
|---|---:|
| 数据可访问稳定性 | 15 |
| 真实需求率 | 20 |
| Buyer 可识别度 | 15 |
| 时间新鲜度 | 10 |
| 字段完整度 | 10 |
| Evidence 强度 | 10 |
| 去重后有效产量 | 10 |
| Buyer Reply / Deal 贡献 | 10 |

最终：

```text
Source Volume
≠
Source Value
```

---

# 24. MVP 验收指标

## 24.1 接入效率

目标：

```text
已有结构类型新 Source
< 30 分钟完成
```

后期：

```text
Compiler 自动 Draft
< 5 分钟
```

---

## 24.2 字段自动映射率

```text
> 80%
```

---

## 24.3 Evidence 保留率

```text
100%
```

---

## 24.4 有效商机率

初期目标：

```text
> 30%
```

---

## 24.5 回归一致性

迁移 Source：

```text
核心字段一致率 > 95%
```

---

## 24.6 Source Health

网站结构变化后：

```text
自动发现
↓
自动降级
↓
禁止静默产出错误结果
```

---

# 25. 错误处理原则

Source Runtime 必须允许：

```text
UNKNOWN
PARTIAL
BLOCKED
STALE
SCHEMA_CHANGED
PARSER_FAILED
```

禁止：

```text
抓不到就猜
没有 Buyer 就生成 Buyer
没有 Quantity 就补 Quantity
没有 Destination 就用 Buyer Country 代替
没有日期就假定最近
```

---

# 26. 与全球派现有核心资产的关系

现有长期资产：

```text
Supply Graph
Demand Evidence Graph
Opportunity Outcome
Decision Policy
```

Global Source Engine 加入：

# Source Graph

最终形成：

```text
Source Graph
+
Demand Evidence Graph
+
Supply Graph
+
Opportunity Outcome
+
Decision Policy
```

闭环：

```text
Source
↓
Signal
↓
Opportunity
↓
Action
↓
Feedback
↓
Outcome
↓
反向评价 Source
```

---

# 27. 商业价值

传统商机平台：

```text
平台有哪些数据
↓
用户看哪些数据
```

全球派：

```text
用户有什么货
↓
系统持续扩展公开数据源
↓
发现需求
↓
判断机会
↓
识别买家
↓
主动触达
↓
获取反馈
↓
持续推进
```

长期价值来自：

# 系统能够知道“去哪找什么需求最有效”

---

# 28. 产品一句话

> 全球派自动连接全球公开商机来源，持续发现真实采购需求。

---

# 29. 能力一句话

> 用户告诉全球派“我有什么货”，系统持续寻找全球哪里正在需要它。

---

# 30. 工程一句话

> 将公开 Web 编译为 SourceSpec，由统一 Source Runtime 运行，再接入现有 Opportunity 主链。

---

# 31. 最终目标架构

```text
Global Public Web
        ↓
Source Discovery
        ↓
Source Compiler
        ↓
SourceSpec
        ↓
Generic Source Runtime
        ↓
Evidence
        ↓
Canonical Source Record
        ↓
Clean / Score
        ↓
Aggregate
        ↓
Opportunity Store
        ↓
A2
        ↓
A3 / A4 / A5
        ↓
A6
        ↓
Action
        ↓
Buyer Feedback
        ↓
Deal Outcome
        ↓
Source ROI Feedback
```

---

# 32. 最终判断

当前 Buyer-Hunter 代码已经具备非常明确的 Source Engine 基础：

```text
Source
↓
Crawl
↓
Evidence
↓
Signal
↓
Opportunity
↓
Agent
```

当前最值得升级的位置只有一个：

# 把“接一个新网站需要开发人员手写代码”，升级成“系统生成并验证 SourceSpec”。

这会让全球派的数据源扩展从：

```text
工程项目
```

逐步变成：

```text
平台能力
```

本轮应严格采用增量方式：

```text
保留现有 Pipeline
保留现有 Evidence
保留现有 Opportunity
保留现有 A2–A6
新增 SourceSpec
新增 Source Compiler
新增 Generic Source Runtime
逐个迁移旧 Collector
```

推荐实施分支：

```text
feature/qianpulse-source-engine-v1
```

第一阶段只处理：

```text
TradeKey
go4WorldBusiness
```

先证明：

```text
配置化 Runtime
能够达到或超过现有手写 Collector
```

验证完成后，再迁：

```text
EC21
Alibaba RFQ
TED
UNGM
SAM.gov
其他公开 Source
```

---

# 33. Definition of Done

- [ ] 已基于 `main` 当前代码开发
- [ ] 未修改 A2–A6 核心 Runtime
- [ ] 未新建第二套 Opportunity
- [ ] 未新建第二套 Evidence
- [ ] SourceSpec Contract 已冻结
- [ ] Registry V4 成为 Source 单一事实入口
- [ ] TradeKey 已迁移
- [ ] go4WorldBusiness 已迁移
- [ ] 旧新链 AB Test 通过
- [ ] Evidence 100% 保留
- [ ] 核心字段一致率达到目标
- [ ] Source Health 可发现结构变化
- [ ] UNKNOWN / BLOCKED / PARTIAL 可表达
- [ ] 单 Source 失败不拖垮全局
- [ ] Pipeline 测试通过
- [ ] Opportunity 数量与质量无回退
- [ ] 文档同步更新
- [ ] Git diff 可解释
- [ ] 可独立回滚
