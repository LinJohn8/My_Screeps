/**
 * 🗼 Tower 防御塔 AI
 *
 * 优先级:
 *   1. 攻击入侵者
 *   2. 治疗受伤的友方 creep
 *   3. 修复受损建筑
 *   4. 修复城墙/rampart（能量充裕时）
 */
var towerControl = {

    run: function (room) {
        var towers = room.find(FIND_MY_STRUCTURES, {
            filter: function (s) { return s.structureType === STRUCTURE_TOWER && s.isActive(); }
        });

        for (var i = 0; i < towers.length; i++) {
            var tower = towers[i];
            if (tower.store[RESOURCE_ENERGY] < 10) continue;
            this.controlTower(tower, room);
        }
    },

    controlTower: function (tower, room) {

        // 1. 攻击入侵者
        var hostiles = room.find(FIND_HOSTILE_CREEPS);
        if (hostiles.length > 0) {
            var healer = null;
            var attacker = null;
            for (var i = 0; i < hostiles.length; i++) {
                var h = hostiles[i];
                var hasHeal = false, hasAttack = false;
                for (var j = 0; j < h.body.length; j++) {
                    if (h.body[j].type === HEAL) hasHeal = true;
                    if (h.body[j].type === ATTACK || h.body[j].type === RANGED_ATTACK) hasAttack = true;
                }
                if (hasHeal && !healer) healer = h;
                if (hasAttack && !attacker) attacker = h;
            }
            var primaryTarget = healer || attacker || hostiles[0];
            tower.attack(primaryTarget);
            return;
        }

        // 2. 治疗友方
        var wounded = room.find(FIND_MY_CREEPS, {
            filter: function (c) { return c.hits < c.hitsMax * 0.5; }
        });
        if (wounded.length > 0 && tower.store[RESOURCE_ENERGY] > 30) {
            wounded.sort(function (a, b) { return a.hits / a.hitsMax - b.hits / b.hitsMax; });
            tower.heal(wounded[0]);
            return;
        }

        // 3. 修复建筑
        if (tower.store[RESOURCE_ENERGY] > tower.store.getCapacity(RESOURCE_ENERGY) * 0.6) {
            var damaged = room.find(FIND_STRUCTURES, {
                filter: function (s) {
                    return s.hits < s.hitsMax * 0.7 &&
                           s.structureType !== STRUCTURE_WALL &&
                           s.structureType !== STRUCTURE_RAMPART;
                }
            });
            if (damaged.length > 0) {
                damaged.sort(function (a, b) {
                    return (a.hits / a.hitsMax) - (b.hits / b.hitsMax);
                });
                tower.repair(damaged[0]);
                return;
            }
        }

        // 4. 修城墙/rampart
        if (tower.store[RESOURCE_ENERGY] > tower.store.getCapacity(RESOURCE_ENERGY) * 0.8) {
            var rcl = room.controller ? room.controller.level : 1;
            var wallMax = rcl * 5000;
            var wall = room.find(FIND_STRUCTURES, {
                filter: function (s) {
                    return (s.structureType === STRUCTURE_WALL ||
                            s.structureType === STRUCTURE_RAMPART) &&
                           s.hits < wallMax;
                }
            });
            if (wall.length > 0) {
                wall.sort(function (a, b) { return a.hits - b.hits; });
                tower.repair(wall[0]);
            }
        }
    }
};

module.exports = towerControl;
