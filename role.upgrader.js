/**
 * ⬆️ 升级者 — 专注升级 Room Controller
 *
 * 行为: 取能量 → 升级
 * 取能优先级: 地面掉落 > Container > Storage > Spawn > 直接挖
 */
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
                this.goHome(creep);
                return;
            }
            var err = creep.upgradeController(creep.room.controller);
            if (err === ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, {
                    visualizePathStyle: { stroke: '#00ff00' },
                    reusePath: 20,
                    range: 1
                });
            }
            return;
        }

        // 取能量
        this.getEnergy(creep);
    },

    getEnergy: function (creep) {
        // 1. 捡地上的能量
        var dropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
            filter: function (r) { return r.resourceType === RESOURCE_ENERGY && r.amount > 20; }
        });
        if (dropped) {
            if (creep.pickup(dropped) === ERR_NOT_IN_RANGE) {
                creep.moveTo(dropped, { visualizePathStyle: { stroke: '#ffaa00' } });
            }
            return;
        }

        // 2. Container / Storage
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

        // 3. Spawn/Extension 借
        var spawn = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: function (s) {
                return (s.structureType === STRUCTURE_SPAWN ||
                        s.structureType === STRUCTURE_EXTENSION) &&
                       s.store[RESOURCE_ENERGY] > 100;
            }
        });
        if (spawn) {
            if (creep.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(spawn, { visualizePathStyle: { stroke: '#ffaa00' } });
            }
            return;
        }

        // 4. 直接挖
        var source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
        if (source) {
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
            }
        } else if (creep.room.controller) {
            creep.moveTo(creep.room.controller.pos.x + 2, creep.room.controller.pos.y + 2);
        }
    },

    goHome: function (creep) {
        var homeRoom = creep.memory.homeRoom;
        if (!homeRoom) return;
        var exit = creep.pos.findClosestByPath(FIND_EXIT_TOP);
        if (exit) creep.moveTo(exit);
    }
};

module.exports = roleUpgrader;
