/**
 * 📊 房间统计系统
 *
 * 追踪每个房间的:
 *   - 能量收入/支出（每分钟）
 *   - 总存储量 / 最大容量
 *   - 各角色数量
 *   - 能量预算等级
 *
 * 接口:
 *   stats.update(room)        — 每 tick 调用，更新统计快照
 *   stats.getBudgetLevel(room) — 返回 'red' | 'yellow' | 'green' | 'surplus'
 *   stats.recordIncome(room, amount)  — 采集能量时调用
 *   stats.recordSpend(room, amount)   — 消耗能量时调用
 */
var stats = {

    // ================================================================
    //  每 tick 更新统计快照
    // ================================================================
    update: function (room) {
        if (!room.memory.stats) room.memory.stats = {};

        var s = room.memory.stats;
        s.tick = Game.time;

        // 1. 角色数量
        s.roleCounts = {};
        for (var name in Game.creeps) {
            var c = Game.creeps[name];
            if (c.room.name === room.name) {
                var r = c.memory.role || 'unknown';
                s.roleCounts[r] = (s.roleCounts[r] || 0) + 1;
            }
        }

        // 2. 能量存量 / 最大容量
        var stored = 0;
        var maxCap = 0;
        var structures = room.find(FIND_MY_STRUCTURES);

        for (var i = 0; i < structures.length; i++) {
            var st = structures[i];
            if (st.store) {
                stored += st.store[RESOURCE_ENERGY] || 0;
                if (st.store.getCapacity) {
                    maxCap += st.store.getCapacity(RESOURCE_ENERGY) || 0;
                }
            }
        }

        // 加上地上掉落的能量
        var dropped = room.find(FIND_DROPPED_RESOURCES, {
            filter: function (r) { return r.resourceType === RESOURCE_ENERGY; }
        });
        for (var di = 0; di < dropped.length; di++) {
            stored += dropped[di].amount;
        }

        s.energyStored = stored;
        s.energyCapacity = maxCap;

        // 3. 能量收入/支出（每分钟滑动平均）
        var income = s.incomeThisTick || 0;
        var spend = s.spendThisTick || 0;

        if (!s.incomeHistory) s.incomeHistory = [];
        if (!s.spendHistory) s.spendHistory = [];

        s.incomeHistory.push(income);
        s.spendHistory.push(spend);

        // 只保留最近 60 tick 的数据
        if (s.incomeHistory.length > 60) s.incomeHistory.shift();
        if (s.spendHistory.length > 60) s.spendHistory.shift();

        // 计算每分钟（60 tick）平均值
        s.incomePerMin = 0;
        for (var ii = 0; ii < s.incomeHistory.length; ii++) s.incomePerMin += s.incomeHistory[ii];
        s.spendPerMin = 0;
        for (var si = 0; si < s.spendHistory.length; si++) s.spendPerMin += s.spendHistory[si];

        // 重置本 tick 计数
        s.incomeThisTick = 0;
        s.spendThisTick = 0;

        // 4. RCL / 进度
        if (room.controller) {
            s.rcl = room.controller.level;
            s.rclProgress = room.controller.progress;
            s.rclProgressTotal = room.controller.progressTotal;
        }

        // 5. 建筑工地数
        var sites = room.find(FIND_CONSTRUCTION_SITES);
        s.constructionSites = sites.length;
    },

    // ================================================================
    //  获取能量预算等级
    //
    //  红线 (< 20%)   — 只允许紧急防御
    //  黄线 (20-50%)  — 允许正常孵化 + Tower
    //  绿线 (50-80%)  — 允许建造新建筑
    //  溢出 (> 80%)   — 允许进攻/进阶操作
    // ================================================================
    getBudgetLevel: function (room) {
        var s = room.memory.stats;
        if (!s || !s.energyCapacity || s.energyCapacity === 0) return 'yellow';

        var ratio = s.energyStored / s.energyCapacity;

        if (ratio < 0.2) return 'red';
        if (ratio < 0.5) return 'yellow';
        if (ratio < 0.8) return 'green';
        return 'surplus';
    },

    // ================================================================
    //  快捷判断：当前预算是否允许某类操作
    // ================================================================
    canAfford: function (room, category) {
        var level = this.getBudgetLevel(room);
        switch (category) {
            case 'emergency':   // 紧急防御（Soldier、Tower 开火）
                return true;    // 任何时候都允许
            case 'spawn':       // 普通孵化
                return level !== 'red';
            case 'towerRepair': // Tower 维修
                return level !== 'red';
            case 'build':       // 建造新建筑
                return level === 'green' || level === 'surplus';
            case 'offense':     // 进攻/进阶
                return level === 'surplus';
            default:
                return true;
        }
    },

    // ================================================================
    //  记录能量收入（由 harvester/miner 调用）
    // ================================================================
    recordIncome: function (room, amount) {
        if (!room.memory.stats) room.memory.stats = {};
        room.memory.stats.incomeThisTick = (room.memory.stats.incomeThisTick || 0) + amount;
    },

    // ================================================================
    //  记录能量支出（由 spawn/tower/建筑 调用）
    // ================================================================
    recordSpend: function (room, amount) {
        if (!room.memory.stats) room.memory.stats = {};
        room.memory.stats.spendThisTick = (room.memory.stats.spendThisTick || 0) + amount;
    }
};

module.exports = stats;
