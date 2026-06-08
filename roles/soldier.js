/**
 * ⚔️ 士兵 — 基地防御 / 进攻
 *
 * 行为模式:
 *   - 防御: 房间有入侵者 → 攻击最近的敌人
 *   - 空闲: 在 Spawn 周围巡逻
 */
var movement = require('../utils/movement');

var roleSoldier = {

    run: function (creep) {

        var homeRoom = creep.memory.homeRoom;
        var room = creep.room;

        // 1. 攻击当前房间的敌人
        var hostiles = room.find(FIND_HOSTILE_CREEPS);
        if (hostiles.length > 0) {
            var target = movement.closestByPathOrRange(creep, hostiles);
            if (target) {
                creep.memory.status = '攻击';
                this.attackTarget(creep, target);
                return;
            }
        }

        // 2. 攻击敌方建筑
        var enemyStructures = room.find(FIND_HOSTILE_STRUCTURES);
        if (enemyStructures.length > 0) {
            var priority = _.filter(enemyStructures, function (s) {
                return s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_TOWER;
            });
            var target = priority.length > 0
                ? movement.closestByPathOrRange(creep, priority)
                : movement.closestByPathOrRange(creep, enemyStructures);
            if (target) {
                creep.memory.status = '拆建筑';
                this.attackTarget(creep, target);
                return;
            }
        }

        // 3. 在家没敌人 → Spawn 附近待命
        if (room.name === homeRoom) {
            creep.memory.status = '待命';
            var spawn = room.find(FIND_MY_SPAWNS)[0];
            if (spawn) {
                var dist = creep.pos.getRangeTo(spawn);
                if (dist > 5) {
                    movement.moveTo(creep, spawn, {
                        visualizePathStyle: { stroke: '#ff0000' },
                        range: 3,
                        reason: 'soldier-rally'
                    });
                }
            }
        } else {
            creep.memory.status = '回家';
            movement.moveToRoom(creep, homeRoom, {
                visualizePathStyle: { stroke: '#ff0000' },
                allowHostileRooms: true,
                reason: 'soldier-home'
            });
        }
    },

    attackTarget: function (creep, target) {
        var hasAttack = creep.getActiveBodyparts(ATTACK) > 0;
        var hasRanged = creep.getActiveBodyparts(RANGED_ATTACK) > 0;
        var hasWork = creep.getActiveBodyparts(WORK) > 0;

        if (target.structureType) {
            var err = hasAttack ? creep.attack(target) : ERR_NO_BODYPART;
            if (err === ERR_NOT_IN_RANGE) {
                movement.moveTo(creep, target, {
                    visualizePathStyle: { stroke: '#ff3333' },
                    allowHostileRooms: true,
                    reason: 'soldier-attack-structure'
                });
            } else if (err !== OK && hasWork) {
                var dErr = creep.dismantle(target);
                if (dErr === ERR_NOT_IN_RANGE) {
                    movement.moveTo(creep, target, {
                        visualizePathStyle: { stroke: '#ff3333' },
                        allowHostileRooms: true,
                        reason: 'soldier-dismantle'
                    });
                }
            } else if (err !== OK && hasRanged) {
                var rErr1 = creep.rangedAttack(target);
                if (rErr1 === ERR_NOT_IN_RANGE) {
                    movement.moveTo(creep, target, {
                        visualizePathStyle: { stroke: '#ff3333' },
                        range: 3,
                        allowHostileRooms: true,
                        reason: 'soldier-ranged-structure'
                    });
                }
            }
        } else if (target.hits) {
            var attackErr = hasAttack ? creep.attack(target) : ERR_NO_BODYPART;
            if (attackErr === ERR_NOT_IN_RANGE && hasRanged) {
                var rErr = creep.rangedAttack(target);
                if (rErr === ERR_NOT_IN_RANGE) {
                    movement.moveTo(creep, target, {
                        visualizePathStyle: { stroke: '#ff3333' },
                        range: 3,
                        allowHostileRooms: true,
                        reason: 'soldier-ranged'
                    });
                }
            } else if (attackErr === ERR_NOT_IN_RANGE) {
                movement.moveTo(creep, target, {
                    visualizePathStyle: { stroke: '#ff3333' },
                    allowHostileRooms: true,
                    reason: 'soldier-attack'
                });
            } else if (attackErr === ERR_NO_BODYPART && hasRanged) {
                var rErr = creep.rangedAttack(target);
                if (rErr === ERR_NOT_IN_RANGE) {
                    movement.moveTo(creep, target, {
                        visualizePathStyle: { stroke: '#ff3333' },
                        range: 3,
                        allowHostileRooms: true,
                        reason: 'soldier-ranged'
                    });
                }
            }
        }
    }
};

module.exports = roleSoldier;
