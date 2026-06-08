var registry = require('../roles/registry');
var roomDefense = require('../utils/defense');
var population = require('../strategies/population');

var creepManager = {
    runAll: function () {
        var handled = this.runDismantleTasks();
        this.runRoles(handled);
        this.handleConversions();
        this.validateBodies();
        if (Game.time % 30 === 0) this.report();
    },

    runDismantleTasks: function () {
        var handled = {};
        for (var name in Game.creeps) {
            var creep = Game.creeps[name];
            if (roomDefense.executeDismantle(creep)) handled[name] = true;
        }
        return handled;
    },

    runRoles: function (handled) {
        for (var name in Game.creeps) {
            if (handled[name]) continue;
            var creep = Game.creeps[name];
            try {
                registry.run(creep);
            } catch (e) {
                console.log('[creep-error] ' + creep.name + ': ' + e.message);
            }
        }
    },

    handleConversions: function () {
        for (var name in Game.creeps) {
            var creep = Game.creeps[name];
            if (creep.room.name !== creep.memory.homeRoom) continue;

            if (creep.memory.role === 'observer') {
                if (creep.memory.state !== 'retreating' && creep.memory.state !== 'idle') {
                    this.handleStuckObserver(creep);
                    continue;
                }
                this.convertAtHome(creep);
                continue;
            }

            if (creep.memory.role === 'scout') {
                if (creep.memory.convertAtHome || !creep.memory.scoutTarget) {
                    this.convertAtHome(creep);
                }
            }
        }
    },

    handleStuckObserver: function (creep) {
        if (creep.memory.state !== 'exploring') return;
        creep.memory.homeTicks = (creep.memory.homeTicks || 0) + 1;
        if (creep.memory.homeTicks > 3) this.convertAtHome(creep);
    },

    convertAtHome: function (creep) {
        var counts = this.countHomeCreeps(creep.room);
        var hostilesHere = creep.room.memory.hostile &&
            creep.room.find(FIND_HOSTILE_CREEPS).length > 0;
        var role = population.pickConversionRole(creep.room, counts, hostilesHere);

        if (registry.hasRequiredBody(creep, role)) {
            creep.memory.role = role;
            creep.memory.working = role === 'soldier';
            creep.memory.state = null;
            creep.memory.convertAtHome = null;
            creep.memory.scoutTarget = null;
            creep.memory.status = '转换:' + role;
            console.log('[convert] ' + creep.name + ' -> ' + role);
        } else {
            console.log('[recycle] ' + creep.name + ' body cannot become ' + role);
            creep.suicide();
        }
    },

    validateBodies: function () {
        for (var name in Game.creeps) {
            var creep = Game.creeps[name];
            if (creep.spawning) continue;
            if (creep.room.name !== creep.memory.homeRoom) continue;
            var role = creep.memory.role;
            if (!role || !registry.requirements[role]) continue;
            if (registry.hasRequiredBody(creep, role)) continue;

            console.log('[bad-body] ' + creep.name + ' role=' + role + ' suicide for rebuild');
            creep.suicide();
        }
    },

    countHomeCreeps: function (room) {
        var counts = {};
        for (var name in Game.creeps) {
            var creep = Game.creeps[name];
            if ((creep.memory.homeRoom || creep.room.name) !== room.name) continue;
            var role = creep.memory.role || 'unknown';
            counts[role] = (counts[role] || 0) + 1;
        }
        return counts;
    },

    report: function () {
        for (var roomName in Game.rooms) {
            var room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;

            var roles = {};
            var creeps = [];
            for (var name in Game.creeps) {
                var creep = Game.creeps[name];
                if ((creep.memory.homeRoom || creep.room.name) !== room.name) continue;
                var role = creep.memory.role || 'unknown';
                roles[role] = (roles[role] || 0) + 1;
                creeps.push(creep);
            }

            var plan = room.memory.population || {};
            var stage = plan.stage || (room.memory.strategy && room.memory.strategy.stage) || 'unknown';
            var line = '[summary] ' + room.name + ' stage=' + stage + ' ';
            for (var r in roles) line += r + ':' + roles[r] + ' ';

            if (room.memory.stats) {
                var stats = room.memory.stats;
                var pct = Math.floor((stats.energyStored / (stats.energyCapacity || 1)) * 100);
                line += 'energy=' + pct + '% ';
            }
            if (room.memory.hostile) line += 'HOSTILE ';
            console.log(line);

            if (plan.targets) {
                var targetLine = '  targets ';
                for (var tr in plan.targets) {
                    if (plan.targets[tr] > 0) targetLine += tr + ':' + plan.targets[tr] + ' ';
                }
                console.log(targetLine);
            }

            for (var i = 0; i < creeps.length; i++) {
                var c = creeps[i];
                var status = c.memory.status || (c.memory.working ? 'work' : 'prep');
                console.log('  ' + c.name.slice(-12) + ' [' + c.memory.role + '] ' +
                    status + ' @' + c.pos.x + ',' + c.pos.y);
            }
        }
    }
};

module.exports = creepManager;
