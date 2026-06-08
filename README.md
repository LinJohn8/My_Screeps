# Screeps 自动化 AI

这是一个按阶段发展的 Screeps 自动化项目。现在已经从单文件脚本整理成分层架构，后续可以继续扩展角色、策略、算法和建筑规划。

## 目录结构

```text
main.js                主循环入口，只负责编排
roles/                 creep 角色行为
managers/              房间、孵化、creep、内存管理器
strategies/            发展阶段和人口策略
algorithms/            通用算法，例如身体生成
planners/              建筑规划
utils/                 移动、道路、防御、统计工具
structures/            建筑 AI，例如 Tower
ARCHITECTURE.md        更详细的架构说明
```

## 当前能力

- 自动判断发展阶段。
- 动态人口规划，不再固定 6 个单位。
- 自动孵化采集、升级、建造、维修、防御、侦察、远程采矿单位。
- 统一移动算法，包含卡住检测、让路、重新寻路、不可达标记。
- 关键路径路障检测，自动标记可拆墙并派有 `WORK` 的 creep 去拆。
- 自动道路规划、防御工事规划、基础 Extension/Storage 规划。
- Tower 自动攻击、治疗、维修。
- 侦察房间并记录安全远程矿点。

## 发展阶段

- `bootstrap`：开局求生和基础升级。
- `settle`：补扩展、道路、容器和侦察。
- `infrastructure`：Tower、维修、Storage、远程采矿。
- `economy`：稳定远程收入和防御维护。
- `advanced`：高 RCL、扩张和高级物流预留。

## 主要入口

- 修改人口数量和优先级：`strategies/population.js`
- 修改阶段目标：`strategies/development.js`
- 修改身体部件：`algorithms/body.js`
- 新增角色：`roles/` 和 `roles/registry.js`
- 修改移动/卡位/路障算法：`utils/movement.js`、`utils/defense.js`
- 修改建筑规划：`planners/base.js`

## 注意

当前代码使用真实文件夹和相对路径 `require`。如果你使用的 Screeps 上传工具不支持目录，需要在上传配置里保留目录路径，或者把模块打包后上传。
