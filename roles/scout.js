/**
 * 🗺️ 侦察兵 — 探索未知房间 → 卡住就回家转兵种
 *
 * 行为: 出生 → 走向目标房间 → 到达后记录信息 → 下一个
 *       无法到达（ERR_NO_PATH）→ 标记房间不可达 → 回家转换
 */
var movement = require('../utils/movement');

var roleScout = {

    run: function (creep) {

        // 有回家转换标记 → 往老家走
        if (creep.memory.convertAtHome) {
            if (creep.room.name === creep.memory.homeRoom) {
                // 到家了，等 main.js 处理转换
                return;
            }
            this._goHome(creep);
            return;
        }

        // 设置探索目标（跳过已知不可达的房间）
        if (!creep.memory.scoutTarget) {
            this._pickTarget(creep);
        }

        var target = creep.memory.scoutTarget;
        if (!target) {
            // 没有可探索的房间了 → 回家转换
            creep.memory.convertAtHome = true;
            this._goHome(creep);
            return;
        }

        // 到达目标房间
        if (creep.room.name === target) {
            exploreRoom(creep, target);

            if (!Memory.explored) Memory.explored = {};
            Memory.explored[target] = true;
            creep.memory.scoutTarget = null;

            // 尝试从当前房间继续延伸
            var nextExits = Game.map.describeExits(target);
            if (nextExits) {
                for (var d in nextExits) {
                    var nb = nextExits[d];
                    // 跳过不可达和已探索的房间
                    if (Memory.unreachableRooms && Memory.unreachableRooms[nb]) continue;
                    if (Memory.roomScout && Memory.roomScout[nb] &&
                            Memory.roomScout[nb].hostiles > 0) continue;
                    if (!Memory.explored || !Memory.explored[nb]) {
                        creep.memory.scoutTarget = nb;
                        return;
                    }
                }
            }
            // 没有新房间可探 → 回家转换
            creep.memory.convertAtHome = true;
            this._goHome(creep);
            return;
        }

        // 走向目标
        var err = movement.moveToRoom(creep, target, {
            visualizePathStyle: { stroke: '#ff00ff' },
            reusePath: 50,
            maxRooms: 10,
            reason: 'scout'
        });

        // ERR_BUSY = 正在出生，忽略
        if (err === ERR_BUSY) return;

        var stuck = creep.memory.moveState ? (creep.memory.moveState.stuck || 0) : 0;
        if (err === ERR_NO_PATH || stuck > 25) {
            // 无法到达 → 标记 + 回家转换
            if (!Memory.unreachableRooms) Memory.unreachableRooms = {};
            Memory.unreachableRooms[target] = Game.time;
            console.log('⚠ [侦察] ' + creep.name + ' 无法到达/长期卡住 ' + target + '，回家转换');
            creep.memory.scoutTarget = null;
            creep.memory.convertAtHome = true;
            this._goHome(creep);
        }
    },

    _pickTarget: function (creep) {
        var homeRoom = creep.memory.homeRoom;
        if (!homeRoom) return;

        // 优先用主循环设置的 exploreTarget
        if (Memory.rooms && Memory.rooms[homeRoom] && Memory.rooms[homeRoom].exploreTarget) {
            var et = Memory.rooms[homeRoom].exploreTarget;
            if ((!Memory.unreachableRooms || !Memory.unreachableRooms[et]) &&
                    (!Memory.roomScout || !Memory.roomScout[et] ||
                     !Memory.roomScout[et].hostiles || Memory.roomScout[et].hostiles <= 0)) {
                creep.memory.scoutTarget = et;
                return;
            }
        }

        // 扫描老家出口
        var exits = Game.map.describeExits(homeRoom);
        if (exits) {
            for (var dir in exits) {
                var neighbor = exits[dir];
                if (Memory.unreachableRooms && Memory.unreachableRooms[neighbor]) continue;
                if (Memory.roomScout && Memory.roomScout[neighbor] &&
                        Memory.roomScout[neighbor].hostiles > 0) continue;
                if (!Memory.explored || !Memory.explored[neighbor]) {
                    creep.memory.scoutTarget = neighbor;
                    return;
                }
            }
        }

        // 所有相邻都探过了 → 尝试更远的房间
        if (exits) {
            for (var dir2 in exits) {
                var nb2 = exits[dir2];
                var nbExits = Game.map.describeExits(nb2);
                if (nbExits) {
                    for (var d2 in nbExits) {
                        var farRoom = nbExits[d2];
                        if (Memory.unreachableRooms && Memory.unreachableRooms[farRoom]) continue;
                        if (Memory.roomScout && Memory.roomScout[farRoom] &&
                                Memory.roomScout[farRoom].hostiles > 0) continue;
                        if (!Memory.explored || !Memory.explored[farRoom]) {
                            creep.memory.scoutTarget = farRoom;
                            return;
                        }
                    }
                }
            }
        }

        // 真没有了 → 不设目标，后面会触发回家转换
        creep.memory.scoutTarget = null;
    },

    _goHome: function (creep) {
        var homeRoom = creep.memory.homeRoom;
        if (!homeRoom) { creep.suicide(); return; }
        movement.moveToRoom(creep, homeRoom, {
            visualizePathStyle: { stroke: '#ff00ff' },
            reusePath: 50,
            reason: 'scout-home'
        });
    }
};

function exploreRoom(creep, roomName) {
    var room = Game.rooms[roomName];
    if (!room) {
        console.log('🔍 [侦察] ' + roomName + ' — 已进入视野范围');
        return;
    }

    var info = {
        name: roomName,
        timestamp: Game.time,
        owner: null,
        sources: [],
        controller: null,
        hostiles: 0,
        hostileStructures: [],
        mineral: null
    };

    if (room.controller) {
        info.controller = {
            level: room.controller.level,
            owner: room.controller.owner ? room.controller.owner.username : null,
            my: room.controller.my
        };
        if (room.controller.owner) {
            info.owner = room.controller.owner.username;
        }
    }

    var sources = room.find(FIND_SOURCES);
    for (var i = 0; i < sources.length; i++) {
        info.sources.push({
            id: sources[i].id,
            x: sources[i].pos.x,
            y: sources[i].pos.y
        });
    }

    var hostiles = room.find(FIND_HOSTILE_CREEPS);
    info.hostiles = hostiles.length;

    var enemyStructures = room.find(FIND_HOSTILE_STRUCTURES);
    info.hostileStructures = [];
    for (var si = 0; si < enemyStructures.length; si++) {
        info.hostileStructures.push({
            type: enemyStructures[si].structureType,
            x: enemyStructures[si].pos.x,
            y: enemyStructures[si].pos.y
        });
    }

    var minerals = room.find(FIND_MINERALS);
    if (minerals.length > 0) {
        info.mineral = { type: minerals[0].mineralType, amount: minerals[0].mineralAmount };
    }

    if (!Memory.roomScout) Memory.roomScout = {};
    Memory.roomScout[roomName] = info;

    var report = '🔍 [侦察] ' + roomName;
    if (info.owner) report += ' 玩家:' + info.owner + ' (RCL' + info.controller.level + ')';
    else report += ' 无主之地';
    report += ' 能量源:' + info.sources.length;
    if (info.hostiles > 0) report += ' ⚔️敌人:' + info.hostiles;
    console.log(report);
}

module.exports = roleScout;
