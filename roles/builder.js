/**
 * 🔨 建造者 — 建造 / 修复 / 升级
 *
 * 优先级: 建造工地 > 修复建筑 > 升级控制器
 * 取能: 地面掉落 > Container > Storage > 直接挖
 */
var movement = require('../utils/movement');

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
        // ★ 0. 优先拆墙 — 路不通什么事都做不了
        // 先检查有没有被指派拆除的目标
        if (creep.memory.dismantleTarget) {
            var targetPos = creep.memory.dismantleTarget.pos;
            var targetStruct = creep.room.lookForAt(LOOK_STRUCTURES, targetPos.x, targetPos.y);
            var found = false;
            for (var dti = 0; dti < targetStruct.length; dti++) {
                if (targetStruct[dti].structureType === STRUCTURE_WALL) {
                    creep.memory.status = '拆墙(指派)';
                    var err = creep.dismantle(targetStruct[dti]);
                    if (err === ERR_NOT_IN_RANGE) {
                        movement.moveTo(creep, targetStruct[dti], {
                            visualizePathStyle: { stroke: '#ff0000' },
                            reusePath: 5,
                            reason: 'builder-dismantle'
                        });
                    }
                    found = true;
                    break;
                }
            }
            if (!found) {
                // 墙已经没了 → 清除指派
                creep.memory.dismantleTarget = null;
            } else {
                return;
            }
        }

        // 再检查有没有堵路的墙
        var roomDefense = require('../utils/defense');
        var blockingWalls = roomDefense.findWallsOnCriticalPaths(creep.room);
        if (blockingWalls.length > 0) {
            var targetWall = movement.closestByPathOrRange(creep, blockingWalls);
            if (targetWall) {
                creep.memory.status = '拆墙';
                if (targetWall.progressTotal !== undefined && targetWall.remove) {
                    targetWall.remove();
                } else if (targetWall.structureType) {
                    var err = creep.dismantle(targetWall);
                    if (err === ERR_NOT_IN_RANGE) {
                        movement.moveTo(creep, targetWall, {
                            visualizePathStyle: { stroke: '#ff0000' },
                            reusePath: 5,
                            reason: 'critical-dismantle'
                        });
                    }
                }
                return;
            }
        }

        // 1. 建造
        var sites = creep.room.find(FIND_CONSTRUCTION_SITES);
        if (sites.length > 0) {
            var target = movement.closestByPathOrRange(creep, sites);
            if (target) {
                creep.memory.status = '建造';
                var err = creep.build(target);
                if (err === ERR_NOT_IN_RANGE) {
                    creep.memory.status = '前往工地';
                    movement.moveTo(creep, target, {
                        visualizePathStyle: { stroke: '#0000ff' },
                        reusePath: 20,
                        range: 3,
                        reason: 'build'
                    });
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
                movement.moveTo(creep, damaged[0], {
                    visualizePathStyle: { stroke: '#00ffff' },
                    range: 3,
                    reason: 'builder-repair'
                });
            }
            return;
        }

        // 3. 升级
        creep.memory.status = '溢出升级';
        if (creep.room.controller && creep.room.controller.my) {
            if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                movement.moveTo(creep, creep.room.controller, {
                    visualizePathStyle: { stroke: '#00ff00' },
                    range: 3,
                    reason: 'builder-upgrade'
                });
            }
        }
    },

    getEnergy: function (creep) {
        // 1. 捡掉落
        var dropped = movement.closestByPathOrRange(creep, FIND_DROPPED_RESOURCES, {
            filter: function (r) { return r.resourceType === RESOURCE_ENERGY && r.amount > 20; }
        });
        if (dropped) {
            if (creep.pickup(dropped) === ERR_NOT_IN_RANGE) {
                movement.moveTo(creep, dropped, {
                    visualizePathStyle: { stroke: '#ffaa00' },
                    reason: 'builder-pickup'
                });
            }
            return;
        }

        // 2. Container/Storage
        var container = movement.closestByPathOrRange(creep, FIND_STRUCTURES, {
            filter: function (s) {
                return (s.structureType === STRUCTURE_CONTAINER ||
                        s.structureType === STRUCTURE_STORAGE) &&
                       s.store[RESOURCE_ENERGY] > 50;
            }
        });
        if (container) {
            if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                movement.moveTo(creep, container, {
                    visualizePathStyle: { stroke: '#ffaa00' },
                    reason: 'builder-withdraw'
                });
            }
            return;
        }

        // 3. 直接挖
        var source = movement.closestByPathOrRange(creep, FIND_SOURCES_ACTIVE);
        if (source) {
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                movement.moveTo(creep, source, {
                    visualizePathStyle: { stroke: '#ffaa00' },
                    reason: 'builder-harvest'
                });
            }
        } else if (creep.room.controller) {
            var px = Math.max(1, Math.min(48, creep.room.controller.pos.x + 1));
            var py = Math.max(1, Math.min(48, creep.room.controller.pos.y + 1));
            movement.moveTo(creep, new RoomPosition(px, py, creep.room.name), {
                visualizePathStyle: { stroke: '#ffaa00' },
                range: 0,
                reason: 'builder-wait'
            });
        }
    }
};

module.exports = roleBuilder;
