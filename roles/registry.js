var registry = {
    roles: {
        harvester: require('./harvester'),
        upgrader: require('./upgrader'),
        builder: require('./builder'),
        repairer: require('./repairer'),
        soldier: require('./soldier'),
        scout: require('./scout'),
        observer: require('./observer'),
        remoteMiner: require('./remoteMiner')
    },

    requirements: {
        harvester: [WORK, CARRY, MOVE],
        upgrader: [WORK, MOVE],
        builder: [WORK, CARRY, MOVE],
        repairer: [WORK, CARRY, MOVE],
        soldier: ['attackOrRanged', MOVE],
        scout: [MOVE],
        observer: [MOVE],
        remoteMiner: [WORK, CARRY, MOVE]
    },

    run: function (creep) {
        var role = creep.memory.role || 'upgrader';
        var module = this.roles[role];
        if (!module) {
            creep.memory.role = 'upgrader';
            creep.memory.working = false;
            module = this.roles.upgrader;
        }
        module.run(creep);
    },

    hasRequiredBody: function (creep, role) {
        var req = this.requirements[role] || this.requirements.upgrader;
        for (var i = 0; i < req.length; i++) {
            if (req[i] === 'attackOrRanged') {
                if (creep.getActiveBodyparts(ATTACK) <= 0 &&
                        creep.getActiveBodyparts(RANGED_ATTACK) <= 0) {
                    return false;
                }
                continue;
            }
            if (creep.getActiveBodyparts(req[i]) <= 0) return false;
        }
        return true;
    }
};

module.exports = registry;
