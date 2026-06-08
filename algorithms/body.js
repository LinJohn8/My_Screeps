var bodyAlgorithm = {
    minBody: function (role) {
        switch (role) {
            case 'harvester': return [WORK, CARRY, MOVE];
            case 'upgrader': return [WORK, CARRY, MOVE];
            case 'builder': return [WORK, CARRY, MOVE];
            case 'repairer': return [WORK, CARRY, MOVE];
            case 'soldier': return [TOUGH, ATTACK, MOVE, MOVE];
            case 'scout': return [MOVE];
            case 'observer': return [MOVE, MOVE, MOVE];
            case 'remoteMiner': return [WORK, CARRY, MOVE, MOVE];
            default: return [WORK, CARRY, MOVE];
        }
    },

    getBody: function (role, room) {
        var energy = room.energyAvailable;
        var base = this.minBody(role);

        switch (role) {
            case 'harvester':
                return this.grow(base, [WORK, CARRY, MOVE], energy, 50);
            case 'upgrader':
                return this.grow(base, [WORK, WORK, CARRY, MOVE], energy, 50);
            case 'builder':
                return this.grow(base, [WORK, CARRY, MOVE], energy, 50);
            case 'repairer':
                return this.grow(base, [WORK, CARRY, MOVE], energy, 50);
            case 'soldier':
                return this.grow(base, [TOUGH, ATTACK, MOVE], energy, 50);
            case 'scout':
                return this.grow(base, [MOVE], energy, 5);
            case 'observer':
                return this.grow(base, [MOVE], energy, 25);
            case 'remoteMiner':
                return this.grow(base, [WORK, WORK, CARRY, MOVE, MOVE], energy, 50);
        }

        return base;
    },

    grow: function (base, pattern, energy, maxParts) {
        var body = base.slice();
        var cost = this.cost(body);
        var patternCost = this.cost(pattern);

        while (cost + patternCost <= energy &&
                body.length + pattern.length <= maxParts &&
                body.length + pattern.length <= 50) {
            for (var i = 0; i < pattern.length; i++) body.push(pattern[i]);
            cost += patternCost;
        }

        return body;
    },

    cost: function (body) {
        var total = 0;
        for (var i = 0; i < body.length; i++) total += BODYPART_COST[body[i]];
        return total;
    }
};

module.exports = bodyAlgorithm;
