// ================================================================
//  Screeps 完整自动化脚本 — 探索 / 建造 / 升级 / 防御 / 攻击
// ================================================================

var roleHarvester = require('role.harvester');
var roleUpgrader  = require('role.upgrader');
var roleBuilder   = require('role.builder');
var roleRepairer  = require('role.repairer');
var roleSoldier   = require('role.soldier');
var roleScout     = require('role.scout');
var roleObserver  = require('role.observer');
var towerControl  = require('tower.control');
var roadUtils     = require('utils.road');

module.exports.loop = function () {

    // ========== 1. 清理死亡 Creep 内存 ==========
    for (var name in Memory.creeps) {
        if (!Game.creeps[name]) {
            delete Memory.creeps[name];
        }
    }

    // ========== 2. 遍历我的每个房间 ==========
    for (var roomName in Game.rooms) {
        var room = Game.rooms[roomName];
        if (!room.controller || !room.controller.my) continue;

        try {
            // --- 2a. Tower 防御 ---
            towerControl.run(room);

            // --- 2b. 道路规划 ---
            if (Game.time % 100 === 0) {
                roadUtils.planRoads(room);
            }

            // --- 2c. 检测入侵者 & 防御响应 ---
            checkHostiles(room);

            // --- 2d. 探索相邻房间 ---
            if (Game.time % 50 === 0) {
                checkExploration(room);
            }

        } catch (e) {
            console.log('❌ 房间错误 [' + roomName + ']: ' + e.message);
        }
    }

    // ========== 3. 自动孵化管理 ==========
    for (var spawnName in Game.spawns) {
        var spawn = Game.spawns[spawnName];
        if (!spawn) continue;
        if (spawn.spawning) continue;
        try {
            manageSpawning(spawn);
        } catch (e) {
            console.log('❌ 孵化错误 [' + spawnName + ']: ' + e.message);
        }
    }

    // ========== 4. 执行所有 Creep 角色 ==========
    for (var name in Game.creeps) {
        var creep = Game.creeps[name];
        try {
            switch (creep.memory.role) {
                case 'harvester': roleHarvester.run(creep); break;
                case 'upgrader':  roleUpgrader.run(creep);  break;
                case 'builder':   roleBuilder.run(creep);   break;
                case 'repairer':  roleRepairer.run(creep);  break;
                case 'soldier':   roleSoldier.run(creep);   break;
                case 'scout':     roleScout.run(creep);     break;
                case 'observer':  roleObserver.run(creep);  break;
                default:
                    creep.memory.role = 'upgrader';
                    creep.memory.working = false;
                    break;
            }
        } catch (e) {
            console.log('❌ Creep [' + creep.name + '] 错误: ' + e.message);
        }
    }

    // ========== 5. 观察者撤退 → 转换兵种 ==========
    for (var obsName in Game.creeps) {
        var obsCreep = Game.creeps[obsName];
        if (obsCreep.memory.role !== 'observer') continue;
        if (obsCreep.memory.state !== 'retreating') continue;
        if (obsCreep.room.name !== obsCreep.memory.homeRoom) continue;

        // 到家了 → 根据局势转换
        var homeRoom = obsCreep.room;
        var hostilesHere = homeRoom.memory.hostile && homeRoom.find(FIND_HOSTILE_CREEPS).length > 0;

        if (hostilesHere) {
            obsCreep.memory.role = 'soldier';
            obsCreep.memory.working = true;
            console.log('🔄 [转换] ' + obsCreep.name + ' 观察者→士兵 (家园防御)');
        } else {
            obsCreep.memory.role = 'upgrader';
            obsCreep.memory.working = false;
            console.log('🔄 [转换] ' + obsCreep.name + ' 观察者→升级者 (待命)');
        }
    }

    // ========== 6. 战报摘要（每 20 tick 打印一次） ==========
    if (Game.time % 20 === 0) {
        var roles = {};
        for (var n in Game.creeps) {
            var r = Game.creeps[n].memory.role;
            roles[r] = (roles[r] || 0) + 1;
        }
        var info = '📊 ';
        for (var k in roles) info += k + ':' + roles[k] + ' ';
        console.log(info);
    }
};


// ================================================================
//  🛡️ 防御检测
// ================================================================
function checkHostiles(room) {
    var hostiles = room.find(FIND_HOSTILE_CREEPS);
    if (hostiles.length === 0) {
        room.memory.hostile = false;
        return;
    }

    room.memory.hostile = true;

    var threatLevel = 0;
    for (var i = 0; i < hostiles.length; i++) {
        var hp = hostiles[i];
        var attackParts = 0;
        var healParts = 0;
        for (var j = 0; j < hp.body.length; j++) {
            if (hp.body[j].type === ATTACK || hp.body[j].type === RANGED_ATTACK) attackParts++;
            if (hp.body[j].type === HEAL) healParts++;
        }
        threatLevel += attackParts + healParts * 2;
    }

    room.memory.threatLevel = threatLevel;

    if (Game.time % 10 === 0) {
        console.log('⚠️ 发现入侵者! 威胁等级: ' + threatLevel + ' 数量: ' + hostiles.length);
    }
}


// ================================================================
//  🗺️ 探索管理
// ================================================================
function checkExploration(room) {
    if (!Memory.explored) Memory.explored = {};

    var exits = Game.map.describeExits(room.name);
    for (var dir in exits) {
        var neighborRoom = exits[dir];
        if (!Memory.explored[neighborRoom]) {
            room.memory.exploreTarget = neighborRoom;
            return;
        }
    }
}


// ================================================================
//  🐣 孵化管理
// ================================================================
function manageSpawning(spawn) {
    var room = spawn.room;
    var energy = room.energyAvailable;
    var rcl = room.controller.level;

    var counts = {};
    for (var name in Game.creeps) {
        var r = Game.creeps[name].memory.role;
        counts[r] = (counts[r] || 0) + 1;
    }
    counts.harvester = counts.harvester || 0;
    counts.upgrader  = counts.upgrader  || 0;
    counts.builder   = counts.builder   || 0;
    counts.repairer  = counts.repairer  || 0;
    counts.soldier   = counts.soldier   || 0;
    counts.scout     = counts.scout     || 0;
    counts.observer  = counts.observer  || 0;

    // ========== 目标数量 ==========
    var targets = {};

    targets.harvester = rcl <= 2 ? 3 : (rcl <= 4 ? 2 : 1);
    targets.upgrader = rcl <= 2 ? 2 : (rcl <= 4 ? 3 : 2);

    var sites = room.find(FIND_CONSTRUCTION_SITES);
    targets.builder = sites.length > 0 ? (rcl <= 3 ? 1 : 2) : 0;
    targets.repairer = rcl >= 3 ? 1 : 0;

    if (room.memory.hostile && room.memory.threatLevel > 0) {
        targets.soldier = room.memory.threatLevel <= 5 ? 1 : 2;
    } else {
        targets.soldier = 0;
    }

    targets.scout = 0;
    if (counts.scout < 1 && room.memory.exploreTarget) {
        targets.scout = 1;
    }

    // 观察者: 1-4 个，负责远行侦察
    // 注意: 观察者撤退回家后会被转换成其他兵种，所以需要持续补充
    var observerMax = 4;
    // 有入侵时不孵观察者，省能量给士兵
    if (room.memory.hostile) {
        targets.observer = 0;
    } else {
        targets.observer = Math.min(observerMax, Math.max(1, Math.floor(rcl / 2)));
    }

    // ========== 优先级 ==========
    var priorityOrder = ['soldier', 'observer', 'scout', 'harvester', 'builder', 'repairer', 'upgrader'];

    var selectedRole = null;
    for (var pi = 0; pi < priorityOrder.length; pi++) {
        var role = priorityOrder[pi];
        var current = counts[role] || 0;
        if (current < targets[role]) {
            selectedRole = role;
            break;
        }
    }

    if (!selectedRole) return;

    // ========== 身体部件 ==========
    var body = getBodyForRole(selectedRole, room);
    var cost = calcBodyCost(body);

    // 特别处理 scout
    if (selectedRole === 'scout') {
        body = [MOVE, MOVE];
        cost = 100;
        if (cost > energy) body = [MOVE];
    }

    // 观察者: 快速移动单位，保底 MOVE × 3，有能量加更多 MOVE
    if (selectedRole === 'observer') {
        body = getMinBody('observer');
        cost = calcBodyCost(body);
        var extraEnergy = energy - cost;
        while (extraEnergy >= 50 && body.length < 25) {
            body.push(MOVE);
            extraEnergy -= 50;
        }
        cost = calcBodyCost(body);
        if (cost > energy) {
            body = [MOVE, MOVE];
            cost = 100;
            if (cost > energy) { body = [MOVE]; cost = 50; }
            if (cost > energy) return;
        }
    }

    if (cost > energy) {
        body = getMinBody(selectedRole);
        cost = calcBodyCost(body);
        if (cost > energy) return;
    }

    var creepName = selectedRole + '_' + Game.time + '_' + Math.floor(Math.random() * 999);

    // 构建 memory
    var creepMemory = {
        role: selectedRole,
        working: false,
        homeRoom: room.name
    };

    // 如果是采集者，分配固定的能量源（防止反复横跳）
    if (selectedRole === 'harvester') {
        creepMemory.sourceId = assignHarvesterSource(room);
    }

    // 如果是观察者，设置初始状态和巡逻目标
    if (selectedRole === 'observer') {
        creepMemory.state = 'observing';
        creepMemory.lastHits = undefined;
        // targetRoom 会在 role.observer 第一次 run 时自动分配
    }

    var result = spawn.spawnCreep(body, creepName, {
        memory: creepMemory
    });

    if (result === OK) {
        console.log('🛠 孵化 [' + selectedRole + '] ' + creepName + ' 能耗=' + cost);
    } else if (result !== ERR_NOT_ENOUGH_ENERGY) {
        console.log('⚠ 孵化失败 [' + selectedRole + ']: ' + errStr(result));
    }
}


// ================================================================
//  🧬 身体部件配置
// ================================================================

function getMinBody(role) {
    switch (role) {
        case 'harvester': return [WORK, CARRY, MOVE];
        case 'upgrader':  return [WORK, CARRY, MOVE];
        case 'builder':   return [WORK, CARRY, MOVE];
        case 'repairer':  return [WORK, CARRY, MOVE];
        case 'soldier':   return [ATTACK, MOVE, MOVE];
        case 'scout':     return [MOVE];
        case 'observer':  return [MOVE, MOVE, MOVE];
        default:          return [WORK, CARRY, MOVE];
    }
}

function getBodyForRole(role, room) {
    var base = getMinBody(role);
    var energy = room.energyAvailable;
    var baseCost = calcBodyCost(base);
    var extra = energy - baseCost;
    if (extra < 50) return base;

    switch (role) {
        case 'harvester':
            while (extra >= 150 && base.length < 25) { base.push(WORK, CARRY, MOVE); extra -= 150; }
            break;
        case 'upgrader':
            while (extra >= 100 && base.length < 25) { base.push(WORK, MOVE); extra -= 100; }
            break;
        case 'builder':
            while (extra >= 150 && base.length < 25) { base.push(WORK, CARRY, MOVE); extra -= 150; }
            break;
        case 'repairer':
            while (extra >= 150 && base.length < 25) { base.push(WORK, CARRY, MOVE); extra -= 150; }
            break;
        case 'soldier':
            while (extra >= 130 && base.length < 25) { base.push(ATTACK, MOVE); extra -= 130; }
            break;
        case 'observer':
            while (extra >= 50 && base.length < 25) { base.push(MOVE); extra -= 50; }
            break;
    }
    return base;
}

function calcBodyCost(body) {
    var c = 0;
    for (var i = 0; i < body.length; i++) c += BODYPART_COST[body[i]];
    return c;
}


// ================================================================
//  ⛏️ 能量源分配（防止采集者反复横跳）
// ================================================================
function assignHarvesterSource(room) {
    var sources = room.find(FIND_SOURCES);
    if (sources.length === 0) return null;

    // 统计每个源当前有多少采集者
    var sourceCounts = {};
    for (var name in Game.creeps) {
        var c = Game.creeps[name];
        if (c.memory.role === 'harvester' && c.memory.sourceId) {
            if (c.room.name === room.name) {
                sourceCounts[c.memory.sourceId] = (sourceCounts[c.memory.sourceId] || 0) + 1;
            }
        }
    }

    // 找采集者最少的源
    var bestSource = sources[0];
    var minCount = 99999;
    for (var i = 0; i < sources.length; i++) {
        var sid = sources[i].id;
        var count = sourceCounts[sid] || 0;
        if (count < minCount) {
            minCount = count;
            bestSource = sources[i];
        }
    }

    return bestSource.id;
}


// ================================================================
//  工具函数
// ================================================================
function errStr(code) {
    var map = {
        '-1': 'NOT_OWNER', '-2': 'NO_PATH', '-3': 'NAME_EXISTS',
        '-4': 'BUSY', '-6': 'NOT_ENOUGH_ENERGY', '-7': 'INVALID_TARGET',
        '-8': 'FULL', '-9': 'NOT_IN_RANGE', '-14': 'NO_BODYPART'
    };
    return map[String(code)] || String(code);
}
