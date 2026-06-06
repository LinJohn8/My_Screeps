/**
 * 🛤️ 自动修路系统
 *
 * 连接: Spawn ↔ 能量源 ↔ Controller
 * 自动在能量源旁放 Container
 */
var roadUtils = {

    planRoads: function (room) {
        if (!room.controller || !room.controller.my) return;

        var spawns = room.find(FIND_MY_SPAWNS);
        if (spawns.length === 0) return;

        var spawnPos = spawns[0].pos;
        var controllerPos = room.controller.pos;
        var sources = room.find(FIND_SOURCES);
        var minerals = room.find(FIND_MINERALS);

        var keyPoints = [spawnPos, controllerPos];

        for (var i = 0; i < sources.length; i++) {
            var sourcePos = sources[i].pos;
            var surrounding = [
                { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
                { dx: -1, dy: 0 },                      { dx: 1, dy: 0 },
                { dx: -1, dy: 1 },  { dx: 0, dy: 1 },  { dx: 1, dy: 1 }
            ];
            for (var si = 0; si < surrounding.length; si++) {
                var nx = sourcePos.x + surrounding[si].dx;
                var ny = sourcePos.y + surrounding[si].dy;
                var terrain = room.getTerrain().get(nx, ny);
                if (terrain !== TERRAIN_MASK_WALL) {
                    keyPoints.push(new RoomPosition(nx, ny, room.name));
                    break;
                }
            }
        }

        if (minerals.length > 0) {
            keyPoints.push(minerals[0].pos);
        }

        // 连接所有关键点
        for (var pi = 0; pi < keyPoints.length; pi++) {
            for (var pj = pi + 1; pj < keyPoints.length; pj++) {
                var from = keyPoints[pi];
                var to = keyPoints[pj];
                if (from.getRangeTo(to) < 3) continue;
                buildRoadBetween(room, from, to);
            }
        }

        // 在能量源旁放 Container
        for (var si2 = 0; si2 < sources.length; si2++) {
            tryPlaceContainer(room, sources[si2]);
        }
    }
};

function buildRoadBetween(room, fromPos, toPos) {
    var path = PathFinder.search(fromPos, { pos: toPos, range: 1 }, {
        roomCallback: function (roomName) {
            var roomTerrain = Game.map.getRoomTerrain(roomName);
            var costs = new PathFinder.CostMatrix();

            for (var x = 0; x < 50; x++) {
                for (var y = 0; y < 50; y++) {
                    var terrain = roomTerrain.get(x, y);
                    if (terrain === TERRAIN_MASK_WALL) {
                        costs.set(x, y, 0xff);
                    } else {
                        costs.set(x, y, 1);
                    }
                }
            }

            var structures = room.find(FIND_STRUCTURES);
            for (var i = 0; i < structures.length; i++) {
                var s2 = structures[i];
                if (s2.structureType === STRUCTURE_ROAD) continue;
                if (s2.structureType === STRUCTURE_SPAWN ||
                    s2.structureType === STRUCTURE_EXTENSION ||
                    s2.structureType === STRUCTURE_TOWER ||
                    s2.structureType === STRUCTURE_CONTAINER ||
                    s2.structureType === STRUCTURE_STORAGE) {
                    costs.set(s2.pos.x, s2.pos.y, 0xff);
                }
            }

            return costs;
        },
        plainCost: 1,
        swampCost: 5,
        maxOps: 2000
    });

    if (path.incomplete) {
        var simplePath = fromPos.findPathTo(toPos, { ignoreCreeps: true });
        path.path = simplePath;
    }

    var placed = 0;
    for (var i = 0; i < path.path.length; i++) {
        var pos = path.path[i];
        if (pos.x === undefined) pos = path.path[i];

        var structures = room.lookForAt(LOOK_STRUCTURES, pos.x, pos.y);
        var hasRoad = false, blocked = false;

        for (var si = 0; si < structures.length; si++) {
            if (structures[si].structureType === STRUCTURE_ROAD) { hasRoad = true; break; }
            if (structures[si].structureType === STRUCTURE_SPAWN ||
                structures[si].structureType === STRUCTURE_EXTENSION ||
                structures[si].structureType === STRUCTURE_TOWER ||
                structures[si].structureType === STRUCTURE_WALL ||
                structures[si].structureType === STRUCTURE_RAMPART) { blocked = true; break; }
        }

        if (!hasRoad && !blocked) {
            var terrain = room.getTerrain().get(pos.x, pos.y);
            if (terrain !== TERRAIN_MASK_WALL) {
                if (room.createConstructionSite(pos.x, pos.y, STRUCTURE_ROAD) === OK) {
                    placed++;
                }
            }
        }
    }

    if (placed > 0 && Game.time % 100 === 0) {
        console.log('🛤️ [' + room.name + '] 铺设了 ' + placed + ' 段道路');
    }
}

function tryPlaceContainer(room, source) {
    var containers = room.find(FIND_STRUCTURES, {
        filter: function (s) {
            return s.structureType === STRUCTURE_CONTAINER && s.pos.getRangeTo(source) <= 2;
        }
    });
    if (containers.length > 0) return;

    var sites = room.find(FIND_CONSTRUCTION_SITES, {
        filter: function (s) {
            return s.structureType === STRUCTURE_CONTAINER && s.pos.getRangeTo(source) <= 2;
        }
    });
    if (sites.length > 0) return;

    var positions = [
        { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
        { dx: -1, dy: 0 },                      { dx: 1, dy: 0 },
        { dx: -1, dy: 1 },  { dx: 0, dy: 1 },  { dx: 1, dy: 1 }
    ];

    for (var i = 0; i < positions.length; i++) {
        var px = source.pos.x + positions[i].dx;
        var py = source.pos.y + positions[i].dy;
        var terrain = room.getTerrain().get(px, py);
        if (terrain === TERRAIN_MASK_WALL) continue;

        var look = room.lookAt(px, py);
        var blocked = false;
        for (var li = 0; li < look.length; li++) {
            if (look[li].type === 'structure' || look[li].type === 'constructionSite') {
                blocked = true;
                break;
            }
        }
        if (!blocked) {
            if (room.createConstructionSite(px, py, STRUCTURE_CONTAINER) === OK) {
                console.log('📦 [' + room.name + '] 能量源旁放置 Container');
                return;
            }
        }
    }
}

module.exports = roadUtils;
