# 架构说明

这个项目现在按照真实文件夹拆分，不再把所有模块堆在根目录。

## 主循环

`main.js` 只负责调度，不再写具体业务逻辑：

1. `managers/memory.js`：初始化全局内存，清理死亡 creep。
2. `managers/room.js`：管理房间统计、阶段、防御、道路、建筑规划、探索、路障任务。
3. `managers/spawn.js`：根据人口策略自动孵化缺失角色。
4. `managers/creep.js`：先执行拆墙任务，再运行角色逻辑，并处理转换、身体检查、状态汇报。

## 目录职责

- `roles/`：各类 creep 的具体行为。
- `managers/`：每 tick 的高层管理器。
- `strategies/`：发展阶段、人口目标、远程房间选择等策略。
- `algorithms/`：可复用算法，目前包含身体部件生成。
- `planners/`：建筑布局和施工规划。
- `utils/`：移动、道路、统计、防御等底层工具。
- `structures/`：建筑 AI，目前包含 Tower 控制。

## 发展阶段

发展阶段由 `strategies/development.js` 判断，并存到 `room.memory.strategy.stage`。

- `bootstrap`：开局求生，保证采集者、填充 Spawn/Extension、升级到 RCL2。
- `settle`：建设 Extension、道路、Container，开始侦察邻居房。
- `infrastructure`：补 Tower、Repairer、Storage 规划，启动第一批远程采矿。
- `economy`：稳定远程收入，维护城墙和 Rampart，准备更高级物流。
- `advanced`：高 RCL 升级、防御强化、扩张/预定房间预留接口。

## 人口增长

人口目标由 `strategies/population.js` 动态计算，不再固定 6 个单位。

- 开局通常维持 6-8 个基础单位。
- RCL2/RCL3 后会增加 Builder、Repairer、Scout。
- 有安全远程矿点后会增加 RemoteMiner。
- 有工地、路障、维修压力时会动态提高对应角色数量。
- 房间进入经济阶段后，人口通常可以到 10-14 个以上。

当前目标会写入 `room.memory.population.targets`，控制台每 30 tick 会输出当前目标和实际人数。

## 新增角色流程

比如要新增 `hauler`：

1. 新建 `roles/hauler.js`。
2. 在 `roles/registry.js` 注册角色和身体需求。
3. 在 `algorithms/body.js` 添加身体生成规则。
4. 在 `strategies/population.js` 添加目标数量和优先级。
5. 如果需要特殊出生内存，在 `managers/spawn.js` 的 `initialMemory` 里补充。

## 后续建议

下一步最值得补的是物流分工：

- `miner`：固定站在 source 旁边挖矿。
- `hauler`：专门搬运 Container/Storage/Spawn/Tower 能量。
- `reserver`：预定远程房间控制器。
- `claimer`：GCL 允许后开第二房。
- `labTech`：中后期实验室和矿物物流。
