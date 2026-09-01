# 当前试爬入口

使用质量门禁版采集器：

```powershell
python pipeline/collect_samples_v2.py
```

SAM.gov 官方 Opportunities API 必须使用账号生成的公开 API Key。密钥只通过环境变量传入，不写入仓库：

```powershell
$env:SAM_API_KEY = "..."
python pipeline/collect_samples_v2.py --only sam_gov
```

`PUBLIC_INFO_ONLY` 只表示公开说明页能够访问，不代表抓到了真实 RFQ；这类页面不会写进 `records.jsonl`。
