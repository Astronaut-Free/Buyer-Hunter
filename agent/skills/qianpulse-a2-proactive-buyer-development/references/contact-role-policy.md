# A2 Contact Role Policy

## 1. 原则

先确认 Buyer Company，再找与当前产品采购最相关的具体联系人。

## 2. 默认角色顺序

```text
Procurement Director / Manager
Purchasing Director / Manager
Sourcing Director / Manager
Import Manager
Category Manager
Supply Chain Director / Manager
Founder / Owner（中小企业）
```

## 3. 数量控制

默认每家公司最多保留 1-3 名候选联系人。

高价值企业可在人工确认后扩大。

## 4. 角色相关性

```yaml
role_reason:
  target_role: string
  matched_title: string
  relevance: high|medium|low
  reason: string
```

## 5. Email 准入

优先顺序：

```text
verified work email
→ work email unknown status
→ public company contact route
```

不自动使用私人邮箱进行批量开发。

## 6. 禁止

- 未绑定 Buyer Company 的孤立联系人进入 READY。
- title 模糊时直接标记采购决策人。
- 自动扩展几十名同公司联系人提升“命中率”。