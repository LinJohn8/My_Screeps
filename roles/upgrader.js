/**
 * ⬆️ 升级者 — 专注升级 Room Controller
 *
 * 行为: 取能量 → 升级
 * 取能优先级: 地面掉落 > Container > Storage > Spawn > 直接挖
 */
var movement = require('../utils/movement');

var roleUpgrader = {

    run: function (creep) {

        // 状态切换
        if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.working = false;
        }
        if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
            creep.memory.working = true;
        }

        // 升级
        if (creep.memory.working) {
            if (!creep.room.controller || !creep.room.controller.my) {
                creep.memory.status = '回家';
                this.goHome(creep);
                return;
            }
            var err = creep.upgradeController(creep.room.controller);
            if (err === ERR_NOT_IN_RANGE) {
                creep.memory.status = '前往控制器';
                movement.moveTo(creep, creep.room.controller, {
                    visualizePathStyle: { stroke: '#00ff00' },
                    reusePath: 20,
                    range: 3,
                    reason: 'upgrade'
                });
            } else {
                creep.memory.status = '升级';
            }
            return;
        }

        // 取能量
        creep.memory.status = '取能';
        this.getEnergy(creep);
    },

    getEnergy: function (creep) {
        // 1. 捡地上的能量
        var dropped = movement.closestByPathOrRange(creep, FIND_DROPPED_RESOURCES, {
            filter: function (r) { return r.resourceType === RESOURCE_ENERGY && r.amount > 20; }
        });
        if (dropped) {
            if (creep.pickup(dropped) === ERR_NOT_IN_RANGE) {
                creep.memory.status = '前往掉落的能量';
                movement.moveTo(creep, dropped, {
                    visualizePathStyle: { stroke: '#ffaa00' },
                    reason: 'upgrader-pickup'
                });
            } else {
                creep.memory.status = '捡能';
            }
            return;
        }

        // 2. Container / Storage
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
                    reason: 'upgrader-withdraw'
                });
            }
            return;
        }

        // 3. Spawn/Extension 借
        var spawn = movement.closestByPathOrRange(creep, FIND_STRUCTURES, {
            filter: function (s) {
                return (s.structureType === STRUCTURE_SPAWN ||
                        s.structureType === STRUCTURE_EXTENSION) &&
                       s.store[RESOURCE_ENERGY] > 100;
            }
        });
        if (spawn) {
            if (creep.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                movement.moveTo(creep, spawn, {
                    visualizePathStyle: { stroke: '#ffaa00' },
                    reason: 'upgrader-borrow'
                });
            }
            return;
        }

        // 4. 直接挖
        var source = movement.closestByPathOrRange(creep, FIND_SOURCES_ACTIVE);
        if (source) {
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                movement.moveTo(creep, source, {
                    visualizePathStyle: { stroke: '#ffaa00' },
                    reason: 'upgrader-harvest'
                });
            }
        } else if (creep.room.controller) {
            var px = Math.max(1, Math.min(48, creep.room.controller.pos.x + 2));
            var py = Math.max(1, Math.min(48, creep.room.controller.pos.y + 2));
            movement.moveTo(creep, new RoomPosition(px, py, creep.room.name), {
                visualizePathStyle: { stroke: '#ffaa00' },
                range: 0,
                reason: 'upgrader-wait'
            });
        }
    },

    goHome: function (creep) {
        var homeRoom = creep.memory.homeRoom;
        if (!homeRoom) return;
        movement.moveToRoom(creep, homeRoom, {
            visualizePathStyle: { stroke: '#00ff00' },
            reason: 'upgrader-home'
        });
    }
};

module.exports = roleUpgrader;
