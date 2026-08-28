# Buyer Hunter 小样本采集

本目录先保存真实来源响应，再依据样本生成字段覆盖矩阵。它不是生产级批量爬虫。

```powershell
python pipeline/collect_samples.py
python pipeline/collect_samples.py --only tradewheel_matcha go4worldbusiness_us sam_gov
```

每次运行在 `pipeline/data/<UTC run id>/` 生成：

- `raw/`：原始响应快照；
- `probe_results.json`：访问结果、HTTP 状态、内容哈希和错误；
- `records.jsonl`：从本轮真实响应提取的候选记录；
- `field_inventory.csv`：按来源统计的非空字段覆盖率。

访问规则：每域串行、请求间隔 2 秒、响应上限 2 MB；检查 robots.txt；不绕过登录、验证码、付费墙和访问控制。账号型平台的公开页面只用于确认接入边界，不会把营销页伪装成真实 RFQ。
