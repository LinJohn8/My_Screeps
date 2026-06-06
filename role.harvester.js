/**
 * 🏭 采集者 — 稳定能量供给（绑定固定能量源）
 *
 * 行为: 出生时分配固定能量源 → 只去那个源挖矿 → 送回基地
 * 不会因为其他源空出来就中途调头（根治反复横跳）
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

        // 采集能量（只去分配好的源）
        this.harvestEnergy(creep);
    },

    deliverEnergy: function (creep) {
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
        if (creep.room.controller && creep.room.controller.my) {
            if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, { visualizePathStyle: { stroke: '#aaaaaa' } });
            }
        }
    },

    harvestEnergy: function (creep) {
        // === 核心修复：只去分配好的源，死了这条心 ===
        var source = null;

        if (creep.memory.sourceId) {
            source = Game.getObjectById(creep.memory.sourceId);
        }

        // 如果没有分配 sourceId（旧 creep/兼容），自动分配一个
        if (!source) {
            source = this.autoAssignSource(creep);
            if (!source) {
                // 真没源了，在 Spawn 旁待机
                var spawn = creep.pos.findClosestByPath(FIND_MY_SPAWNS);
                if (spawn) creep.moveTo(spawn, { range: 3 });
                return;
            }
        }

        // 无论源有没有能量，都走过去等着（不换源）
        var err = creep.harvest(source);
        if (err === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 20 });
        } else if (err === ERR_NOT_ENOUGH_RESOURCES) {
            // 源在冷却 → 原地等待不动，不换目标
            // 什么也不做，省能量
        }
    },

    /**
     * 备用：如果没有 sourceId，选一个当前采集者最少的源
     * 只执行一次，之后就会记住
     */
    autoAssignSource: function (creep) {
        var sources = creep.room.find(FIND_SOURCES);
        if (sources.length === 0) return null;

        // 统计每个源当前的采集者数量
        var counts = {};
        for (var name in Game.creeps) {
            var c = Game.creeps[name];
            if (c.memory.role === 'harvester' && c.id !== creep.id && c.room.name === creep.room.name) {
                var sid = c.memory.sourceId;
                if (sid) counts[sid] = (counts[sid] || 0) + 1;
            }
        }

        // 选人最少的源
        var best = sources[0];
        var min = 99999;
        for (var i = 0; i < sources.length; i++) {
            var cnt = counts[sources[i].id] || 0;
            if (cnt < min) {
                min = cnt;
                best = sources[i];
            }
        }

        // 记住分配结果
        creep.memory.sourceId = best.id;
        return best;
    }
};

module.exports = roleHarvester;
