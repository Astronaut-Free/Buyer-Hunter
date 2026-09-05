# 黔脉 QianPulse · 电脑端工作台 UI

本目录为独立的原生 HTML / CSS / JavaScript 交互原型，不替换仓库现有产品首页、移动端页面或后端服务。

## 直接查看

下载本目录的 `qianpulse-desktop-workbench.html`，用浏览器打开即可。页面已内嵌所有图片、样式和脚本，无需安装依赖。

也可以在仓库根目录启动本地预览：

```sh
python3 -m http.server 4188 --directory desktop-workbench
```

然后打开：<http://127.0.0.1:4188/qianpulse-desktop-workbench.html>

## 本版内容

- 全宽白色顶栏，左上角为原色 Logo；深绿色侧栏位于顶栏下方。
- 左侧和顶部均保留“找新商机”入口；无“工作空间”文字。
- 今日简报、待办、推荐商机 Scroll Stack、销售进度。
- 商机市场、收藏、筛选及二级商机详情。
- 扩展的三栏消息工作台，包含聊天、AI 工作日志、草稿、附件和人工接管。
- 找新商机的产品、目标、授权流程，以及研究报告与买家清单导出。
- 克制的列表入场、AI 卡片柔光与草稿扫光；尊重系统减少动态效果设置。

所有公司、采购信息、邮箱、消息及 AI 行为均为样例。发送只生成本地记录，不会真实联系买家；本地状态存储在浏览器中。

## 编辑与生成

- `workbench.source.html`：页面结构、样例数据与交互逻辑。
- `workbench.v2.css`：当前完整样式，包含后续消息布局、Logo 和全宽顶栏调整。
- `build.mjs`：将源码和图片打包成单文件，检查占位符与脚本语法。
- `assets/qianpulse-logo-original.jpg`：Logo 原图。

修改源码后，在本目录运行（需要 Node.js，无额外 npm 依赖）：

```sh
node build.mjs
```

背景和两张头像保存在已提交 HTML 内。打包时优先使用 `assets/chat-background.jpg`、`assets/agent-avatar.jpg`、`assets/user-avatar.jpg`（如果存在），否则复用该 HTML 的内嵌图片。因此重新生成前请保留已提交的 HTML。

## 界面验证

消息改版已验证 1440 × 900、1920 × 1080 的布局、主要消息交互及减少动态效果；最终全宽顶栏版本通过单文件生成与脚本语法检查。

动效行为参考 [React Bits Animated List](https://reactbits.dev/components/animated-list)、[Spotlight Card](https://reactbits.dev/components/spotlight-card)、[Star Border](https://reactbits.dev/animations/star-border)，这些新增轻动效由原生代码独立实现，未引入 React 运行时。Scroll Stack 的既有来源说明保留在源码中。
