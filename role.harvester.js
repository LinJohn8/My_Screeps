/**
 * 🏭 采集者 — 承诺制智能选源（根治空等 + 来回拉扯）
 *
 * 核心设计 —「承诺 + 物理槽位」双重约束:
 *
 *   物理槽位: 每个源旁边能站几个人（非墙壁的相邻格数）
 *   承诺计数: 所有把 sourceId 设成该源的采集者，包括:
 *     - 正在挖的
 *     - 正在去路上的
 *     - 装满去送、但会回来的
 *
 * 选源规则:
 *   承诺已满 → 跳过（即使物理上有空位，因为那人会回来）
 *   承诺未满 → 按 承诺数×100 + 距离×5 + 随机 评分，选最低的
 *
 * 效果:
 *   A 有 3 个槽位，3 人在采，1 人装满去送货
 *   第 4 人看到承诺已满 → 安心去 B，不来回拉扯
 */
var roleHarvester = {

    run: function (creep) {

        // 状态切换
        if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.working = false;
        }
        if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
            creep.memory.working = true;
        }

        // 运送能量
        if (creep.memory.working) {
            this.deliverEnergy(creep);
            return;
        }

        // 采集能量
        this.harvestEnergy(creep);
    },

    deliverEnergy: function (creep) {
        creep.memory.status = '送能';
        var target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: function (s) {
                return (s.structureType === STRUCTURE_SPAWN ||
                        s.structureType === STRUCTURE_EXTENSION ||
                        s.structureType === STRUCTURE_TOWER ||
                        s.structureType === STRUCTURE_STORAGE) &&
                       s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
                       s.isActive();
            }
        });

        if (target) {
            var err = creep.transfer(target, RESOURCE_ENERGY);
            if (err === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' }, reusePath: 20 });
            } else if (err !== OK && err !== ERR_FULL) {
                creep.memory.working = false;
            }
            return;
        }

        // 没有建筑需要能量 → 去升级控制器（不闲着）
        creep.memory.status = '溢出升级';
        if (creep.room.controller && creep.room.controller.my) {
            if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, { visualizePathStyle: { stroke: '#aaaaaa' } });
            }
        }
    },

    // ================================================================
    //  智能采集 — 承诺制动态选源
    // ================================================================
    harvestEnergy: function (creep) {

        // ---- 已有承诺的源还有能量 → 继续采，不中途换 ----
        if (creep.memory.sourceId) {
            var currentSource = Game.getObjectById(creep.memory.sourceId);
            if (currentSource && currentSource.energy > 0) {
                creep.memory.status = '采集';
                this._harvestSource(creep, currentSource);
                return;
            }
            // 源空了 → 等 3 tick 再评估（源马上刷新，避免空跑）
            if (!creep.memory.switchCooldown) {
                creep.memory.status = '等待刷新';
                creep.memory.switchCooldown = Game.time + 3;
                return;
            }
            if (Game.time < creep.memory.switchCooldown) {
                creep.memory.status = '等待刷新';
                return;
            }
            // 冷却到了 → 清除旧承诺，重新选源
            creep.memory.sourceId = undefined;
        }

        // ---- 重新选源 ----
        var bestSource = this._pickBestSource(creep);
        if (!bestSource) {
            creep.memory.status = '等待刷新';
            // 所有源都没能量 → 去最近的那个旁边等
            var nearest = creep.pos.findClosestByPath(FIND_SOURCES);
            if (nearest && creep.pos.getRangeTo(nearest) > 1) {
                creep.moveTo(nearest, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 20 });
            }
            return;
        }

        // 做出承诺
        creep.memory.sourceId = bestSource.id;
        creep.memory.switchCooldown = undefined;

        this._harvestSource(creep, bestSource);
    },

    // ================================================================
    //  选源算法（承诺制）
    //
    //  1. 所有采集者的 sourceId = 承诺（含运送中的）
    //  2. 每个源有物理槽位上限，承诺已满的跳过
    //  3. 未满的按评分选最低:
    //       score = 承诺数×100 + 距离×5 + 随机偏移
    // ================================================================
    _pickBestSource: function (creep) {
        var room = creep.room;
        var sources = room.find(FIND_SOURCES);
        if (sources.length === 0) return null;

        // ---- 缓存物理槽位（存 room.memory，不变就不重算） ----
        if (!room.memory.sourceSlots) {
            room.memory.sourceSlots = {};
        }
        for (var si = 0; si < sources.length; si++) {
            var sid = sources[si].id;
            if (room.memory.sourceSlots[sid] === undefined) {
                room.memory.sourceSlots[sid] = this._countSlots(room, sources[si]);
            }
        }

        // ---- 统计每个源的承诺数（所有把 sourceId 设成该源的人） ----
        var committed = {};
        for (var name in Game.creeps) {
            var c = Game.creeps[name];
            if (c.memory.role === 'harvester' && c.memory.sourceId && c.id !== creep.id) {
                committed[c.memory.sourceId] = (committed[c.memory.sourceId] || 0) + 1;
            }
        }

        // ---- 评分选源 ----
        var bestSource = null;
        var bestScore = 999999;
        var randomOffset = Math.random() * 20;

        for (var i = 0; i < sources.length; i++) {
            var src = sources[i];
            if (src.energy === 0) continue;

            var commitCount = committed[src.id] || 0;
            var maxSlots = room.memory.sourceSlots[src.id] || 3;

            // ★ 关键: 承诺已满 → 跳过（即使物理上有空位，因为那人会回来）
            if (commitCount >= maxSlots) continue;

            var dist = creep.pos.getRangeTo(src);
            var score = commitCount * 100 + dist * 5 + randomOffset;

            if (score < bestScore) {
                bestScore = score;
                bestSource = src;
            }
        }

        return bestSource;
    },

    // ================================================================
    //  计算一个源周围可站人的格数（物理槽位）
    // ================================================================
    _countSlots: function (room, source) {
        var count = 0;
        for (var dx = -1; dx <= 1; dx++) {
            for (var dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                var x = source.pos.x + dx;
                var y = source.pos.y + dy;
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;

                var terrain = room.getTerrain().get(x, y);
                if (terrain === TERRAIN_MASK_WALL) continue;

                count++;
            }
        }
        return count;
    },

    // ================================================================
    //  执行采集
    // ================================================================
    _harvestSource: function (creep, source) {
        var err = creep.harvest(source);
        if (err === ERR_NOT_IN_RANGE) {
            creep.memory.status = '前往源';
            creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 20 });
        } else if (err === OK) {
            creep.memory.status = '采集';
        }
    }
};

module.exports = roleHarvester;
