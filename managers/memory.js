var memoryManager = {
    run: function () {
        if (!Memory.creeps) Memory.creeps = {};
        if (!Memory.rooms) Memory.rooms = {};
        if (!Memory.empire) Memory.empire = {};

        for (var name in Memory.creeps) {
            if (!Game.creeps[name]) delete Memory.creeps[name];
        }

        if (!Memory.obstacles) Memory.obstacles = {};
        if (!Memory.unreachableRooms) Memory.unreachableRooms = {};
        if (!Memory.explored) Memory.explored = {};
        if (!Memory.roomScout) Memory.roomScout = {};
    }
};

module.exports = memoryManager;
