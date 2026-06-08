/**
 * 🔨 建造者 — 建造 / 修复 / 升级
 *
 * 优先级: 建造工地 > 修复建筑 > 升级控制器
 * 取能: 地面掉落 > Container > Storage > 直接挖
 */
var roleBuilder = {

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
            this.work(creep);
            return;
        }

        // 取能量
        this.getEnergy(creep);
    },

    work: function (creep) {
        // 1. 建造
        var sites = creep.room.find(FIND_CONSTRUCTION_SITES);
        if (sites.length > 0) {
            var target = creep.pos.findClosestByPath(sites);
            if (target) {
                creep.memory.status = '建造';
                var err = creep.build(target);
                if (err === ERR_NOT_IN_RANGE) {
                    creep.memory.status = '前往工地';
                    creep.moveTo(target, { visualizePathStyle: { stroke: '#0000ff' }, reusePath: 20 });
                } else if (err === ERR_INVALID_TARGET) {
                    creep.memory.working = false;
                }
                return;
            }
        }

        // 2. 修复
        var damaged = creep.room.find(FIND_STRUCTURES, {
            filter: function (s) {
                return s.hits < s.hitsMax * 0.6 &&
                       s.structureType !== STRUCTURE_WALL &&
                       s.structureType !== STRUCTURE_RAMPART;
            }
        });
        if (damaged.length > 0) {
            creep.memory.status = '维修';
            damaged.sort(function (a, b) {
                return (a.hits / a.hitsMax) - (b.hits / b.hitsMax);
            });
            var err = creep.repair(damaged[0]);
            if (err === ERR_NOT_IN_RANGE) {
                creep.memory.status = '前往维修';
                creep.moveTo(damaged[0], { visualizePathStyle: { stroke: '#00ffff' } });
            }
            return;
        }

        // 3. 拆墙（堵在关键路线上的墙）
        var roomDefense = require('utils.defense');
        var blockingWalls = roomDefense.findWallsOnCriticalPaths(creep.room);
        if (blockingWalls.length > 0) {
            var targetWall = creep.pos.findClosestByPath(blockingWalls);
            if (targetWall) {
                creep.memory.status = '拆墙';
                if (targetWall.structureType) {
                    // 已建成的墙 → dismantle
                    var err = creep.dismantle(targetWall);
                    if (err === ERR_NOT_IN_RANGE) {
                        creep.moveTo(targetWall, { visualizePathStyle: { stroke: '#ff0000' } });
                    }
                } else {
                    // 墙的工地 → remove
                    targetWall.remove();
                }
                return;
            }
        }

        // 4. 升级
        creep.memory.status = '溢出升级';
        if (creep.room.controller && creep.room.controller.my) {
            if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, { visualizePathStyle: { stroke: '#00ff00' } });
            }
        }
    },

    getEnergy: function (creep) {
        // 1. 捡掉落
        var dropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
            filter: function (r) { return r.resourceType === RESOURCE_ENERGY && r.amount > 20; }
        });
        if (dropped) {
            if (creep.pickup(dropped) === ERR_NOT_IN_RANGE) {
                creep.moveTo(dropped, { visualizePathStyle: { stroke: '#ffaa00' } });
            }
            return;
        }

        // 2. Container/Storage
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

        // 3. 直接挖
        var source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
        if (source) {
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
            }
        } else if (creep.room.controller) {
            creep.moveTo(creep.room.controller.pos.x + 1, creep.room.controller.pos.y + 1);
        }
    }
};

module.exports = roleBuilder;
