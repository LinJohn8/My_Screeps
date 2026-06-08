/**
 * ⛏️ 远程矿工 — 去其他房间挖矿带回家
 *
 * 行为:
 *   1. 出生后走向目标房间
 *   2. 到达后挖矿，满了回家
 *   3. 回家送到 Spawn/Extension/Tower
 *   4. 送完回去继续挖
 *   5. 遇到敌人 → 撤退回家
 */
var roleRemoteMiner = {

    run: function (creep) {

        // 被攻击 → 撤退
        if (creep.memory.lastHits && creep.hits < creep.memory.lastHits) {
            creep.memory.retreat = true;
            console.log('🏃 [远程矿工] ' + creep.name + ' 被攻击，撤退');
        }
        creep.memory.lastHits = creep.hits;

        // 撤退状态
        if (creep.memory.retreat) {
            creep.memory.status = '撤退';
            this._goHome(creep);
            if (creep.room.name === creep.memory.homeRoom) {
                creep.memory.retreat = false;
            }
            return;
        }

        // 状态切换
        if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.working = false;
        }
        if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
            creep.memory.working = true;
        }

        // 送货
        if (creep.memory.working) {
            if (creep.room.name === creep.memory.homeRoom) {
                creep.memory.status = '送能';
                this._deliver(creep);
            } else {
                creep.memory.status = '回家';
                this._goHome(creep);
            }
            return;
        }

        // 挖矿
        var targetRoom = creep.memory.targetRoom;
        if (!targetRoom) {
            this._goHome(creep);
            return;
        }

        if (creep.room.name !== targetRoom) {
            creep.memory.status = '前往远程';
            this._moveToward(creep, targetRoom);
            return;
        }

        // 在目标房间 → 挖矿
        creep.memory.status = '远程采集';
        if (!creep.memory.sourceId) {
            var sources = creep.room.find(FIND_SOURCES);
            if (sources.length > 0) {
                creep.memory.sourceId = sources[0].id;
            } else {
                this._goHome(creep);
                return;
            }
        }

        var source = Game.getObjectById(creep.memory.sourceId);
        if (!source) {
            creep.memory.sourceId = null;
            return;
        }

        var err = creep.harvest(source);
        if (err === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, { visualizePathStyle: { stroke: '#ff8800' }, reusePath: 20 });
        }
    },

    _deliver: function (creep) {
        var target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: function (s) {
                return (s.structureType === STRUCTURE_SPAWN ||
                        s.structureType === STRUCTURE_EXTENSION ||
                        s.structureType === STRUCTURE_TOWER ||
                        s.structureType === STRUCTURE_STORAGE) &&
                       s.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
            }
        });

        if (target) {
            var err = creep.transfer(target, RESOURCE_ENERGY);
            if (err === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' }, reusePath: 20 });
            }
        }
    },

    _goHome: function (creep) {
        var home = creep.memory.homeRoom;
        if (creep.room.name === home) return;
        this._moveToward(creep, home);
    },

    _moveToward: function (creep, targetRoom) {
        creep.moveTo(new RoomPosition(25, 25, targetRoom), {
            visualizePathStyle: { stroke: '#ff8800' },
            reusePath: 50,
            maxRooms: 10
        });
    }
};

module.exports = roleRemoteMiner;
