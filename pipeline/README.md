# Buyer Hunter 采集与决策管道

## 一键运行整条管道

```powershell
python pipeline/run_pipeline.py
```

依次执行：各采集器 → 清洗打分 → `aggregate_full_collection_v1.py` → `build_opportunity_store_v1.py`。

- 每个采集器在独立进程运行，单个失败不影响其他，整轮标 `PARTIAL`；聚合与建库失败则整轮 `FAILED`。
- 缺少凭据的采集器（如未设 `SAM_API_KEY`）自动跳过，不算失败。
- 结果写入 `runtime/pipeline_last_run.json` 和 `runtime/pipeline_runs.jsonl`，供“X 分钟前发现一条商机”接口使用。
- 定时执行：接 Windows 计划任务 / cron / 云定时器即可。
- `--skip-collect` 只重新聚合并建库；`--only <step>` 单跑某一步。

采集运行产物（`pipeline/data_*/`）和生成的 `runtime/buyer_hunter.db` 都是构建产物，不进 git；
测试用的固定样本在 `pipeline/tests/fixtures/`。

## 小样本采集

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
