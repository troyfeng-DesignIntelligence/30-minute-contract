# 洪流骑手 · 受邀 Pilot

这是用于真人试测的静态部署包，只包含模拟器运行所需的浏览器代码和美术资产，不包含研究设计文档、恢复模型、分析结果或参与者数据。

- 默认入口为理解与仪器 pilot：4 家店 × 每店 6 组，共 24 trial。
- 当前运行版本为 `pomdp-v2.6.4-pilot-history-emotion-20260808.11`。
- 首页会生成临时 participant ID 和 seed，并把它们保留在网址和下载日志中。
- 研究者也可以通过查询参数指定 `mode`、`pid` 和 `seed`。
- `mode=experiment` 为 12 家店 × 每店 6 组的 72-trial 正式结构；普通受邀试测不要直接使用该模式。
- 完成后由参与者主动下载 JSON；站点不会自动上传或集中收集数据。

测试入口：https://troyfeng-designintelligence.github.io/30-minute-contract/

该入口仅用于投稿前受邀试测。页面设置为不允许搜索引擎索引，但它并非访问控制；结束招募后应停止 Pages 部署或迁移到受控托管。
