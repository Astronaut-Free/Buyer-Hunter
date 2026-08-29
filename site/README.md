# 黔脉 QianPulse UI

这是黔脉的静态双页面演示：

- `index.html`：首页
- `opportunities.html`：全球商机主页面
- `assets/`：页面图片与本地地图数据

首页的“立即寻找商机”按钮会跳转到 `opportunities.html`。

## 本地预览

请不要直接双击 HTML（浏览器可能会拦截本地地图数据），在项目目录运行：

```bash
python3 -m http.server 8000
```

然后在浏览器打开 <http://localhost:8000>。
