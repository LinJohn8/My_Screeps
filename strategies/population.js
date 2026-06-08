var development = require('./development');

var population = {
    getPlan: function (room, counts) {
        counts = counts || {};
        var stage = development.update(room).stage;
        var sources = room.find(FIND_SOURCES).length || 1;
        var sites = room.find(FIND_CONSTRUCTION_SITES).length;
        var hasDismantle = this.hasDismantleWork(room);
        var remoteRoom = this.pickRemoteRoom(room);
        var exploreNeeded = this.hasExploreNeed(room);
        var rcl = room.controller ? room.controller.level : 1;

        var targets = {
            harvester: Math.max(3, sources * 2),
            upgrader: 2,
            builder: sites > 0 ? 1 : 0,
            repairer: 0,
            soldier: 0,
            scout: 0,
            observer: 0,
            remoteMiner: 0
        };

        if (stage === 'bootstrap') {
            targets.harvester = Math.max(3, sources * 2);
            targets.upgrader = 1;
            targets.builder = sites > 0 ? 1 : 0;
        } else if (stage === 'settle') {
            targets.harvester = Math.max(4, sources * 2 + 1);
            targets.upgrader = 3;
            targets.builder = sites > 0 ? 2 : 1;
            targets.scout = exploreNeeded ? 1 : 0;
        } else if (stage === 'infrastructure') {
            targets.harvester = Math.max(4, sources * 2);
            targets.upgrader = 3;
            targets.builder = sites > 0 ? 2 : 1;
            targets.repairer = 1;
            targets.scout = exploreNeeded ? 1 : 0;
            targets.remoteMiner = remoteRoom ? 1 : 0;
        } else if (stage === 'economy') {
            targets.harvester = room.storage ? Math.max(2, sources) : Math.max(4, sources * 2);
            targets.upgrader = 3;
            targets.builder = sites > 0 ? 2 : 1;
            targets.repairer = 2;
            targets.scout = exploreNeeded ? 1 : 0;
            targets.remoteMiner = remoteRoom ? 2 : 0;
        } else {
            targets.harvester = room.storage ? Math.max(2, sources) : Math.max(4, sources * 2);
            targets.upgrader = 2;
            targets.builder = sites > 0 ? 2 : 1;
            targets.repairer = 2;
            targets.scout = exploreNeeded ? 1 : 0;
            targets.remoteMiner = remoteRoom ? 2 : 0;
        }

        if (hasDismantle) targets.builder = Math.max(targets.builder, 1);

        if (room.memory.hostile && room.memory.threatLevel > 0) {
            targets.soldier = Math.max(1, Math.min(4, Math.ceil(room.memory.threatLevel / 5)));
        }

        this.applyBudgetLimits(room, counts, targets, hasDismantle);

        if (rcl < 3) targets.remoteMiner = 0;
        if (!remoteRoom) targets.remoteMiner = 0;

        var priority = hasDismantle
            ? ['soldier', 'harvester', 'builder', 'repairer', 'upgrader', 'remoteMiner', 'scout']
            : ['soldier', 'harvester', 'builder', 'repairer', 'upgrader', 'remoteMiner', 'scout'];

        if ((counts.harvester || 0) === 0) {
            priority = ['harvester', 'soldier', 'builder', 'upgrader'];
            targets = {
                harvester: 1,
                soldier: targets.soldier || 0,
                builder: 0,
                upgrader: 0,
                repairer: 0,
                scout: 0,
                observer: 0,
                remoteMiner: 0
            };
        }

        room.memory.population = {
            stage: stage,
            targets: targets,
            priority: priority,
            remoteTarget: remoteRoom,
            updated: Game.time
        };

        return {
            stage: stage,
            targets: targets,
            priority: priority,
            remoteTarget: remoteRoom
        };
    },

    applyBudgetLimits: function (room, counts, targets, hasDismantle) {
        var stats = room.memory.stats;
        var ratio = stats && stats.energyCapacity > 0
            ? stats.energyStored / stats.energyCapacity
            : 0.5;

        if (ratio < 0.15) {
            targets.harvester = Math.max(3, targets.harvester);
            targets.upgrader = Math.min(targets.upgrader, 1);
            targets.builder = hasDismantle ? 1 : Math.min(targets.builder, 1);
            targets.repairer = 0;
            targets.remoteMiner = 0;
            targets.scout = 0;
        } else if (ratio < 0.35) {
            targets.builder = Math.min(targets.builder, 1);
            targets.repairer = Math.min(targets.repairer, 1);
            targets.remoteMiner = Math.min(targets.remoteMiner, 1);
        }

        if ((counts.harvester || 0) < 2) {
            targets.remoteMiner = 0;
            targets.scout = 0;
        }
    },

    hasDismantleWork: function (room) {
        if (Memory.obstacles && Memory.obstacles[room.name]) {
            for (var key in Memory.obstacles[room.name]) {
                if (Memory.obstacles[room.name][key]) return true;
            }
        }
        return !!(room.memory.needDismantler && Game.time - room.memory.needDismantler < 200);
    },

    hasExploreNeed: function (room) {
        var exits = Game.map.describeExits(room.name);
        if (!exits) return false;
        for (var dir in exits) {
            var next = exits[dir];
            if (Memory.unreachableRooms && Memory.unreachableRooms[next]) continue;
            if (Memory.roomScout && Memory.roomScout[next] &&
                    Memory.roomScout[next].hostiles > 0) continue;
            if (!Memory.explored || !Memory.explored[next]) return true;
        }
        return false;
    },

    pickRemoteRoom: function (room) {
        var roomScout = Memory.roomScout || {};
        var homeRoom = room.name;
        var bestRoom = null;
        var bestScore = 999999;

        for (var name in roomScout) {
            if (name === homeRoom) continue;
            var info = roomScout[name];
            var sourceCount = typeof info.sources === 'number'
                ? info.sources
                : (info.sources && info.sources.length ? info.sources.length : 0);

            if (sourceCount < 1) continue;
            if (info.owner) continue;
            if (info.hostiles && info.hostiles > 0) continue;

            var route = Game.map.findRoute(homeRoom, name);
            if (route === ERR_NO_PATH || !route) continue;
            if (route.length > 3) continue;

            var score = route.length * 10 - sourceCount * 3;
            if (score < bestScore) {
                bestScore = score;
                bestRoom = name;
            }
        }

        return bestRoom;
    },

    pickConversionRole: function (room, counts, hostilesHere) {
        if (hostilesHere) return 'soldier';
        if ((counts.harvester || 0) < 2) return 'harvester';
        if (this.hasDismantleWork(room) && (counts.builder || 0) < 1) return 'builder';
        if (room.find(FIND_CONSTRUCTION_SITES).length > 0 && (counts.builder || 0) < 1) return 'builder';
        if ((counts.repairer || 0) < 1 && room.controller && room.controller.level >= 3) return 'repairer';
        return 'upgrader';
    }
};

module.exports = population;
