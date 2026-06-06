/**
 * ⚔️ 士兵 — 基地防御 / 进攻
 *
 * 行为模式:
 *   - 防御: 房间有入侵者 → 攻击最近的敌人
 *   - 空闲: 在 Spawn 周围巡逻
 */
var roleSoldier = {

    run: function (creep) {

        var homeRoom = creep.memory.homeRoom;
        var room = creep.room;

        // 1. 攻击当前房间的敌人
        var hostiles = room.find(FIND_HOSTILE_CREEPS);
        if (hostiles.length > 0) {
            var target = creep.pos.findClosestByPath(hostiles);
            if (target) {
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
                ? creep.pos.findClosestByPath(priority)
                : creep.pos.findClosestByPath(enemyStructures);
            if (target) {
                this.attackTarget(creep, target);
                return;
            }
        }

        // 3. 在家没敌人 → Spawn 附近待命
        if (room.name === homeRoom) {
            var spawn = room.find(FIND_MY_SPAWNS)[0];
            if (spawn) {
                var dist = creep.pos.getRangeTo(spawn);
                if (dist > 5) {
                    creep.moveTo(spawn, { visualizePathStyle: { stroke: '#ff0000' }, range: 3 });
                }
            }
        } else {
            // 不在家，回家
            var homeSpawn = Game.spawns[Object.keys(Game.spawns)[0]];
            if (homeSpawn) {
                creep.moveTo(homeSpawn, { visualizePathStyle: { stroke: '#ff0000' } });
            }
        }
    },

    attackTarget: function (creep, target) {
        if (target.structureType) {
            var err = creep.attack(target);
            if (err === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ff3333' } });
            } else if (err !== OK) {
                var dErr = creep.dismantle(target);
                if (dErr === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, { visualizePathStyle: { stroke: '#ff3333' } });
                }
            }
        } else if (target.hits) {
            var attackErr = creep.attack(target);
            if (attackErr === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ff3333' } });
            } else if (attackErr === ERR_NO_BODYPART) {
                var rErr = creep.rangedAttack(target);
                if (rErr === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, { visualizePathStyle: { stroke: '#ff3333' } });
                }
            }
        }
    }
};

module.exports = roleSoldier;
