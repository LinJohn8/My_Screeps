// ================================================================
//  Screeps 主循环
//
//  main 只负责编排:
//    memory -> room -> spawn -> creep
//  具体阶段规划、人口策略、身体算法、移动/拆墙/建筑规划都在独立模块里。
// ================================================================

var memoryManager = require('./managers/memory');
var roomManager = require('./managers/room');
var spawnManager = require('./managers/spawn');
var creepManager = require('./managers/creep');

module.exports.loop = function () {
    memoryManager.run();
    roomManager.runAll();
    spawnManager.runAll();
    creepManager.runAll();
};
