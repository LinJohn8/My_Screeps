/**
 * 🏰 防御工事规划系统
 *
 * 自动规划:
 *   1. 出口 Rampart — 在每个出口内侧建 Rampart，封锁入口
 *   2. 基地围墙 — Spawn 周围建一圈 Wall
 *   3. 出口哨塔 — 在每个出口附近自动放置 Tower
 *
 * 只在能量预算为 green/surplus 时建造（不拖累经济）
 */
var defense = {

    // ================================================================
    //  入口: 每次修路时顺便执行
    // ================================================================
    run: function (room) {
        // 只在有统计预算后才执行建造
        if (Game.time % 50 !== 0) return;

        var stats = require('./stats');
        if (!stats.canAfford(room, 'build')) {
            if (Game.time % 200 === 0) {
                console.log('🏰 [' + room.name + '] 能量不足，暂缓防御工事建造');
            }
            return;
        }

        this.planExitRamparts(room);
        this.planPerimeter(room);
        this.planTowers(room);
    },

    // ================================================================
    //  1. 出口 Rampart — 封锁入侵路线
    //
    //  对每个出口方向，在房间内侧 1-2 格处放 Rampart，
    //  尽量选狭窄通道（1 格宽），让入侵者只能挤进来
    // ================================================================
    planExitRamparts: function (room) {
        var roadUtils = require('./road');
        var exits = roadUtils.getExitPositions(room);
        var placed = 0;

        for (var ei = 0; ei < exits.length; ei++) {
            var exit = exits[ei];
            var center = exit.center;

            // 从出口中心，往房间内走 2 格
            var insideX = center.x;
            var insideY = center.y;

            // 根据方向往内偏移
            switch (exit.direction) {
                case FIND_EXIT_TOP:    insideY += 2; break;
                case FIND_EXIT_RIGHT:  insideX -= 2; break;
                case FIND_EXIT_BOTTOM: insideY -= 2; break;
                case FIND_EXIT_LEFT:   insideX += 2; break;
            }

            // 限制在合法坐标内
            insideX = Math.max(1, Math.min(48, insideX));
            insideY = Math.max(1, Math.min(48, insideY));

            // 检查该位置的地形（不能在墙上）
            var terrain = room.getTerrain().get(insideX, insideY);
            if (terrain === TERRAIN_MASK_WALL) continue;

            // 检查是否有 Rampart 或 Wall
            var hasRampart = false;
            var structures = room.lookForAt(LOOK_STRUCTURES, insideX, insideY);
            for (var si = 0; si < structures.length; si++) {
                if (structures[si].structureType === STRUCTURE_RAMPART ||
                    structures[si].structureType === STRUCTURE_WALL) {
                    hasRampart = true;
                    break;
                }
            }
            if (hasRampart) continue;

            // 检查是否已有 construction site
            var sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, insideX, insideY);
            if (sites.length > 0) continue;

            // 建 Rampart
            var result = room.createConstructionSite(insideX, insideY, STRUCTURE_RAMPART);
            if (result === OK) {
                placed++;
            }
        }

        if (placed > 0 && Game.time % 100 === 0) {
            console.log('🏰 [' + room.name + '] 放置了 ' + placed + ' 个出口 Rampart');
        }
    },

    // ================================================================
    //  2. 基地围墙 — Spawn 周围 5-8 格建墙
    //
    //  Spawn 为中心，向外半径 6 格的矩形环上放 Wall
    //  注意留出出口方向不封死
    // ================================================================
    // ================================================================
    //  获取关键路径上的格子集合（Spawn → 所有Source/Controller/出口）
    // ================================================================
    _getCriticalPathTiles: function (room) {
        var spawns = room.find(FIND_MY_SPAWNS);
        if (spawns.length === 0) return {};

        var spawnPos = spawns[0].pos;
        var criticalTiles = {};

        // 到每个能量源的路径
        var sources = room.find(FIND_SOURCES);
        for (var i = 0; i < sources.length; i++) {
            var path = PathFinder.search(spawnPos, { pos: sources[i].pos, range: 1 }, { maxOps: 500 }).path;
            for (var pi = 0; pi < path.length; pi++) {
                criticalTiles[path[pi].x + ',' + path[pi].y] = true;
            }
        }

        // 到控制器的路径
        if (room.controller) {
            var cPath = PathFinder.search(spawnPos, { pos: room.controller.pos, range: 1 }, { maxOps: 500 }).path;
            for (var pi2 = 0; pi2 < cPath.length; pi2++) {
                criticalTiles[cPath[pi2].x + ',' + cPath[pi2].y] = true;
            }
        }

        // 到每个出口的路径
        var roadUtils = require('./road');
        var exits = roadUtils.getExitPositions(room);
        for (var ei = 0; ei < exits.length; ei++) {
            var ePath = PathFinder.search(spawnPos, { pos: exits[ei].center, range: 1 }, { maxOps: 500 }).path;
            for (var pi3 = 0; pi3 < ePath.length; pi3++) {
                criticalTiles[ePath[pi3].x + ',' + ePath[pi3].y] = true;
            }
        }

        return criticalTiles;
    },

    /**
     * 查找建在关键路径上的墙（堵路的墙）
     */
    findWallsOnCriticalPaths: function (room) {
        var criticalTiles = this._getCriticalPathTiles(room);
        var blockingWalls = [];

        var walls = room.find(FIND_MY_STRUCTURES, {
            filter: function (s) { return s.structureType === STRUCTURE_WALL; }
        });
        for (var i = 0; i < walls.length; i++) {
            var w = walls[i];
            if (criticalTiles[w.pos.x + ',' + w.pos.y]) {
                blockingWalls.push(w);
            }
        }

        // 也检查墙的工地
        var wallSites = room.find(FIND_CONSTRUCTION_SITES, {
            filter: function (s) { return s.structureType === STRUCTURE_WALL; }
        });
        for (var si = 0; si < wallSites.length; si++) {
            var ws = wallSites[si];
            if (criticalTiles[ws.pos.x + ',' + ws.pos.y]) {
                blockingWalls.push(ws);
            }
        }

        return blockingWalls;
    },

    planPerimeter: function (room) {
        var spawns = room.find(FIND_MY_SPAWNS);
        if (spawns.length === 0) return;

        var cx = spawns[0].pos.x;
        var cy = spawns[0].pos.y;
        // 预先计算关键路径，不在这些格子上建墙
        var criticalTiles = this._getCriticalPathTiles(room);
        var radius = 6;
        var placed = 0;

        // 在矩形环上建墙
        for (var dx = -radius; dx <= radius; dx++) {
            for (var dy = -radius; dy <= radius; dy++) {
                // 只选环上的点（离中心距离在 radius-1 ~ radius 之间）
                var dist = Math.max(Math.abs(dx), Math.abs(dy));
                if (dist < radius - 1 || dist > radius) continue;

                var wx = cx + dx;
                var wy = cy + dy;

                // 坐标合法性
                if (wx < 1 || wx > 48 || wy < 1 || wy > 48) continue;

                // 不能封住 Spawn 自身
                if (dx === 0 && dy === 0) continue;

                // 不在出口位置建墙（给 creep 留出口）
                var terrain = room.getTerrain().get(wx, wy);
                if (terrain === TERRAIN_MASK_WALL) continue;

                // 不能盖在已有的重要建筑上
                var blocked = false;
                var look = room.lookAt(wx, wy);
                for (var li = 0; li < look.length; li++) {
                    var l = look[li];
                    if (l.type === 'structure') {
                        var t = l.structure.structureType;
                        if (t === STRUCTURE_SPAWN || t === STRUCTURE_TOWER ||
                            t === STRUCTURE_EXTENSION || t === STRUCTURE_STORAGE ||
                            t === STRUCTURE_CONTAINER || t === STRUCTURE_LINK ||
                            t === STRUCTURE_LAB || t === STRUCTURE_TERMINAL ||
                            t === STRUCTURE_OBSERVER || t === STRUCTURE_NUKER ||
                            t === STRUCTURE_FACTORY || t === STRUCTURE_POWER_SPAWN) {
                            blocked = true;
                            break;
                        }
                        // 已经有墙/Rampart 了
                        if (t === STRUCTURE_WALL || t === STRUCTURE_RAMPART) {
                            blocked = true;
                            break;
                        }
                        // 有道路 → 不能盖墙（否则会堵路）
                        if (t === STRUCTURE_ROAD) {
                            blocked = true;
                            break;
                        }
                    }
                    if (l.type === 'constructionSite') {
                        blocked = true;
                        break;
                    }
                }
                if (blocked) continue;

                // 不在关键路径上建墙（否则会堵路）
                if (criticalTiles[wx + ',' + wy]) continue;

                var result = room.createConstructionSite(wx, wy, STRUCTURE_WALL);
                if (result === OK) placed++;
            }
        }

        if (placed > 0 && Game.time % 100 === 0) {
            console.log('🏰 [' + room.name + '] 放置了 ' + placed + ' 段围墙');
        }
    },

    // ================================================================
    //  3. 出口哨塔 — 在出口附近自动建 Tower
    //
    //  每个出口放 1 个 Tower（离出口 3-5 格），
    //  基地中心额外放 1-2 个
    // ================================================================
    planTowers: function (room) {
        var roadUtils = require('./road');
        var exits = roadUtils.getExitPositions(room);
        var towers = room.find(FIND_MY_STRUCTURES, {
            filter: function (s) { return s.structureType === STRUCTURE_TOWER; }
        });

        var maxTowersPerExit = 1;
        var maxCenterTowers = 2;
        var placed = 0;

        // 统计每个出口方向的 Tower 数量
        var towersByExit = {};
        for (var ti = 0; ti < towers.length; ti++) {
            var t = towers[ti];
            // 判断这个 Tower 属于哪个出口
            var bestExit = null;
            var bestDist = 999;
            for (var ei = 0; ei < exits.length; ei++) {
                var d = t.pos.getRangeTo(exits[ei].center);
                if (d < bestDist) {
                    bestDist = d;
                    bestExit = exits[ei].direction;
                }
            }
            if (bestExit) {
                towersByExit[bestExit] = (towersByExit[bestExit] || 0) + 1;
            }
        }

        // 为每个出口建 Tower
        for (var ei2 = 0; ei2 < exits.length; ei2++) {
            var exit2 = exits[ei2];
            var dir = exit2.direction;
            var currentCount = towersByExit[dir] || 0;
            if (currentCount >= maxTowersPerExit) continue;

            // 从出口往内 4 格作为 Tower 位置
            var tx = exit2.center.x;
            var ty = exit2.center.y;

            switch (dir) {
                case FIND_EXIT_TOP:    ty += 4; break;
                case FIND_EXIT_RIGHT:  tx -= 4; break;
                case FIND_EXIT_BOTTOM: ty -= 4; break;
                case FIND_EXIT_LEFT:   tx += 4; break;
            }

            tx = Math.max(1, Math.min(48, tx));
            ty = Math.max(1, Math.min(48, ty));

            if (this._canPlaceTower(room, tx, ty)) {
                var result = room.createConstructionSite(tx, ty, STRUCTURE_TOWER);
                if (result === OK) placed++;
            } else {
                // 如果首选位置被占，搜索附近 3x3
                for (var ox = -2; ox <= 2; ox++) {
                    for (var oy = -2; oy <= 2; oy++) {
                        if (ox === 0 && oy === 0) continue;
                        var ntx = tx + ox;
                        var nty = ty + oy;
                        if (ntx < 1 || ntx > 48 || nty < 1 || nty > 48) continue;
                        if (this._canPlaceTower(room, ntx, nty)) {
                            var r2 = room.createConstructionSite(ntx, nty, STRUCTURE_TOWER);
                            if (r2 === OK) { placed++; break; }
                        }
                    }
                    if (placed > 0) break;
                }
            }
        }

        if (placed > 0 && Game.time % 100 === 0) {
            console.log('🗼 [' + room.name + '] 放置了 ' + placed + ' 个 Tower 工地');
        }
    },

    // ================================================================
    //  辅助: 检查位置是否可以建 Tower
    // ================================================================
    _canPlaceTower: function (room, x, y) {
        var terrain = room.getTerrain().get(x, y);
        if (terrain === TERRAIN_MASK_WALL) return false;

        var look = room.lookAt(x, y);
        for (var i = 0; i < look.length; i++) {
            var l = look[i];
            if (l.type === 'structure') return false;
            if (l.type === 'constructionSite') return false;
        }
        return true;
    }
};

// ================================================================
//  🚧 路障检测: 清除盖在路上的墙
// ================================================================

/**
 * 检查某格是否有路（已建成或正在建）
 */
defense._hasRoadAt = function (room, x, y) {
    if (x < 0 || x > 49 || y < 0 || y > 49) return false;

    var structures = room.lookForAt(LOOK_STRUCTURES, x, y);
    for (var i = 0; i < structures.length; i++) {
        if (structures[i].structureType === STRUCTURE_ROAD) return true;
    }
    var sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y);
    for (var i = 0; i < sites.length; i++) {
        if (sites[i].structureType === STRUCTURE_ROAD) return true;
    }
    return false;
};

/**
 * 清除建在路上的 Wall 工地
 */
defense.removeBlockedRoadSites = function (room) {
    var wallSites = room.find(FIND_CONSTRUCTION_SITES, {
        filter: function (s) { return s.structureType === STRUCTURE_WALL; }
    });
    var removed = 0;
    for (var i = 0; i < wallSites.length; i++) {
        var site = wallSites[i];
        if (this._hasRoadAt(room, site.pos.x, site.pos.y)) {
            site.remove();
            removed++;
        }
    }
    if (removed > 0) {
        console.log('🏰 [' + room.name + '] 清除了 ' + removed + ' 个堵路的墙工地');
    }
    return removed;
};

/**
 * 检测已建成的墙是否堵路（返回堵路的墙列表）
 * 条件: 墙的上下或左右两侧都有路 → 必然堵路
 */
defense.findBlockedRoadWalls = function (room) {
    var walls = room.find(FIND_MY_STRUCTURES, {
        filter: function (s) { return s.structureType === STRUCTURE_WALL; }
    });

    var blocked = [];
    for (var i = 0; i < walls.length; i++) {
        var w = walls[i];
        var x = w.pos.x, y = w.pos.y;

        var up    = this._hasRoadAt(room, x, y - 1);
        var down  = this._hasRoadAt(room, x, y + 1);
        var left  = this._hasRoadAt(room, x - 1, y);
        var right = this._hasRoadAt(room, x + 1, y);

        // 上下都有路 或 左右都有路 → 必然堵路
        if ((up && down) || (left && right)) {
            blocked.push(w);
        }
    }

    if (blocked.length > 0 && Game.time % 100 === 0) {
        console.log('🏰 [' + room.name + '] 发现 ' + blocked.length + ' 处墙堵路，需要手动拆除');
        for (var bi = 0; bi < blocked.length; bi++) {
            console.log('   🧱 ' + blocked[bi].pos.x + ',' + blocked[bi].pos.y);
        }
    }

    return blocked;
};

// ================================================================
//  🚧 路障检测 + 标记 + 分配拆除
// ================================================================

defense._isDismantleObstacle = function (structure) {
    if (!structure) return false;
    if (structure.structureType === STRUCTURE_WALL) return true;
    if (structure.structureType === STRUCTURE_RAMPART && !structure.my && !structure.isPublic) return true;
    return false;
};

defense._hasActiveWork = function (creep) {
    for (var i = 0; i < creep.body.length; i++) {
        if (creep.body[i].type === WORK && creep.body[i].hits > 0) return true;
    }
    return false;
};

defense._buildPathMatrix = function (room, hardBlock) {
    var matrix = new PathFinder.CostMatrix();
    var structures = room.find(FIND_STRUCTURES);

    for (var i = 0; i < structures.length; i++) {
        var s = structures[i];
        if (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) continue;
        if (s.structureType === STRUCTURE_RAMPART && (s.my || s.isPublic)) continue;

        if (this._isDismantleObstacle(s)) {
            matrix.set(s.pos.x, s.pos.y, hardBlock ? 0xff : 35);
        } else {
            matrix.set(s.pos.x, s.pos.y, 0xff);
        }
    }

    var sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    for (var si = 0; si < sites.length; si++) {
        if (sites[si].structureType === STRUCTURE_WALL) {
            matrix.set(sites[si].pos.x, sites[si].pos.y, hardBlock ? 0xff : 25);
        }
    }

    return matrix;
};

defense._getObstacleAt = function (room, x, y) {
    var structures = room.lookForAt(LOOK_STRUCTURES, x, y);
    for (var i = 0; i < structures.length; i++) {
        if (this._isDismantleObstacle(structures[i])) {
            return {
                id: structures[i].id,
                pos: { x: x, y: y, roomName: room.name },
                type: structures[i].structureType
            };
        }
    }

    var sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y);
    for (var si = 0; si < sites.length; si++) {
        if (sites[si].my && sites[si].structureType === STRUCTURE_WALL) {
            return {
                id: sites[si].id,
                pos: { x: x, y: y, roomName: room.name },
                type: 'site:' + sites[si].structureType
            };
        }
    }

    return null;
};

defense._findPathObstacle = function (room, fromPos, target) {
    var self = this;
    var range = target.range || 1;

    var hard = PathFinder.search(fromPos, { pos: target.pos, range: range }, {
        plainCost: 2,
        swampCost: 10,
        maxOps: 3000,
        roomCallback: function (roomName) {
            if (roomName !== room.name) return false;
            return self._buildPathMatrix(room, true);
        }
    });

    if (!hard.incomplete) return null;

    var soft = PathFinder.search(fromPos, { pos: target.pos, range: range }, {
        plainCost: 2,
        swampCost: 10,
        maxOps: 3000,
        roomCallback: function (roomName) {
            if (roomName !== room.name) return false;
            return self._buildPathMatrix(room, false);
        }
    });

    for (var i = 0; i < soft.path.length; i++) {
        var p = soft.path[i];
        var obstacle = this._getObstacleAt(room, p.x, p.y);
        if (obstacle) {
            obstacle.priority = target.priority;
            obstacle.destination = target.type;
            obstacle.distance = i + 1;
            return obstacle;
        }
    }

    return null;
};

defense._getCriticalTargets = function (room) {
    var targets = [];
    var sources = room.find(FIND_SOURCES);
    for (var i = 0; i < sources.length; i++) {
        targets.push({ pos: sources[i].pos, type: 'source', priority: 0, range: 1 });
    }

    if (room.controller && room.controller.my) {
        targets.push({ pos: room.controller.pos, type: 'controller', priority: 1, range: 2 });
    }

    var roadUtils = require('./road');
    var exits = roadUtils.getExitPositions(room);
    for (var ei = 0; ei < exits.length; ei++) {
        targets.push({ pos: exits[ei].center, type: 'exit', priority: 3, range: 1 });
    }

    return targets;
};

/**
 * 获取房间关键路径上的真实障碍。
 * 先用硬阻挡矩阵确认“确实无路”，再用软矩阵找第一处可拆障碍。
 */
defense.getPathObstacles = function (room) {
    var spawns = room.find(FIND_MY_SPAWNS);
    if (spawns.length === 0) return [];

    var fromPos = spawns[0].pos;
    var targets = this._getCriticalTargets(room);
    var obstacles = [];
    var seen = {};

    for (var ti = 0; ti < targets.length; ti++) {
        var obstacle = this._findPathObstacle(room, fromPos, targets[ti]);
        if (!obstacle) continue;
        var key = obstacle.pos.x + ',' + obstacle.pos.y;
        if (seen[key]) continue;
        seen[key] = true;
        obstacles.push(obstacle);
    }

    var roadWalls = this.findBlockedRoadWalls(room);
    for (var ri = 0; ri < roadWalls.length; ri++) {
        var w = roadWalls[ri];
        var rKey = w.pos.x + ',' + w.pos.y;
        if (seen[rKey]) continue;
        seen[rKey] = true;
        obstacles.push({
            id: w.id,
            pos: { x: w.pos.x, y: w.pos.y, roomName: room.name },
            type: w.structureType,
            priority: 2,
            destination: 'road',
            distance: fromPos.getRangeTo(w)
        });
    }

    obstacles.sort(function (a, b) {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return (a.distance || 0) - (b.distance || 0);
    });

    return obstacles;
};

defense.markObstacles = function (room, obstacles) {
    if (!Memory.obstacles) Memory.obstacles = {};
    if (!Memory.obstacles[room.name]) Memory.obstacles[room.name] = {};

    var roomObs = Memory.obstacles[room.name];
    for (var i = 0; i < obstacles.length; i++) {
        var obs = obstacles[i];
        var key = obs.pos.x + ',' + obs.pos.y;
        var old = roomObs[key] || {};
        roomObs[key] = {
            id: obs.id || old.id || null,
            pos: {
                x: obs.pos.x,
                y: obs.pos.y,
                roomName: obs.pos.roomName || room.name
            },
            type: obs.type || old.type || STRUCTURE_WALL,
            destination: obs.destination || old.destination || 'path',
            priority: obs.priority !== undefined ? obs.priority : (old.priority || 1),
            markedAt: old.markedAt || Game.time,
            lastSeen: Game.time,
            assignedTo: old.assignedTo || null
        };
    }

    return this.cleanObstacles(room);
};

defense.cleanObstacles = function (room) {
    if (!Memory.obstacles || !Memory.obstacles[room.name]) return {};

    var roomObs = Memory.obstacles[room.name];
    for (var key in roomObs) {
        var obs = roomObs[key];
        var live = null;

        if (obs.id) live = Game.getObjectById(obs.id);
        if (!live && obs.pos) {
            live = this._getObstacleAt(room, obs.pos.x, obs.pos.y);
        }

        if (!live || (obs.lastSeen && Game.time - obs.lastSeen > 150)) {
            if (obs.assignedTo && Game.creeps[obs.assignedTo]) {
                Game.creeps[obs.assignedTo].memory.dismantleTarget = null;
            }
            delete roomObs[key];
            continue;
        }
    }

    return roomObs;
};

defense.findNearestDismantler = function (room, pos, used) {
    used = used || {};
    var creeps = room.find(FIND_MY_CREEPS);
    var best = null;
    var bestScore = 999999;

    var harvesterCount = 0;
    for (var hi = 0; hi < creeps.length; hi++) {
        if (creeps[hi].memory.role === 'harvester') harvesterCount++;
    }

    for (var i = 0; i < creeps.length; i++) {
        var c = creeps[i];
        if (used[c.name]) continue;
        if (!this._hasActiveWork(c)) continue;
        if (c.spawning) continue;

        var roleBonus = 40;
        if (c.memory.role === 'builder') roleBonus = 0;
        else if (c.memory.role === 'repairer') roleBonus = 10;
        else if (c.memory.role === 'upgrader') roleBonus = 20;
        else if (c.memory.role === 'harvester') roleBonus = harvesterCount <= 1 ? 180 : 70;
        else if (c.memory.role === 'remoteMiner') roleBonus = 120;
        else if (c.memory.role === 'soldier') roleBonus = 150;

        if (c.memory.homeRoom && c.memory.homeRoom !== room.name) roleBonus += 80;
        if (c.memory.working && c.store && c.store[RESOURCE_ENERGY] > 0) roleBonus += 10;

        var dist = c.pos.getRangeTo(pos.x, pos.y);
        var score = dist * 4 + roleBonus;

        if (score < bestScore) {
            bestScore = score;
            best = c;
        }
    }

    return best;
};

defense.assignDismantleTasks = function (room) {
    var obstacles = this.getPathObstacles(room);
    this.markObstacles(room, obstacles);
    var roomObs = this.cleanObstacles(room);

    var list = [];
    for (var key in roomObs) list.push(roomObs[key]);
    list.sort(function (a, b) {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.markedAt - b.markedAt;
    });

    var used = {};
    for (var cn in Game.creeps) {
        var c = Game.creeps[cn];
        if (c.memory.dismantleTarget) used[c.name] = true;
    }

    var assigned = 0;
    var missingWorker = false;

    for (var i = 0; i < list.length; i++) {
        var obs = list[i];
        var assignedCreep = obs.assignedTo ? Game.creeps[obs.assignedTo] : null;
        if (assignedCreep && this._hasActiveWork(assignedCreep) && assignedCreep.memory.dismantleTarget) {
            continue;
        }

        if (obs.assignedTo && !assignedCreep) obs.assignedTo = null;

        var worker = this.findNearestDismantler(room, obs.pos, used);
        if (!worker) {
            missingWorker = true;
            continue;
        }

        worker.memory.dismantleTarget = {
            id: obs.id || null,
            pos: obs.pos,
            type: obs.type,
            priority: obs.priority,
            destination: obs.destination,
            assignedAt: Game.time
        };
        worker.memory.status = '拆墙任务';
        obs.assignedTo = worker.name;
        used[worker.name] = true;
        assigned++;

        if (Game.time % 30 === 0) {
            console.log('🧱 指派 ' + worker.name + ' 拆除 ' + room.name +
                '(' + obs.pos.x + ',' + obs.pos.y + ') ' + obs.destination);
        }
    }

    if (missingWorker && list.length > 0) {
        room.memory.needDismantler = Game.time;
    }

    return assigned;
};

defense._clearDismantleAssignment = function (creep) {
    var task = creep.memory.dismantleTarget;
    if (task && task.pos && Memory.obstacles) {
        var roomName = task.pos.roomName || creep.room.name;
        var key = task.pos.x + ',' + task.pos.y;
        if (Memory.obstacles[roomName] && Memory.obstacles[roomName][key] &&
                Memory.obstacles[roomName][key].assignedTo === creep.name) {
            Memory.obstacles[roomName][key].assignedTo = null;
        }
    }
    creep.memory.dismantleTarget = null;
};

defense._getDismantleObjectAt = function (room, x, y) {
    var structures = room.lookForAt(LOOK_STRUCTURES, x, y);
    for (var i = 0; i < structures.length; i++) {
        if (this._isDismantleObstacle(structures[i])) return structures[i];
    }
    var sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y);
    for (var si = 0; si < sites.length; si++) {
        if (sites[si].my && sites[si].structureType === STRUCTURE_WALL) {
            return sites[si];
        }
    }
    return null;
};

defense.executeDismantle = function (creep) {
    var task = creep.memory.dismantleTarget;
    if (!task || !task.pos) return false;

    if (!this._hasActiveWork(creep)) {
        this._clearDismantleAssignment(creep);
        creep.room.memory.needDismantler = Game.time;
        return false;
    }

    var movement = require('./movement');
    var targetRoom = task.pos.roomName || creep.room.name;
    if (creep.room.name !== targetRoom) {
        creep.memory.status = '前往拆墙';
        movement.moveToRoom(creep, targetRoom, {
            visualizePathStyle: { stroke: '#ff0000' },
            allowHostileRooms: true,
            reason: 'dismantle-room'
        });
        return true;
    }

    var target = task.id ? Game.getObjectById(task.id) : null;
    if (!target) target = this._getDismantleObjectAt(creep.room, task.pos.x, task.pos.y);

    if (!target) {
        this._clearDismantleAssignment(creep);
        this.cleanObstacles(creep.room);
        return false;
    }

    if (target.progressTotal !== undefined && target.remove) {
        target.remove();
        this._clearDismantleAssignment(creep);
        this.cleanObstacles(creep.room);
        return true;
    }

    if (!this._isDismantleObstacle(target)) {
        this._clearDismantleAssignment(creep);
        this.cleanObstacles(creep.room);
        return false;
    }

    creep.memory.status = '拆墙';
    var err = creep.dismantle(target);
    if (err === ERR_NOT_IN_RANGE) {
        movement.moveTo(creep, target, {
            visualizePathStyle: { stroke: '#ff0000' },
            reusePath: 5,
            range: 1,
            allowHostileRooms: true,
            reason: 'dismantle'
        });
    } else if (err === OK) {
        if (target.hits <= 0) {
            this._clearDismantleAssignment(creep);
            this.cleanObstacles(creep.room);
        }
    } else if (err === ERR_NO_BODYPART || err === ERR_INVALID_TARGET || err === ERR_NOT_OWNER) {
        this._clearDismantleAssignment(creep);
        return false;
    }

    return true;
};

module.exports = defense;
