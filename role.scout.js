/**
 * 🗺️ 侦察兵 — 探索未知房间，记录信息
 *
 * 行为: 出生 → 走向目标房间 → 到达后记录信息 → 去下一个房间
 */
var roleScout = {

    run: function (creep) {

        // 设置探索目标
        if (!creep.memory.scoutTarget) {
            var homeRoom = creep.memory.homeRoom;
            if (Memory.rooms[homeRoom] && Memory.rooms[homeRoom].exploreTarget) {
                creep.memory.scoutTarget = Memory.rooms[homeRoom].exploreTarget;
            } else {
                var exits = Game.map.describeExits(homeRoom);
                for (var dir in exits) {
                    var neighbor = exits[dir];
                    if (!Memory.explored || !Memory.explored[neighbor]) {
                        creep.memory.scoutTarget = neighbor;
                        break;
                    }
                }
                if (!creep.memory.scoutTarget) {
                    creep.suicide();
                    return;
                }
            }
        }

        var target = creep.memory.scoutTarget;

        // 到达目标房间
        if (creep.room.name === target) {
            exploreRoom(creep, target);

            if (!Memory.explored) Memory.explored = {};
            Memory.explored[target] = true;

            var nextExits = Game.map.describeExits(target);
            var nextTarget = null;
            for (var d in nextExits) {
                var nb = nextExits[d];
                if (!Memory.explored[nb]) {
                    nextTarget = nb;
                    break;
                }
            }
            if (nextTarget) {
                creep.memory.scoutTarget = nextTarget;
            } else {
                creep.memory.scoutTarget = creep.memory.homeRoom;
                if (creep.room.name === creep.memory.homeRoom) {
                    creep.suicide();
                }
            }
            return;
        }

        // 走向目标
        var err = creep.moveTo(new RoomPosition(25, 25, target), {
            visualizePathStyle: { stroke: '#ff00ff' },
            reusePath: 50,
            maxRooms: 10
        });

        if (err === ERR_NO_PATH) {
            console.log('⚠ 侦察兵无法到达: ' + target);
            creep.memory.scoutTarget = null;
        }
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
