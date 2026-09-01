# Buyer Hunter：四个平台供应商注册与 API 办理手册

更新时间：2026-08-28

## 一页结论

| 优先级 | 平台 | 应注册身份 | RFQ/买方需求入口 | API结论 | 当前动作 |
|---:|---|---|---|---|---|
| 1 | Alibaba.com | Seller / Supplier | RFQ Market | 官方存在 ICBU RFQ API | 立即注册卖家并申请只读 API |
| 2 | RangeMe | Supplier | Immediate Opportunities / Retailer Submissions | 未发现公开买方需求 API | 注册免费供应商账号，人工验证 |
| 3 | Made-in-China | Supplier | Unquoted Sourcing Requests / Sourcing Channel | 未发现普通供应商可申请的公开 RFQ API | 注册免费供应商账号，检查导出能力 |
| 4 | Amazon | Professional Seller + Amazon Business | B2B Central / Manage Quotes | SP-API 存在，但未发现搜索 Custom Quotes 的公开接口 | Demo 阶段暂缓，已有专业卖家账号时再接入 |

平台身份全部选择“供应商/卖家”，不要选择买家。Buyer Hunter 的目的，是读取买家发布的需求并由供应商报价。

## 1. Alibaba.com

### 注册身份

`Seller / Supplier`，建议使用真实企业主体完成 Business Verification。

### 账号注册

1. 打开 <https://seller.alibaba.com/>，点击 `Start selling now`。
2. 填写企业法定名称、营业执照、企业地址、授权联系人、企业邮箱和手机号。
3. 完成企业认证后登录 Seller Central。
4. 进入 `RFQ Market`，手工搜索 `matcha`，确认账号拥有 RFQ 浏览权限。

### API 办理

1. 打开 <https://developer.alibaba.com/>，注册企业开发者。
2. 创建 Alibaba.com / ICBU 企业自用应用。
3. 申请以下只读权限：
   - `alibaba.icbu.rfq.search`
   - `alibaba.icbu.rfqdetail.get`
   - `alibaba.icbu.rfq.recommend`
   - `alibaba.icbu.rfq.myequity`
   - `alibaba.icbu.rfq.read`
4. Demo 阶段不申请或不调用 `alibaba.icbu.quotation.post`，防止程序自动对外报价。
5. 记录 `AppKey` 和 `AppSecret`。
6. 使用已认证卖家账号授权自用应用，取得 `SessionKey` 或平台返回的授权 Token。

### 本地需要的变量

```text
ALIBABA_APP_KEY
ALIBABA_APP_SECRET
ALIBABA_SESSION_KEY
```

官方文档：

- RFQ 市场：<https://seller.alibaba.com/rfq>
- RFQ 搜索 API：<https://developer.alibaba.com/docs/api.htm?apiId=32084>
- RFQ 详情 API：<https://developer.alibaba.com/docs/api.htm?apiId=32086>

## 2. RangeMe

### 注册身份

选择 `Supplier — I sell products to wholesale buyers`，不要选择 Buyer。

### 注册流程

1. 打开 <https://www.rangeme.com/>，注册 Supplier 并确认邮箱。
2. 创建公司、品牌和至少一个产品档案。
3. 准备英文产品名称、图片、包装规格、MOQ、供货能力、成分/营养标签、条码和认证。
4. 发布产品档案后检查 `Immediate Opportunities`。
5. 检查 `Retailer Submissions` 中的限时采购活动。

### API 结论

RangeMe 是封闭买家网络，买家需认证。当前未发现公开的买方需求导出 API，因此不需要寻找 API Key。后续只能使用账号有权查看的页面或平台提供的合法导出能力。

官方帮助：

- Supplier Home：<https://help.rangeme.com/hc/en-us/articles/360038630574-Supplier-Home-Page>
- Supplier Help：<https://help.rangeme.com/hc/en-us/categories/202074027-Help-for-Suppliers>

## 3. Made-in-China

### 注册身份

选择 `Supplier`，不要注册采购商账号。

### 注册流程

1. 打开 <https://www.made-in-china.com/>，点击 `Join Free`。
2. 使用企业邮箱填写公司中英文名称、营业执照信息和联系人。
3. 登录 Virtual Office。
4. 检查 `Unquoted Sourcing Requests`、`Sourcing Channel` 和 `New Quote(s) of Sourcing Request`。
5. 分别搜索 matcha、blueberry、Rosa roxburghii、chili powder、tea。
6. 免费账号先验证数据量与字段完整度，再决定是否购买高级会员。

### API 结论

当前未发现面向普通供应商开放的 RFQ 开发者 API。优先检查后台是否有 CSV/Excel 导出；没有导出时，再使用正常授权登录会话采集，不绕过权限。

如果升级 Audited Supplier，可能涉及营业执照、贸易能力、生产能力、质量体系、产品认证和现场/文件审核。

官方说明：

- 供应商账户中心：<https://service.made-in-china.com/help/guide/member/index.htm>
- 高级供应商与审核条款：<https://www.made-in-china.com/help/terms_chinasupplier/>

## 4. Amazon Business

### 注册身份

选择 `Professional Seller`，注册完成后启用 Amazon Business B2B selling tools。不要注册 Amazon Business Buyer。

### 注册材料

- 营业执照和企业登记信息
- 法人/主要联系人的政府证件
- 企业和居住地址证明
- 可国际扣款信用卡
- 收款银行账户
- 税务信息
- 手机号、产品条码/GTIN、品牌信息

### 注册流程

1. 打开 <https://sell.amazon.com/sell/registration-guide>。
2. 注册 Professional selling account。
3. 完成企业、联系人、账单、产品和身份验证。
4. 登录 Seller Central，进入 B2B Central。
5. 检查 `Manage Quotes` / `Custom Quotes` 是否对账号开放。
6. 至少需要有可销售 Listing，才能匹配相应企业询价。

### API 结论

Amazon SP-API 可管理商品、库存、价格、订单和报表，但当前官方接口目录中未发现搜索全平台 Custom Quotes/RFQ 的公开操作。不要为了 Buyer Hunter Demo 单独支付专业卖家费用；已有可用账号和商品时再评估。

如果未来接 SP-API，需要 Professional Seller 主账号在 Developer Central 创建 Private App，取得 LWA Client ID、LWA Client Secret 和 Refresh Token，但这些凭证本身不代表能读取 RFQ。

官方说明：

- Amazon Business 卖家：<https://sell.amazon.com/programs/amazon-business>
- SP-API：<https://sell.amazon.com/developers>
- SP-API 应用注册：<https://developer-docs.amazon.com/sp-api/docs/registering-your-application>

## 凭证安全规则

1. 不在聊天、截图、飞书或 GitHub 中发送密码、验证码、身份证件、银行卡资料、AppSecret 或 Token。
2. 取得阿里凭证后，只回复“阿里三个凭证已拿到”。
3. 项目使用隐藏输入 PowerShell 脚本写入 Windows 用户环境变量。
4. `.env`、密钥 JSON、浏览器 Cookie 和授权 Token 必须进入 `.gitignore`。
5. Demo 默认只申请和调用读取权限；自动报价、自动联系买家等写操作单独授权。

## 下午执行清单

- [ ] Alibaba.com 企业卖家注册完成
- [ ] Alibaba RFQ Market 可手工搜索
- [ ] 阿里企业开发者注册完成
- [ ] ICBU RFQ 五个只读接口已申请
- [ ] RangeMe Supplier 邮箱验证完成
- [ ] Made-in-China Supplier 免费账号完成
- [ ] Amazon 根据现有账号条件决定是否暂缓
