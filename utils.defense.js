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
    planPerimeter: function (room) {
        var spawns = room.find(FIND_MY_SPAWNS);
        if (spawns.length === 0) return;

        var cx = spawns[0].pos.x;
        var cy = spawns[0].pos.y;
        var radius = 6;
        var placed = 0;

        // 在矩形环上建墙（简化实现：只建四个角 + 关键路径）
        // 更精确的做法是算一个圆环
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
                    }
                    if (l.type === 'constructionSite') {
                        blocked = true;
                        break;
                    }
                }
                if (blocked) continue;

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

module.exports = defense;
