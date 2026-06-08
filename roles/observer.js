/**
 * 👁️ 观察者 — 深度优先探索 + 应急转换
 *
 * 行为模式:
 *   1. 从老家选一个方向（上/下/左/右）→ 沿该方向一直走
 *   2. 走到没路了（该方向无出口）→ 沿途记录房间情报 → 原路返回老家
 *   3. 到家后换下一个方向继续
 *   4. 四个方向都走完 → 转成其他兵种（采集/建造/升级）
 *
 * 记忆结构:
 *   state: 'exploring' | 'returning' | 'retreating' | 'idle'
 *   direction: FIND_EXIT_TOP | FIND_EXIT_RIGHT | FIND_EXIT_BOTTOM | FIND_EXIT_LEFT
 *   path: ['homeRoom', 'room1', 'room2', ...]  // 走过的房间链
 *   visitedDirs: ['TOP', 'RIGHT', ...]           // 已完成的方向
 */
var movement = require('../utils/movement');

// 四个基本方向
var CARDINAL_DIRS = [
    { key: 'TOP',    const: FIND_EXIT_TOP },
    { key: 'RIGHT',  const: FIND_EXIT_RIGHT },
    { key: 'BOTTOM', const: FIND_EXIT_BOTTOM },
    { key: 'LEFT',   const: FIND_EXIT_LEFT }
];

var roleObserver = {

    run: function (creep) {

        // 调试日志（每 5 tick）
        if (Game.time % 5 === 0) {
            console.log('👁️ [观察者] ' + creep.name +
                ' 状态=' + (creep.memory.state || '—') +
                ' 方向=' + (creep.memory.direction || '—') +
                ' 路径=' + (creep.memory.path ? creep.memory.path.length : 0) + '步' +
                ' 已完成=' + (creep.memory.visitedDirs || []).length + '/4方向' +
                ' 当前=' + creep.room.name +
                ' 老家=' + creep.memory.homeRoom);
        }

        // 初始化
        this._init(creep);

        // 撤退检测（所有状态下都检测）
        if (creep.memory.state !== 'retreating') {
            this.checkRetreat(creep);
        }

        // 按状态执行
        switch (creep.memory.state) {
            case 'exploring': this.doExplore(creep); break;
            case 'returning': this.doReturn(creep); break;
            case 'retreating': this.doRetreat(creep); break;
            case 'idle':
            default:
                // idle 状态 → 在老家静默等待 main.js 转换
                break;
        }
    },

    // ================================================================
    //  初始化（首次 run 时设置）
    // ================================================================
    _init: function (creep) {
        // 已初始化的新状态（exploring/returning/retreating/idle）→ 跳过
        var newStates = ['exploring', 'returning', 'retreating', 'idle'];
        if (creep.memory.state && newStates.indexOf(creep.memory.state) !== -1) return;

        var homeRoom = creep.memory.homeRoom;
        var exits = Game.map.describeExits(homeRoom);

        if (!exits || Object.keys(exits).length === 0) {
            // sim 房间，没有出口 → 直接 idle
            creep.memory.state = 'idle';
            console.log('👁️ [观察者] ' + creep.name + ' ' + homeRoom + ' 无出口，转为待命');
            return;
        }

        creep.memory.state = 'exploring';
        creep.memory.path = [homeRoom];
        creep.memory.visitedDirs = [];
        creep.memory.direction = null;
        creep.memory.stuckTicks = 0;
        creep.memory.lastExploreRoom = homeRoom;
    },

    // ================================================================
    //  撤退条件检测
    // ================================================================
    checkRetreat: function (creep) {
        var homeRoom = creep.memory.homeRoom;

        if (Memory.rooms[homeRoom] && Memory.rooms[homeRoom].hostile) {
            creep.memory.state = 'retreating';
            console.log('🏃 [观察者] ' + creep.name + ' 家园被入侵，紧急撤退');
            return;
        }

        if (creep.hits < creep.hitsMax * 0.3) {
            creep.memory.state = 'retreating';
            console.log('🏃 [观察者] ' + creep.name + ' 血量过低，撤退');
            return;
        }

        if (creep.memory.lastHits !== undefined && creep.hits < creep.memory.lastHits) {
            creep.memory.state = 'retreating';
            console.log('🏃 [观察者] ' + creep.name + ' 遭到攻击，撤退');
            return;
        }

        creep.memory.lastHits = creep.hits;
    },

    // ================================================================
    //  探索 — 沿当前方向往前走
    // ================================================================
    doExplore: function (creep) {
        var path = creep.memory.path;
        var currentRoom = creep.room.name;

        // ---- 卡住检测: 30 tick 没换房间 → 放弃这个方向 ----
        if (creep.memory.direction && creep.memory.lastExploreRoom) {
            if (currentRoom === creep.memory.lastExploreRoom) {
                creep.memory.stuckTicks = (creep.memory.stuckTicks || 0) + 1;
                if (creep.memory.stuckTicks > 30) {
                    var dirInfo = this._dirConstToKey(creep.memory.direction);
                    console.log('👁️ [观察者] ' + creep.name + ' 方向 ' + (dirInfo ? dirInfo.key : creep.memory.direction) + ' 卡住，放弃');
                    creep.memory.visitedDirs.push(dirInfo ? dirInfo.key : String(creep.memory.direction));
                    creep.memory.direction = null;
                    creep.memory.state = 'returning';
                    creep.memory.stuckTicks = 0;
                    return;
                }
            } else {
                creep.memory.stuckTicks = 0;
            }
        }
        creep.memory.lastExploreRoom = currentRoom;

        // ---- 还没选方向 → 从老家选一个 ----
        if (!creep.memory.direction) {
            var dir = this._pickDirection(creep);
            if (!dir) {
                // 四个方向都走完了
                creep.memory.state = 'idle';
                console.log('👁️ [观察者] ' + creep.name + ' 全部方向探索完毕');
                return;
            }
            creep.memory.direction = dir.const;
            creep.memory.path = [creep.memory.homeRoom];

            // 如果已经在老家，立即往该方向走
            if (currentRoom === creep.memory.homeRoom) {
                var nextRoom = this._getExitInDirection(creep, currentRoom, dir.const);
                if (nextRoom) {
                    this._moveToward(creep, nextRoom);
                    if (creep.room.name !== currentRoom) {
                        // 到了新房间
                        creep.memory.path.push(creep.room.name);
                        this.recordRoom(creep, creep.room.name);
                    }
                } else {
                    // 这个方向也没有出口 → 标记已探索，递归重试
                     creep.memory.visitedDirs.push(dir.key);
                     creep.memory.direction = null;
                }
            }
            return;
        }

        // ---- 到达新房间 → 记录 + 尝试继续 ----
        if (currentRoom !== path[path.length - 1]) {
            path.push(currentRoom);
            this.recordRoom(creep, currentRoom);
        }

        // ---- 尝试往当前方向继续走 ----
        var nextRoom = this._getExitInDirection(creep, currentRoom, creep.memory.direction);

        if (nextRoom && path.indexOf(nextRoom) === -1) {
            // 前方有路且没去过 → 继续走
            this._moveToward(creep, nextRoom);
        } else {
            // 没路了或已去过 → 此方向探索完毕
            var dirInfo = this._dirConstToKey(creep.memory.direction);
            if (dirInfo) {
                creep.memory.visitedDirs.push(dirInfo.key);
                console.log('👁️ [观察者] ' + creep.name + ' 方向 ' + dirInfo.key + ' 探索完毕，共 ' + path.length + ' 个房间');
            }
            creep.memory.direction = null;
            creep.memory.state = 'returning';
        }
    },

    // ================================================================
    //  返程 — 沿路径往回走
    // ================================================================
    doReturn: function (creep) {
        var path = creep.memory.path;
        var currentRoom = creep.room.name;

        // 到家了
        if (currentRoom === creep.memory.homeRoom) {
            // 清除路径（只剩老家）
            creep.memory.path = [creep.memory.homeRoom];
            // 尝试下一个方向
            var nextDir = this._pickDirection(creep);
            if (nextDir) {
                creep.memory.state = 'exploring';
                creep.memory.direction = nextDir.const;
                console.log('👁️ [观察者] ' + creep.name + ' 换方向: ' + nextDir.key);
                // 立即往新方向走
                var nr = this._getExitInDirection(creep, currentRoom, nextDir.const);
                if (nr) this._moveToward(creep, nr);
            } else {
                // 所有方向完成
                creep.memory.state = 'idle';
                console.log('👁️ [观察者] ' + creep.name + ' 全部方向探索完毕，等待转换');
            }
            return;
        }

        // 还没到家 → 往回走一格
        if (path.length >= 2) {
            var prevRoom = path[path.length - 2];
            path.pop();
            this._moveToward(creep, prevRoom);
        } else {
            // 路径异常，直接回老家
            this._moveToward(creep, creep.memory.homeRoom);
        }
    },

    // ================================================================
    //  撤退 — 直线回老家
    // ================================================================
    doRetreat: function (creep) {
        if (creep.room.name === creep.memory.homeRoom) return;
        this._moveToward(creep, creep.memory.homeRoom);
    },

    // ================================================================
    //  选下一个要探索的方向（避开已完成的 + 其他观察者正在用的）
    // ================================================================
    _pickDirection: function (creep) {
        var visited = creep.memory.visitedDirs || [];

        // 统计其他观察者当前在用的方向
        var usedDirs = {};
        for (var name in Game.creeps) {
            var c = Game.creeps[name];
            if (c.memory.role === 'observer' && c.id !== creep.id && c.memory.direction) {
                var dk = this._dirConstToKey(c.memory.direction);
                if (dk) usedDirs[dk.key] = true;
            }
        }

        // 检查老家各方向是否有出口
        var homeExits = Game.map.describeExits(creep.memory.homeRoom);

        for (var i = 0; i < CARDINAL_DIRS.length; i++) {
            var d = CARDINAL_DIRS[i];
            if (visited.indexOf(d.key) !== -1) continue;       // 已探索过
            if (usedDirs[d.key]) continue;                      // 被其他观察者占用

            // 检查老家这个方向是否有出口
            if (homeExits && homeExits[String(d.const)]) {
                return d;
            }
        }

        return null; // 所有方向都试过了
    },

    // ================================================================
    //  获取当前房间在指定方向的出口房间名
    // ================================================================
    _getExitInDirection: function (creep, roomName, dirConst) {
        var exits = Game.map.describeExits(roomName);
        if (!exits) return null;
        return exits[String(dirConst)] || null;
    },

    // ================================================================
    //  方向常量 ↔ key 互转
    // ================================================================
    _dirConstToKey: function (dirConst) {
        for (var i = 0; i < CARDINAL_DIRS.length; i++) {
            if (CARDINAL_DIRS[i].const === dirConst) return CARDINAL_DIRS[i];
        }
        return null;
    },

    // ================================================================
    //  移动到目标房间
    // ================================================================
    _moveToward: function (creep, targetRoom) {
        var err = movement.moveToRoom(creep, targetRoom, {
            visualizePathStyle: { stroke: '#ff88ff' },
            reusePath: 50,
            maxRooms: 30,
            allowHostileRooms: true,
            reason: 'observer-room'
        });
        // ERR_BUSY(-4) 是刚孵化还没出笼，ERR_TIRED 是冷却，都静默忽略
        if (err !== OK && err !== ERR_TIRED && err !== ERR_BUSY) {
            console.log('⚠️ [观察者] ' + creep.name + ' 移动失败(' + err + ') 目标=' + targetRoom);
        }
    },

    // ================================================================
    //  记录房间情报
    // ================================================================
    recordRoom: function (creep, roomName) {
        var room = Game.rooms[roomName];
        if (!room) {
            // 不在视野内也记录一下到过
            if (!Memory.roomScout) Memory.roomScout = {};
            if (!Memory.roomScout[roomName]) {
                Memory.roomScout[roomName] = { name: roomName, timestamp: Game.time, owner: null };
            }
            return;
        }

        if (!Memory.roomScout) Memory.roomScout = {};
        var prevInfo = Memory.roomScout[roomName];

        var info = {
            name: roomName,
            timestamp: Game.time,
            owner: null,
            controllerLevel: 0,
            hostiles: 0,
            hostilePlayers: [],
            sources: room.find(FIND_SOURCES).length,
            mineralType: null
        };

        if (room.controller) {
            info.controllerLevel = room.controller.level;
            if (room.controller.owner) info.owner = room.controller.owner.username;
        }

        var hostiles = room.find(FIND_HOSTILE_CREEPS);
        info.hostiles = hostiles.length;
        info.hostilePlayers = [];
        for (var i = 0; i < hostiles.length; i++) {
            var on = hostiles[i].owner.username;
            if (info.hostilePlayers.indexOf(on) === -1) info.hostilePlayers.push(on);
        }

        var minerals = room.find(FIND_MINERALS);
        if (minerals.length > 0) info.mineralType = minerals[0].mineralType;

        var changed = !prevInfo ||
            prevInfo.hostiles !== info.hostiles ||
            prevInfo.owner !== info.owner ||
            prevInfo.controllerLevel !== info.controllerLevel;

        Memory.roomScout[roomName] = info;

        if (changed) {
            var msg = '👁️ [观察者] ' + roomName;
            if (info.owner) msg += ' 玩家:' + info.owner + '(RCL' + info.controllerLevel + ')';
            else msg += ' 无主之地';
            msg += ' 能量源:' + info.sources;
            if (info.hostiles > 0) msg += ' ⚔️敌人:' + info.hostiles;
            if (info.mineralType) msg += ' 矿:' + info.mineralType;
            console.log(msg);
        }
    }
};

module.exports = roleObserver;
