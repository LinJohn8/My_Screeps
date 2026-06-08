var movement = {
    moveTo: function (creep, target, opts) {
        if (!creep || !target) return ERR_INVALID_TARGET;
        if (creep.spawning) return ERR_BUSY;

        var targetPos = this.getPos(target);
        if (!targetPos) return ERR_INVALID_TARGET;

        opts = opts || {};
        var range = opts.range;
        if (range === undefined) range = 1;

        if (creep.pos.roomName === targetPos.roomName &&
                creep.pos.getRangeTo(targetPos) <= range) {
            this.clearMoveMemory(creep);
            return OK;
        }

        var stuck = this.updateStuck(creep, targetPos, range);
        if (creep.fatigue > 0) return ERR_TIRED;

        if (stuck >= 2) {
            this.tryMoveBlockerAside(creep, targetPos, range);
        }

        var moveOpts = this.buildMoveOptions(creep, opts, stuck);
        var result = creep.moveTo(targetPos, moveOpts);

        if (result === ERR_NO_PATH) {
            this.recordNoPath(creep, targetPos, range, opts.reason || 'move');
        } else if (result === OK) {
            creep.memory.noPathTarget = null;
        } else if (result !== ERR_TIRED && result !== ERR_BUSY) {
            creep.memory.lastMoveError = result;
        }

        if (stuck >= 5) {
            this.tryStepAside(creep, targetPos);
        }

        return result;
    },

    moveToRoom: function (creep, roomName, opts) {
        if (!roomName) return ERR_INVALID_TARGET;
        opts = opts || {};
        if (opts.range === undefined) opts.range = 22;
        if (opts.maxRooms === undefined) opts.maxRooms = 16;
        return this.moveTo(creep, new RoomPosition(25, 25, roomName), opts);
    },

    closestByPathOrRange: function (creep, targets, opts) {
        var target = creep.pos.findClosestByPath(targets, opts || {});
        if (target) return target;
        return creep.pos.findClosestByRange(targets, opts || {});
    },

    getPos: function (target) {
        if (!target) return null;
        if (target.pos) return target.pos;
        if (target.x !== undefined && target.y !== undefined && target.roomName) return target;
        return null;
    },

    buildMoveOptions: function (creep, opts, stuck) {
        var moveOpts = {};
        for (var k in opts) {
            moveOpts[k] = opts[k];
        }

        if (moveOpts.reusePath === undefined) moveOpts.reusePath = 15;
        if (moveOpts.maxOps === undefined) moveOpts.maxOps = stuck >= 2 ? 3000 : 1500;
        if (moveOpts.ignoreCreeps === undefined) moveOpts.ignoreCreeps = false;
        if (stuck >= 2) {
            moveOpts.reusePath = 0;
            moveOpts.ignoreCreeps = false;
        }

        var userRoomCallback = moveOpts.roomCallback;
        var avoidCreeps = stuck >= 2 || moveOpts.avoidCreeps === true;
        var avoidHostiles = moveOpts.avoidHostiles !== false;
        var allowHostileRooms = moveOpts.allowHostileRooms === true;

        moveOpts.roomCallback = function (roomName) {
            var userMatrix = null;
            if (userRoomCallback) {
                userMatrix = userRoomCallback(roomName);
                if (userMatrix === false) return false;
            }
            return movement.getCostMatrix(roomName, {
                avoidCreeps: avoidCreeps,
                avoidHostiles: avoidHostiles,
                allowHostileRooms: allowHostileRooms,
                userMatrix: userMatrix
            });
        };

        delete moveOpts.avoidCreeps;
        delete moveOpts.avoidHostiles;
        delete moveOpts.allowHostileRooms;
        delete moveOpts.reason;

        return moveOpts;
    },

    getCostMatrix: function (roomName, opts) {
        opts = opts || {};
        if (!global.__movementMatrixCache || global.__movementMatrixCache.tick !== Game.time) {
            global.__movementMatrixCache = { tick: Game.time, data: {} };
        }

        var key = roomName + ':' +
            (opts.avoidCreeps ? 'c' : '-') +
            (opts.avoidHostiles ? 'h' : '-') +
            (opts.allowHostileRooms ? 'a' : '-');

        if (!opts.userMatrix && global.__movementMatrixCache.data[key]) {
            return global.__movementMatrixCache.data[key];
        }

        var room = Game.rooms[roomName];
        if (!room) {
            if (!opts.allowHostileRooms && this.isRoomUnsafe(roomName)) return false;
            return opts.userMatrix || new PathFinder.CostMatrix();
        }

        if (!opts.allowHostileRooms && opts.avoidHostiles && this.roomHasDanger(room)) {
            var owned = room.controller && room.controller.my;
            if (!owned) return false;
        }

        var matrix = opts.userMatrix ? opts.userMatrix.clone() : new PathFinder.CostMatrix();

        var structures = room.find(FIND_STRUCTURES);
        for (var i = 0; i < structures.length; i++) {
            var s = structures[i];
            if (s.structureType === STRUCTURE_ROAD) {
                matrix.set(s.pos.x, s.pos.y, 1);
                continue;
            }
            if (s.structureType === STRUCTURE_CONTAINER) continue;
            if (s.structureType === STRUCTURE_RAMPART && (s.my || s.isPublic)) continue;
            matrix.set(s.pos.x, s.pos.y, 0xff);
        }

        if (opts.avoidCreeps) {
            var creeps = room.find(FIND_CREEPS);
            for (var ci = 0; ci < creeps.length; ci++) {
                matrix.set(creeps[ci].pos.x, creeps[ci].pos.y, 0xff);
            }
        }

        if (opts.avoidHostiles) {
            var hostiles = room.find(FIND_HOSTILE_CREEPS);
            for (var hi = 0; hi < hostiles.length; hi++) {
                this.setAreaCost(matrix, hostiles[hi].pos, 2, 30);
            }
        }

        if (!opts.userMatrix) {
            global.__movementMatrixCache.data[key] = matrix;
        }
        return matrix;
    },

    roomHasDanger: function (room) {
        var hostiles = room.find(FIND_HOSTILE_CREEPS);
        for (var i = 0; i < hostiles.length; i++) {
            for (var j = 0; j < hostiles[i].body.length; j++) {
                var type = hostiles[i].body[j].type;
                if (type === ATTACK || type === RANGED_ATTACK || type === HEAL) return true;
            }
        }
        return false;
    },

    isRoomUnsafe: function (roomName) {
        var info = Memory.roomScout && Memory.roomScout[roomName];
        return !!(info && info.hostiles && info.hostiles > 0);
    },

    setAreaCost: function (matrix, pos, range, cost) {
        for (var dx = -range; dx <= range; dx++) {
            for (var dy = -range; dy <= range; dy++) {
                var x = pos.x + dx;
                var y = pos.y + dy;
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (matrix.get(x, y) < 0xff) matrix.set(x, y, cost);
            }
        }
    },

    updateStuck: function (creep, targetPos, range) {
        if (!creep.memory.moveState) creep.memory.moveState = {};
        var state = creep.memory.moveState;
        var posKey = creep.pos.x + ',' + creep.pos.y + ',' + creep.pos.roomName;
        var targetKey = targetPos.x + ',' + targetPos.y + ',' + targetPos.roomName + ',' + range;

        if (state.targetKey !== targetKey) {
            state.targetKey = targetKey;
            state.lastPos = posKey;
            state.stuck = 0;
            state.updated = Game.time;
            return 0;
        }

        if (state.lastPos === posKey) {
            if (creep.fatigue === 0) state.stuck = (state.stuck || 0) + 1;
        } else {
            state.lastPos = posKey;
            state.stuck = 0;
        }
        state.updated = Game.time;
        return state.stuck || 0;
    },

    clearMoveMemory: function (creep) {
        if (creep.memory.moveState) creep.memory.moveState.stuck = 0;
        creep.memory.lastMoveError = null;
    },

    tryMoveBlockerAside: function (creep, targetPos, range) {
        if (creep.pos.roomName !== targetPos.roomName) return false;

        var path = creep.pos.findPathTo(targetPos, {
            range: range,
            ignoreCreeps: false,
            maxOps: 300,
            swampCost: 5
        });
        if (!path || path.length === 0) return false;

        var next = path[0];
        var blockers = creep.room.lookForAt(LOOK_CREEPS, next.x, next.y);
        for (var i = 0; i < blockers.length; i++) {
            var blocker = blockers[i];
            if (!blocker.my || blocker.id === creep.id) continue;
            if (this.moveAside(blocker, creep.pos)) return true;
        }
        return false;
    },

    tryStepAside: function (creep, targetPos) {
        if (creep.fatigue > 0) return false;
        var bestDir = null;
        var bestScore = -999;
        for (var dir = 1; dir <= 8; dir++) {
            var p = this.posInDirection(creep.pos, dir);
            if (!p) continue;
            if (!this.isWalkable(creep.room, p.x, p.y, { ignoreCreeps: false })) continue;
            var score = p.getRangeTo(targetPos);
            if (score > bestScore) {
                bestScore = score;
                bestDir = dir;
            }
        }
        if (bestDir) return creep.move(bestDir) === OK;
        return false;
    },

    moveAside: function (creep, avoidPos) {
        if (!creep || creep.fatigue > 0 || creep.spawning) return false;
        if (creep.memory.pushedAt === Game.time) return false;

        var bestDir = null;
        var bestScore = -999;
        for (var dir = 1; dir <= 8; dir++) {
            var p = this.posInDirection(creep.pos, dir);
            if (!p) continue;
            if (!this.isWalkable(creep.room, p.x, p.y, { ignoreCreeps: false })) continue;
            if (avoidPos && p.isEqualTo(avoidPos)) continue;
            var score = avoidPos ? p.getRangeTo(avoidPos) : 1;
            if (p.x === 0 || p.x === 49 || p.y === 0 || p.y === 49) score -= 4;
            if (score > bestScore) {
                bestScore = score;
                bestDir = dir;
            }
        }

        if (!bestDir) return false;
        var result = creep.move(bestDir);
        if (result === OK) {
            creep.memory.pushedAt = Game.time;
            creep.memory.status = 'yield';
            return true;
        }
        return false;
    },

    posInDirection: function (pos, dir) {
        var dx = [0, 0, 1, 1, 1, 0, -1, -1, -1][dir];
        var dy = [0, -1, -1, 0, 1, 1, 1, 0, -1][dir];
        if (dx === undefined) return null;
        var x = pos.x + dx;
        var y = pos.y + dy;
        if (x < 0 || x > 49 || y < 0 || y > 49) return null;
        return new RoomPosition(x, y, pos.roomName);
    },

    isWalkable: function (room, x, y, opts) {
        opts = opts || {};
        if (!room || x < 0 || x > 49 || y < 0 || y > 49) return false;
        if (room.getTerrain().get(x, y) === TERRAIN_MASK_WALL) return false;

        var structures = room.lookForAt(LOOK_STRUCTURES, x, y);
        for (var i = 0; i < structures.length; i++) {
            var s = structures[i];
            if (s.structureType === STRUCTURE_ROAD) continue;
            if (s.structureType === STRUCTURE_CONTAINER) continue;
            if (s.structureType === STRUCTURE_RAMPART && (s.my || s.isPublic)) continue;
            return false;
        }

        if (!opts.ignoreCreeps) {
            var creeps = room.lookForAt(LOOK_CREEPS, x, y);
            if (creeps.length > 0) return false;
        }

        return true;
    },

    recordNoPath: function (creep, targetPos, range, reason) {
        var key = targetPos.x + ',' + targetPos.y + ',' + targetPos.roomName + ',' + range;
        var mem = creep.memory.noPathTarget || {};
        if (mem.key === key) mem.count = (mem.count || 0) + 1;
        else mem = { key: key, count: 1 };
        mem.last = Game.time;
        mem.reason = reason;
        creep.memory.noPathTarget = mem;

        if (mem.count < 2) return;
        if (creep.pos.roomName !== targetPos.roomName) return;

        var blocker = this.findBlockingStructure(creep.pos, targetPos, range);
        if (blocker) this.markObstacle(creep.room, blocker, reason);
    },

    findBlockingStructure: function (fromPos, targetPos, range) {
        if (fromPos.roomName !== targetPos.roomName) return null;
        var room = Game.rooms[fromPos.roomName];
        if (!room) return null;

        var hard = PathFinder.search(fromPos, { pos: targetPos, range: range }, {
            plainCost: 2,
            swampCost: 10,
            maxOps: 2500,
            roomCallback: function (roomName) {
                if (roomName !== room.name) return false;
                return movement.buildObstacleMatrix(room, true);
            }
        });
        if (!hard.incomplete) return null;

        var soft = PathFinder.search(fromPos, { pos: targetPos, range: range }, {
            plainCost: 2,
            swampCost: 10,
            maxOps: 2500,
            roomCallback: function (roomName) {
                if (roomName !== room.name) return false;
                return movement.buildObstacleMatrix(room, false);
            }
        });

        for (var i = 0; i < soft.path.length; i++) {
            var p = soft.path[i];
            var obstacle = this.getDismantleObstacleAt(room, p.x, p.y);
            if (obstacle) return obstacle;
        }
        return null;
    },

    buildObstacleMatrix: function (room, hardBlock) {
        var matrix = new PathFinder.CostMatrix();
        var structures = room.find(FIND_STRUCTURES);
        for (var i = 0; i < structures.length; i++) {
            var s = structures[i];
            if (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) continue;
            if (s.structureType === STRUCTURE_RAMPART && (s.my || s.isPublic)) continue;
            if (this.isDismantleObstacle(s)) {
                matrix.set(s.pos.x, s.pos.y, hardBlock ? 0xff : 35);
            } else {
                matrix.set(s.pos.x, s.pos.y, 0xff);
            }
        }
        return matrix;
    },

    isDismantleObstacle: function (structure) {
        if (!structure) return false;
        if (structure.structureType === STRUCTURE_WALL) return true;
        if (structure.structureType === STRUCTURE_RAMPART && !structure.my && !structure.isPublic) return true;
        return false;
    },

    getDismantleObstacleAt: function (room, x, y) {
        var structures = room.lookForAt(LOOK_STRUCTURES, x, y);
        for (var i = 0; i < structures.length; i++) {
            if (this.isDismantleObstacle(structures[i])) {
                return {
                    id: structures[i].id,
                    structureType: structures[i].structureType,
                    pos: { x: x, y: y, roomName: room.name }
                };
            }
        }
        return null;
    },

    markObstacle: function (room, obstacle, reason) {
        if (!room || !obstacle) return;
        if (!Memory.obstacles) Memory.obstacles = {};
        if (!Memory.obstacles[room.name]) Memory.obstacles[room.name] = {};
        var key = obstacle.pos.x + ',' + obstacle.pos.y;
        var old = Memory.obstacles[room.name][key] || {};
        Memory.obstacles[room.name][key] = {
            id: obstacle.id || old.id || null,
            pos: {
                x: obstacle.pos.x,
                y: obstacle.pos.y,
                roomName: obstacle.pos.roomName || room.name
            },
            type: obstacle.structureType || obstacle.type || old.type || STRUCTURE_WALL,
            priority: old.priority || 1,
            destination: old.destination || reason || 'move',
            markedAt: old.markedAt || Game.time,
            lastSeen: Game.time,
            assignedTo: old.assignedTo || null
        };
        room.memory.needDismantler = Game.time;
    }
};

module.exports = movement;
