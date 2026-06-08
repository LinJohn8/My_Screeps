var development = {
    update: function (room) {
        if (!room.memory.strategy) room.memory.strategy = {};

        var stage = this.getStage(room);
        var goals = this.getGoals(room, stage);

        room.memory.strategy.stage = stage;
        room.memory.strategy.goals = goals;
        room.memory.strategy.updated = Game.time;

        if (room.memory.strategy.lastPrintedStage !== stage) {
            room.memory.strategy.lastPrintedStage = stage;
            console.log('[stage] ' + room.name + ' -> ' + stage + ' goals=' + goals.join('|'));
        }

        return room.memory.strategy;
    },

    getStage: function (room) {
        var rcl = room.controller ? room.controller.level : 1;
        var energyCap = room.energyCapacityAvailable || room.energyAvailable;
        var hasStorage = room.storage && room.storage.my;

        if (rcl <= 1 || energyCap < 550) return 'bootstrap';
        if (rcl === 2) return 'settle';
        if (rcl <= 4 && !hasStorage) return 'infrastructure';
        if (rcl <= 6) return 'economy';
        return 'advanced';
    },

    getGoals: function (room, stage) {
        var goals = [];
        var sites = room.find(FIND_CONSTRUCTION_SITES).length;
        var rcl = room.controller ? room.controller.level : 1;

        if (stage === 'bootstrap') {
            goals.push('keep-harvesters-alive');
            goals.push('fill-spawn-and-extensions');
            goals.push('upgrade-to-rcl2');
        } else if (stage === 'settle') {
            goals.push('build-extensions');
            goals.push('roads-to-sources-controller');
            goals.push('scout-neighbors');
        } else if (stage === 'infrastructure') {
            goals.push('tower-and-repairer');
            goals.push('containers');
            goals.push('first-remote-mining');
            if (rcl >= 4) goals.push('storage');
        } else if (stage === 'economy') {
            goals.push('stable-remote-income');
            goals.push('walls-ramparts-maintenance');
            goals.push('prepare-advanced-logistics');
        } else {
            goals.push('high-rcl-upgrading');
            goals.push('fortify-and-expand');
            goals.push('reserve-or-claim-next-room');
        }

        if (sites > 0) goals.push('finish-sites:' + sites);
        if (room.memory.needDismantler &&
                Game.time - room.memory.needDismantler < 200) {
            goals.push('clear-obstacles');
        }

        return goals;
    }
};

module.exports = development;
