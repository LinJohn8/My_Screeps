var population = require('../strategies/population');
var bodyAlgorithm = require('../algorithms/body');
var roomStats = require('../utils/stats');

var spawnManager = {
    runAll: function () {
        for (var spawnName in Game.spawns) {
            var spawn = Game.spawns[spawnName];
            if (!spawn || spawn.spawning) continue;
            try {
                this.run(spawn);
            } catch (e) {
                console.log('[spawn-error] ' + spawnName + ': ' + e.message);
            }
        }
    },

    run: function (spawn) {
        var room = spawn.room;
        var counts = this.countHomeCreeps(room);
        var plan = population.getPlan(room, counts);
        var role = this.pickRole(plan, counts);
        if (!role) return;

        if (role === 'remoteMiner' && !plan.remoteTarget) return;

        var body = bodyAlgorithm.getBody(role, room);
        var cost = bodyAlgorithm.cost(body);
        if (cost > room.energyAvailable) {
            body = bodyAlgorithm.minBody(role);
            cost = bodyAlgorithm.cost(body);
            if (cost > room.energyAvailable) return;
        }

        var name = role + '_' + Game.time + '_' + Math.floor(Math.random() * 999);
        var memory = this.initialMemory(role, room, plan);
        var result = spawn.spawnCreep(body, name, { memory: memory });

        if (result === OK) {
            roomStats.recordSpend(room, cost);
            console.log('[spawn] ' + room.name + ' ' + role + ' ' + name +
                ' cost=' + cost + ' stage=' + plan.stage);
        } else if (result !== ERR_NOT_ENOUGH_ENERGY && result !== ERR_BUSY) {
            console.log('[spawn-fail] ' + room.name + ' role=' + role + ' err=' + result);
        }
    },

    pickRole: function (plan, counts) {
        for (var i = 0; i < plan.priority.length; i++) {
            var role = plan.priority[i];
            if ((counts[role] || 0) < (plan.targets[role] || 0)) return role;
        }
        return null;
    },

    countHomeCreeps: function (room) {
        var counts = {
            harvester: 0,
            upgrader: 0,
            builder: 0,
            repairer: 0,
            soldier: 0,
            scout: 0,
            observer: 0,
            remoteMiner: 0
        };

        for (var name in Game.creeps) {
            var creep = Game.creeps[name];
            if ((creep.memory.homeRoom || creep.room.name) !== room.name) continue;
            var role = creep.memory.role || 'unknown';
            counts[role] = (counts[role] || 0) + 1;
        }

        return counts;
    },

    initialMemory: function (role, room, plan) {
        var memory = {
            role: role,
            working: false,
            homeRoom: room.name
        };

        if (role === 'remoteMiner') memory.targetRoom = plan.remoteTarget;
        if (role === 'observer') memory.lastHits = undefined;
        if (role === 'scout' && room.memory.exploreTarget) {
            memory.scoutTarget = room.memory.exploreTarget;
        }

        return memory;
    }
};

module.exports = spawnManager;
