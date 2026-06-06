/**
 * 🔧 维修者 — 专职维护建筑耐久度
 *
 * 修复优先级（自动按受损比例排序）:
 *   受损建筑 > 道路 > 城墙/Rampart（到阈值）
 * RCL 越高，城墙修得越多
 */
var roleRepairer = {

    run: function (creep) {

        // 状态切换
        if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.working = false;
        }
        if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
            creep.memory.working = true;
        }

        // 工作
        if (creep.memory.working) {
            this.repairStuff(creep);
            return;
        }

        // 取能量
        this.getEnergy(creep);
    },

    repairStuff: function (creep) {
        var target = this.findTarget(creep);
        if (target) {
            var err = creep.repair(target);
            if (err === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffff00' }, reusePath: 20 });
            } else if (err !== OK) {
                creep.memory.repairTargetId = null;
            }
            return;
        }

        // 没有要修的 → 去升级
        if (creep.room.controller && creep.room.controller.my) {
            if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, { visualizePathStyle: { stroke: '#00ff00' } });
            }
        }
    },

    findTarget: function (creep) {
        if (creep.memory.repairTargetId) {
            var cached = Game.getObjectById(creep.memory.repairTargetId);
            if (cached && cached.hits < cached.hitsMax) {
                return cached;
            }
            creep.memory.repairTargetId = null;
        }

        var room = creep.room;
        var rcl = room.controller ? room.controller.level : 1;
        var needsRepair = [];
        var structures = room.find(FIND_STRUCTURES);

        for (var i = 0; i < structures.length; i++) {
            var s = structures[i];
            if (s.hits >= s.hitsMax) continue;

            var ratio = s.hits / s.hitsMax;
            var priority = ratio;

            switch (s.structureType) {
                case STRUCTURE_TOWER:
                case STRUCTURE_SPAWN:
                case STRUCTURE_STORAGE:
                    priority *= 0.3;
                    break;
                case STRUCTURE_EXTENSION:
                    priority *= 0.5;
                    break;
                case STRUCTURE_CONTAINER:
                    priority *= 0.7;
                    break;
                case STRUCTURE_ROAD:
                    if (ratio > 0.5) continue;
                    priority *= 1.0;
                    break;
                case STRUCTURE_WALL:
                case STRUCTURE_RAMPART:
                    var maxHits = rcl * 10000;
                    if (s.hits >= maxHits) continue;
                    priority = 1 - (s.hits / maxHits);
                    priority *= 2.0;
                    break;
                default:
                    continue;
            }

            needsRepair.push({ structure: s, priority: priority });
        }

        if (needsRepair.length === 0) return null;

        needsRepair.sort(function (a, b) { return a.priority - b.priority; });

        var best = needsRepair[0].structure;
        creep.memory.repairTargetId = best.id;
        return best;
    },

    getEnergy: function (creep) {
        var dropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
            filter: function (r) { return r.resourceType === RESOURCE_ENERGY && r.amount > 20; }
        });
        if (dropped) {
            if (creep.pickup(dropped) === ERR_NOT_IN_RANGE) {
                creep.moveTo(dropped, { visualizePathStyle: { stroke: '#ffaa00' } });
            }
            return;
        }

        var container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: function (s) {
                return (s.structureType === STRUCTURE_CONTAINER ||
                        s.structureType === STRUCTURE_STORAGE) &&
                       s.store[RESOURCE_ENERGY] > 50;
            }
        });
        if (container) {
            if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(container, { visualizePathStyle: { stroke: '#ffaa00' } });
            }
            return;
        }

        var source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
        if (source) {
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
            }
        } else if (creep.room.controller) {
            creep.moveTo(creep.room.controller.pos.x + 3, creep.room.controller.pos.y + 3);
        }
    }
};

module.exports = roleRepairer;
