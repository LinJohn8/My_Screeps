var basePlanner = {
    run: function (room) {
        if (!room.controller || !room.controller.my) return;
        if (room.find(FIND_MY_CONSTRUCTION_SITES).length >= 8) return;

        this.planExtensions(room);
        this.planStorage(room);
    },

    planExtensions: function (room) {
        var wanted = this.allowed(room, STRUCTURE_EXTENSION);
        if (wanted <= 0) return;

        var current = this.count(room, STRUCTURE_EXTENSION);
        var missing = wanted - current;
        if (missing <= 0) return;

        var spawns = room.find(FIND_MY_SPAWNS);
        if (spawns.length === 0) return;

        var placed = this.placeAround(room, spawns[0].pos, STRUCTURE_EXTENSION, missing, 2, 7);
        if (placed > 0) {
            console.log('[plan] ' + room.name + ' extensions +' + placed);
        }
    },

    planStorage: function (room) {
        if (!room.controller || room.controller.level < 4) return;
        if (this.count(room, STRUCTURE_STORAGE) >= 1) return;

        var spawns = room.find(FIND_MY_SPAWNS);
        if (spawns.length === 0) return;

        var placed = this.placeAround(room, spawns[0].pos, STRUCTURE_STORAGE, 1, 2, 4);
        if (placed > 0) {
            console.log('[plan] ' + room.name + ' storage placed');
        }
    },

    placeAround: function (room, center, structureType, limit, minRadius, maxRadius) {
        var placed = 0;

        for (var radius = minRadius; radius <= maxRadius; radius++) {
            var positions = this.ringPositions(center, radius);
            for (var i = 0; i < positions.length; i++) {
                if (placed >= limit) return placed;
                var pos = positions[i];
                if (!this.canPlace(room, pos.x, pos.y, structureType)) continue;
                var result = room.createConstructionSite(pos.x, pos.y, structureType);
                if (result === OK) placed++;
                else if (result === ERR_FULL) return placed;
            }
        }

        return placed;
    },

    ringPositions: function (center, radius) {
        var result = [];
        for (var dx = -radius; dx <= radius; dx++) {
            for (var dy = -radius; dy <= radius; dy++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                var x = center.x + dx;
                var y = center.y + dy;
                if (x < 2 || x > 47 || y < 2 || y > 47) continue;
                result.push(new RoomPosition(x, y, center.roomName));
            }
        }
        return result;
    },

    canPlace: function (room, x, y, structureType) {
        if (room.getTerrain().get(x, y) === TERRAIN_MASK_WALL) return false;

        var look = room.lookAt(x, y);
        for (var i = 0; i < look.length; i++) {
            if (look[i].type === 'structure') return false;
            if (look[i].type === 'constructionSite') return false;
        }

        if (structureType !== STRUCTURE_ROAD) {
            var roads = room.lookForAt(LOOK_STRUCTURES, x, y);
            for (var ri = 0; ri < roads.length; ri++) {
                if (roads[ri].structureType === STRUCTURE_ROAD) return false;
            }
        }

        return true;
    },

    count: function (room, structureType) {
        var count = 0;
        var structures = room.find(FIND_MY_STRUCTURES, {
            filter: function (s) { return s.structureType === structureType; }
        });
        count += structures.length;

        var sites = room.find(FIND_MY_CONSTRUCTION_SITES, {
            filter: function (s) { return s.structureType === structureType; }
        });
        count += sites.length;

        return count;
    },

    allowed: function (room, structureType) {
        if (!room.controller) return 0;
        if (!CONTROLLER_STRUCTURES[structureType]) return 0;
        return CONTROLLER_STRUCTURES[structureType][room.controller.level] || 0;
    }
};

module.exports = basePlanner;
