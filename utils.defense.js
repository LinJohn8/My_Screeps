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

        var stats = require('utils.stats');
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
        var roadUtils = require('utils.road');
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
        var roadUtils = require('utils.road');
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
        var roadUtils = require('utils.road');
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

module.exports = defense;
