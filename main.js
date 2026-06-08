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
var roleRemoteMiner = require('role.remoteMiner');
var towerControl  = require('tower.control');
var roadUtils     = require('utils.road');
var roomStats     = require('utils.stats');
var roomDefense   = require('utils.defense');

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
            // --- 2a. 统计更新（每 tick） ---
            roomStats.update(room);

            // --- 2b. Tower 防御 ---
            towerControl.run(room);

            // --- 2c. 道路规划 + 防御工事 + 路障清理 ---
            if (Game.time % 100 === 0) {
                roadUtils.planRoads(room);

                // 先清理堵路的墙工地，再建新墙
                var blockingWalls = roomDefense.findWallsOnCriticalPaths(room);
                for (var bwi = 0; bwi < blockingWalls.length; bwi++) {
                    if (!blockingWalls[bwi].structureType) {
                        // 是工地 → 直接移除
                        blockingWalls[bwi].remove();
                    }
                }

                roomDefense.run(room);
                roomDefense.removeBlockedRoadSites(room);
                roomDefense.findBlockedRoadWalls(room);
            }

            // --- 2d. 检测入侵者 & 防御响应 ---
            checkHostiles(room);

            // --- 2e. 安全模式（极端威胁自动启动）---
            checkSafeMode(room);

            // --- 2f. 探索相邻房间 ---
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
                case 'observer':     roleObserver.run(creep);     break;
                case 'remoteMiner':  roleRemoteMiner.run(creep); break;
                default:
                    creep.memory.role = 'upgrader';
                    creep.memory.working = false;
                    break;
            }
        } catch (e) {
            console.log('❌ Creep [' + creep.name + '] 错误: ' + e.message);
        }
    }

    // ========== 5. 观察者回家 → 转换兵种 ==========
    for (var obsName in Game.creeps) {
        var obsCreep = Game.creeps[obsName];
        if (obsCreep.memory.role !== 'observer') continue;
        if (obsCreep.room.name !== obsCreep.memory.homeRoom) continue;

        // 只处理需要转换的状态: retreating(紧急撤退) 或 idle(全部探索完)
        if (obsCreep.memory.state !== 'retreating' && obsCreep.memory.state !== 'idle') continue;

        // 到家了 → 根据局势选择新兵种
        var homeRoom = obsCreep.room;
        var hostilesHere = homeRoom.memory.hostile && homeRoom.find(FIND_HOSTILE_CREEPS).length > 0;

        var newRole = pickConversionRole(obsCreep, hostilesHere);
        tryConvertOrSuicide(obsCreep, newRole);
    }

    // ========== 5b. 侦察兵卡住 → 回家转换 ==========
    for (var scName in Game.creeps) {
        var scCreep = Game.creeps[scName];
        if (scCreep.memory.role !== 'scout') continue;
        if (!scCreep.memory.convertAtHome) continue;
        if (scCreep.room.name !== scCreep.memory.homeRoom) continue;

        var newRole = pickConversionRole(scCreep,
            scCreep.room.memory.hostile && scCreep.room.find(FIND_HOSTILE_CREEPS).length > 0);
        tryConvertOrSuicide(scCreep, newRole);
    }

    // ========== 5c. 兜底: 在家的 scout 和卡住的 observer 全部转换 ==========
    for (var idleName in Game.creeps) {
        var idleCreep = Game.creeps[idleName];
        if (idleCreep.room.name !== idleCreep.memory.homeRoom) continue;

        // —— scout: 在家一律转换 ——
        if (idleCreep.memory.role === 'scout') {
            var newRole = pickConversionRole(idleCreep,
                idleCreep.room.memory.hostile && idleCreep.room.find(FIND_HOSTILE_CREEPS).length > 0);
            tryConvertOrSuicide(idleCreep, newRole);
            continue;
        }

        // —— observer: 在家超过 3 tick 还没离开 → 卡住，转换 ——
        if (idleCreep.memory.role === 'observer' && idleCreep.memory.state === 'exploring') {
            if (!idleCreep.memory.homeTicks) idleCreep.memory.homeTicks = 0;
            idleCreep.memory.homeTicks++;
            if (idleCreep.memory.homeTicks > 3) {
                var newRole = pickConversionRole(idleCreep,
                    idleCreep.room.memory.hostile && idleCreep.room.find(FIND_HOSTILE_CREEPS).length > 0);
                tryConvertOrSuicide(idleCreep, newRole);
            }
        }
    }

    // ========== 5d. 身体检查: 任何在家但身体不适合当前角色的 creeps 自杀 ==========
    for (var checkName in Game.creeps) {
        var checkCreep = Game.creeps[checkName];
        if (checkCreep.room.name !== checkCreep.memory.homeRoom) continue;

        var bodyTypes = {};
        for (var bi = 0; bi < checkCreep.body.length; bi++) {
            var bt = checkCreep.body[bi].type;
            bodyTypes[bt] = (bodyTypes[bt] || 0) + 1;
        }

        var badBody = false;
        switch (checkCreep.memory.role) {
            case 'harvester': badBody = !bodyTypes[WORK] || !bodyTypes[CARRY]; break;
            case 'builder':   badBody = !bodyTypes[WORK] || !bodyTypes[CARRY]; break;
            case 'repairer':  badBody = !bodyTypes[WORK] || !bodyTypes[CARRY]; break;
            case 'upgrader':  badBody = !bodyTypes[WORK]; break;
            case 'soldier':   badBody = !bodyTypes[ATTACK] && !bodyTypes[RANGED_ATTACK]; break;
        }

        if (badBody) {
            console.log('💀 [自杀] ' + checkCreep.name + ' ' + checkCreep.memory.role + ' 缺必要部件，自杀重建');
            checkCreep.suicide();
        }
    }

    // ========== 6. 状态摘要（每 30 tick 打印一次） ==========
    if (Game.time % 30 === 0) {
        // 逐房间打印
        for (var rmName in Game.rooms) {
            var rm = Game.rooms[rmName];
            if (!rm.controller || !rm.controller.my) continue;

            // 第一行: 汇总
            var roles = {};
            var roomCreeps = [];
            for (var n in Game.creeps) {
                if (Game.creeps[n].room.name !== rmName) continue;
                var r = Game.creeps[n].memory.role;
                roles[r] = (roles[r] || 0) + 1;
                roomCreeps.push(Game.creeps[n]);
            }

            var line = '📊 [' + rmName + '] ';
            for (var k in roles) line += k + ':' + roles[k] + ' ';

            var st = rm.memory.stats;
            if (st) {
                var pct = Math.floor((st.energyStored / (st.energyCapacity || 1)) * 100);
                line += '⚡' + pct + '%';
                if (st.constructionSites > 0) line += ' 🏗️' + st.constructionSites;
            }
            if (rm.memory.hostile) line += ' ⚔️!';
            console.log(line);

            // 第二行起: 每个 creep 在干嘛
            for (var ci = 0; ci < roomCreeps.length; ci++) {
                var c = roomCreeps[ci];
                var status = c.memory.status || (c.memory.working ? '工作中' : '准备中');
                var pos = c.pos.x + ',' + c.pos.y;
                console.log('   ' + c.name.slice(-12) + ' [' + c.memory.role + '] ' + status + ' @' + pos);
            }
        }
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
//  🛡️ 安全模式（极端威胁底线防御）
// ================================================================
function checkSafeMode(room) {
    if (!room.controller || !room.controller.my) return;
    if (room.controller.safeMode <= 0) return;
    if (room.controller.safeModeAvailable <= 0) return;

    // 防抖：每 1000 tick 最多触发一次
    if (room.memory.lastSafeMode && Game.time - room.memory.lastSafeMode < 1000) return;

    // 威胁等级 > 15 且我方明显劣势时触发
    var threat = room.memory.threatLevel || 0;
    if (threat < 15) return;

    var myCreeps = room.find(FIND_MY_CREEPS);
    var soldiers = 0;
    for (var i = 0; i < myCreeps.length; i++) {
        if (myCreeps[i].memory.role === 'soldier') soldiers++;
    }

    // 有 soldier 且数量够多，不启动安全模式
    if (soldiers >= Math.ceil(threat / 5)) return;

    console.log('🛡️ [' + room.name + '] 威胁等级 ' + threat + '，启动安全模式!');
    var result = room.controller.activateSafeMode();
    if (result === OK) {
        room.memory.lastSafeMode = Game.time;
    }
}


// ================================================================
//  🔄 观察者转换兵种选择（根据房间需求）
// ================================================================
function pickConversionRole(creep, hostilesHere) {
    if (hostilesHere) return 'soldier';

    var room = creep.room;
    var counts = {};
    for (var name in Game.creeps) {
        var r = Game.creeps[name].memory.role;
        counts[r] = (counts[r] || 0) + 1;
    }

    // 缺采集者 → 变采集者
    if ((counts.harvester || 0) < 2) return 'harvester';

    // 有建筑工地 → 变建造者
    var sites = room.find(FIND_CONSTRUCTION_SITES);
    if (sites.length > 0 && (counts.builder || 0) < 1) return 'builder';

    // 默认变升级者
    return 'upgrader';
}

/**
 * 检查 creep 身体是否有执行某角色所需的基础部件
 * 没有的话转换了也白搭 → 直接自杀让 spawn 重新造
 */
function tryConvertOrSuicide(creep, newRole) {
    // 检查身体部件
    var hasPart = function (type) {
        for (var i = 0; i < creep.body.length; i++) {
            if (creep.body[i].type === type) return true;
        }
        return false;
    };

    var canDo = true;
    switch (newRole) {
        case 'harvester': canDo = hasPart(WORK) && hasPart(CARRY); break;
        case 'builder':   canDo = hasPart(WORK) && hasPart(CARRY); break;
        case 'repairer':  canDo = hasPart(WORK) && hasPart(CARRY); break;
        case 'upgrader':  canDo = hasPart(WORK); break;
        case 'soldier':   canDo = hasPart(ATTACK) || hasPart(RANGED_ATTACK); break;
    }

    if (canDo) {
        creep.memory.role = newRole;
        creep.memory.working = (newRole === 'soldier');
        console.log('🔄 [转换] ' + creep.name + '→' + newRole);
    } else {
        // 身体不适合 → 自杀，孵化系统会造合适的
        creep.suicide();
        console.log('💀 [自杀] ' + creep.name + ' 身体(' + creep.body.map(function(b){return b.type;}).join(',') + ')不适合当' + newRole);
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

        // 跳过已知无法到达的房间
        if (Memory.unreachableRooms && Memory.unreachableRooms[neighborRoom]) continue;

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
    counts.remoteMiner = counts.remoteMiner || 0;

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

    targets.scout = 0;  // 已废弃
    targets.observer = 0; // 已废弃（当前房间出口不通）

    // ========== 能量预算约束 ==========
    var budgetLevel = roomStats.getBudgetLevel(room);
    if (budgetLevel === 'red') {
        // 红线 → 只孵士兵
        targets.harvester = 0;
        targets.upgrader = 0;
        targets.builder = 0;
        targets.repairer = 0;
        targets.scout = 0;
        targets.observer = 0;
        targets.remoteMiner = 0;
    } else if (budgetLevel === 'yellow') {
        // 黄线 → 减少非关键角色
        targets.builder = Math.min(targets.builder, 1);
    }

    // ========== 远程采集（本地能量不足时） ==========
    var budgetRatio = 0;
    var stats = room.memory.stats;
    if (stats && stats.energyCapacity > 0) {
        budgetRatio = stats.energyStored / stats.energyCapacity;
    }
    if (budgetRatio < 0.4 && counts.remoteMiner < 2 && targets.harvester > 0) {
        // 能量不足 → 找最近的资源房间派远程矿工
        var remoteRoom = pickRemoteRoom(room);
        if (remoteRoom) {
            room.memory.remoteTarget = remoteRoom;
            targets.remoteMiner = 1;
        } else {
            targets.remoteMiner = 0;
        }
    } else {
        targets.remoteMiner = 0;
    }

    // ========== 优先级 ==========
    var priorityOrder = ['soldier', 'harvester', 'remoteMiner', 'builder', 'repairer', 'upgrader'];

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

    // 如果是观察者，设置初始内存（不设 state，让 role.observer 的 _init 来处理）
    if (selectedRole === 'observer') {
        creepMemory.lastHits = undefined;
    }

    // 如果是远程矿工，设置目标房间
    if (selectedRole === 'remoteMiner') {
        creepMemory.targetRoom = room.memory.remoteTarget;
    }

    var result = spawn.spawnCreep(body, creepName, {
        memory: creepMemory
    });

    if (result === OK) {
        console.log('🛠 孵化 [' + selectedRole + '] ' + creepName + ' 能耗=' + cost);
        roomStats.recordSpend(room, cost);
    } else if (result !== ERR_NOT_ENOUGH_ENERGY) {
        console.log('⚠ 孵化失败 [' + selectedRole + ']: ' + errStr(result));
    }
}


// ================================================================
//  🗺️ 远程房间选择
// ================================================================
function pickRemoteRoom(room) {
    var roomScout = Memory.roomScout || {};
    var homeRoom = room.name;
    var bestRoom = null;
    var bestDist = 99;

    for (var name in roomScout) {
        var info = roomScout[name];
        // 必须有能量源、没主人（中立房间）、没敌人
        if (!info.sources || info.sources < 1) continue;
        if (info.owner) continue;  // 有主人的房间不去（避免冲突）
        if (info.hostiles && info.hostiles > 0) continue;

        // 计算距离
        var route = Game.map.findRoute(homeRoom, name);
        if (route === ERR_NO_PATH) continue;
        var dist = route.length;

        if (dist < bestDist) {
            bestDist = dist;
            bestRoom = name;
        }
    }

    return bestRoom;
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
        case 'observer':     return [MOVE, MOVE, MOVE];
        case 'remoteMiner':  return [WORK, CARRY, MOVE, MOVE];
        default:             return [WORK, CARRY, MOVE];
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
        case 'remoteMiner':
            while (extra >= 150 && base.length < 25) { base.push(WORK, CARRY, MOVE, MOVE); extra -= 150; }
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
