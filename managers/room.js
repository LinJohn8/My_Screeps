var roomStats = require('../utils/stats');
var towerControl = require('../structures/tower');
var roadUtils = require('../utils/road');
var roomDefense = require('../utils/defense');
var basePlanner = require('../planners/base');
var development = require('../strategies/development');

var roomManager = {
    runAll: function () {
        for (var roomName in Game.rooms) {
            var room = Game.rooms[roomName];
            if (!room.controller || !room.controller.my) continue;
            try {
                this.run(room);
            } catch (e) {
                console.log('[room-error] ' + roomName + ': ' + e.message);
            }
        }
    },

    run: function (room) {
        roomStats.update(room);
        development.update(room);
        towerControl.run(room);

        this.checkHostiles(room);
        this.checkSafeMode(room);

        if (Game.time % 50 === 0) this.checkExploration(room);

        if (Game.time % 100 === 0) {
            roadUtils.planRoads(room);
            this.cleanupBlockingWallSites(room);
            roomDefense.run(room);
            roomDefense.removeBlockedRoadSites(room);
            roomDefense.findBlockedRoadWalls(room);
        }

        if (Game.time % 100 === 10) {
            basePlanner.run(room);
        }

        if (Game.time % 30 === 0) {
            roomDefense.assignDismantleTasks(room);
        }
    },

    cleanupBlockingWallSites: function (room) {
        var blockingWalls = roomDefense.findWallsOnCriticalPaths(room);
        for (var i = 0; i < blockingWalls.length; i++) {
            if (blockingWalls[i].progressTotal !== undefined && blockingWalls[i].remove) {
                blockingWalls[i].remove();
            }
        }
    },

    checkHostiles: function (room) {
        var hostiles = room.find(FIND_HOSTILE_CREEPS);
        if (hostiles.length === 0) {
            room.memory.hostile = false;
            room.memory.threatLevel = 0;
            return;
        }

        room.memory.hostile = true;
        var threatLevel = 0;

        for (var i = 0; i < hostiles.length; i++) {
            var attackParts = 0;
            var healParts = 0;
            for (var j = 0; j < hostiles[i].body.length; j++) {
                var type = hostiles[i].body[j].type;
                if (type === ATTACK || type === RANGED_ATTACK) attackParts++;
                if (type === HEAL) healParts++;
            }
            threatLevel += attackParts + healParts * 2;
        }

        room.memory.threatLevel = threatLevel;
        if (Game.time % 10 === 0) {
            console.log('[hostile] ' + room.name + ' threat=' + threatLevel + ' count=' + hostiles.length);
        }
    },

    checkSafeMode: function (room) {
        if (!room.controller || !room.controller.my) return;
        if (room.controller.safeMode) return;
        if (room.controller.safeModeAvailable <= 0) return;
        if (room.memory.lastSafeMode && Game.time - room.memory.lastSafeMode < 1000) return;

        var threat = room.memory.threatLevel || 0;
        if (threat < 15) return;

        var soldiers = room.find(FIND_MY_CREEPS, {
            filter: function (c) { return c.memory.role === 'soldier'; }
        }).length;
        if (soldiers >= Math.ceil(threat / 5)) return;

        var result = room.controller.activateSafeMode();
        if (result === OK) {
            room.memory.lastSafeMode = Game.time;
            console.log('[safe-mode] ' + room.name + ' threat=' + threat);
        }
    },

    checkExploration: function (room) {
        var exits = Game.map.describeExits(room.name);
        if (!exits) return;

        for (var dir in exits) {
            var neighbor = exits[dir];
            if (Memory.unreachableRooms && Memory.unreachableRooms[neighbor]) continue;
            if (Memory.roomScout && Memory.roomScout[neighbor] &&
                    Memory.roomScout[neighbor].hostiles > 0) continue;

            if (!Memory.explored || !Memory.explored[neighbor]) {
                room.memory.exploreTarget = neighbor;
                return;
            }
        }
        room.memory.exploreTarget = null;
    }
};

module.exports = roomManager;
