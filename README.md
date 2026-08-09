# 洪流骑手 · 受邀 Pilot

这是用于真人试测的静态部署包，只包含模拟器运行所需的浏览器代码和美术资产，不包含研究设计文档、恢复模型、分析结果或参与者数据。

- 默认入口为当前 U 候选：12 家店 × 每店 6 组，共 72 trial。
- 当前候选 build 为 `pomdp-k-u-unified-candidate-v1.1-attention-pressure`；正式消息分配为 36 次无消息、18 次普通消息、18 次催促消息。
- 首页会生成临时 participant ID 和 seed，并把它们保留在网址和下载日志中。
- 研究者也可以通过查询参数指定 `mode`、`pid` 和 `seed`。
- 根链接默认带入 `mode=experiment&mechanism=k-u-unified-v1`；研究者仍可通过查询参数切换到 24-trial 仪器检查模式。
- 完成后由参与者主动下载 JSON；站点不会自动上传或集中收集数据。

测试入口：https://troyfeng-designintelligence.github.io/30-minute-contract/

该入口仅用于投稿前受邀试测。页面设置为不允许搜索引擎索引，但它并非访问控制；结束招募后应停止 Pages 部署或迁移到受控托管。
