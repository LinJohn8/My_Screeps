/**
 * 👁️ 观察者 — 远行侦察／预警／应急转换
 *
 * 核心设计:
 *   1. 默认去其他房间观察（记录敌人、玩家活动）
 *   2. 三种紧急撤退条件 → 回老家 → 转换兵种
 *   3. 灵魂是「活着的视野」，平时不消耗能量
 *
 * 撤退触发:
 *   - 家园被入侵（room.memory.hostile === true）
 *   - 自身血量 < 30%
 *   - 正在受到攻击（hits 比上一 tick 减少）
 *
 * 撤退后转换:
 *   - 主循环检测到 observer 已回到 homeRoom →
 *     有入侵 → 转 soldier；无入侵 → 转 upgrader
 */
var roleObserver = {

    run: function (creep) {

        // 调试日志（每 20 tick 打印一次状态）
        if (Game.time % 20 === 0) {
            console.log('👁️ [观察者] ' + creep.name +
                ' 状态=' + (creep.memory.state || 'observing') +
                ' 目标=' + (creep.memory.targetRoom || '❌无') +
                ' 当前=' + creep.room.name +
                ' 老家=' + creep.memory.homeRoom);
        }

        // 1. 撤退条件检测（非撤退状态才检测）
        if (creep.memory.state !== 'retreating') {
            this.checkRetreat(creep);
        }

        // 2. 按状态执行
        if (creep.memory.state === 'retreating') {
            this.retreat(creep);
        } else {
            this.observe(creep);
        }
    },

    // ================================================================
    //  撤退条件检测
    // ================================================================
    checkRetreat: function (creep) {
        var homeRoom = creep.memory.homeRoom;

        // 条件1: 家园被入侵
        if (Memory.rooms[homeRoom] && Memory.rooms[homeRoom].hostile) {
            creep.memory.state = 'retreating';
            console.log('🏃 [观察者] ' + creep.name + ' 家园被入侵，紧急撤退');
            return;
        }

        // 条件2: 自身血量过低
        if (creep.hits < creep.hitsMax * 0.3) {
            creep.memory.state = 'retreating';
            console.log('🏃 [观察者] ' + creep.name + ' 血量过低(' + creep.hits + '/' + creep.hitsMax + ')，撤退');
            return;
        }

        // 条件3: 正在受到攻击（hits 减少）
        if (creep.memory.lastHits !== undefined && creep.hits < creep.memory.lastHits) {
            creep.memory.state = 'retreating';
            console.log('🏃 [观察者] ' + creep.name + ' 遭到攻击，紧急撤退');
            return;
        }

        // 记录当前血量供下一 tick 比较
        creep.memory.lastHits = creep.hits;
    },

    // ================================================================
    //  观察模式 — 去目标房间巡逻
    // ================================================================
    observe: function (creep) {
        var homeRoom = creep.memory.homeRoom;

        // 自动设置目标房间（带重试冷却，不每 tick 重复）
        if (!creep.memory.targetRoom && (!creep.memory.noTargetUntil || Game.time >= creep.memory.noTargetUntil)) {
            creep.memory.targetRoom = this.pickTarget(creep);
            if (creep.memory.targetRoom) {
                creep.memory.noTargetUntil = undefined;
                console.log('👁️ [观察者] ' + creep.name + ' 选定目标: ' + creep.memory.targetRoom);
            } else {
                // 找不到目标 → 50 tick 后再试
                creep.memory.noTargetUntil = Game.time + 50;
                if (Game.time % 50 === 0) {
                    console.log('⚠️ [观察者] ' + creep.name + ' 没有可观察的房间');
                }
            }
        }

        var target = creep.memory.targetRoom;
        if (!target) {
            // 没有可观察的房间 → 在 homeRoom 待命（静默）
            return;
        }

        // ---- 已到达目标房间 ----
        if (creep.room.name === target) {
            this.patrol(creep, target);

            // 每 20 tick 记录一次当前房间信息
            if (Game.time % 20 === 0) {
                this.recordRoom(creep, target);
            }
            return;
        }

        // ---- 前往目标房间 ----
        this.moveToRoom(creep, target);
    },

    // ================================================================
    //  选择观察目标
    // ================================================================
    pickTarget: function (creep) {
        var homeRoom = creep.memory.homeRoom;
        var exits = Game.map.describeExits(homeRoom);

        // 安全兜底: 没有出口信息（比如 sim 教学房间）
        if (!exits) {
            if (Game.time % 50 === 0) {
                console.log('⚠️ [观察者] ' + creep.name + ' 房间 ' + homeRoom + ' 没有出口，无法探索');
            }
            return null;
        }

        var observed = Memory.roomScout || {};

        // ---- 统计各房间已有观察者数量 ----
        var observerCounts = {};
        for (var name in Game.creeps) {
            var c = Game.creeps[name];
            if (c.memory.role === 'observer' && c.memory.targetRoom) {
                observerCounts[c.memory.targetRoom] = (observerCounts[c.memory.targetRoom] || 0) + 1;
            }
        }

        var bestRoom = null;
        var bestScore = 99999;
        var firstExit = null;   // 最终兜底

        for (var dir in exits) {
            var neighbor = exits[dir];
            if (!firstExit) firstExit = neighbor;

            var count = observerCounts[neighbor] || 0;

            // 优先级: 无人 + 未探索 → 直接返回
            if (count === 0) {
                if (!Memory.explored || !Memory.explored[neighbor]) {
                    console.log('👁️ [观察者] 选目标: ' + neighbor + ' (未探索,无人)');
                    return neighbor;
                }
            }

            // 评分: 观察者越少越好，已探索稍微扣分
            var score = count * 10 + (observed[neighbor] ? 1 : 0);
            if (score < bestScore) {
                bestScore = score;
                bestRoom = neighbor;
            }
        }

        // ---- 相邻房间都有人/都已探索 → 扩散到二级相邻 ----
        if (bestScore >= 10) {
            for (var dir2 in exits) {
                var nb = exits[dir2];
                if (!observed[nb]) continue;

                if (!observed[nb].exits) {
                    var nbExits = Game.map.describeExits(nb);
                    if (nbExits) {
                        observed[nb].exits = nbExits;
                    }
                }
                if (observed[nb].exits) {
                    for (var d2 in observed[nb].exits) {
                        var farRoom = observed[nb].exits[d2];
                        if (!observerCounts[farRoom] || observerCounts[farRoom] === 0) {
                            console.log('👁️ [观察者] 选目标(二级): ' + farRoom);
                            return farRoom;
                        }
                    }
                }
            }
        }

        // ---- 最终兜底: 第一个出口 ----
        if (!bestRoom) {
            bestRoom = firstExit;
        }

        if (bestRoom) {
            console.log('👁️ [观察者] 选目标(兜底): ' + bestRoom + ' 评分=' + bestScore);
        }
        return bestRoom;
    },

    // ================================================================
    //  在目标房间巡逻（最小动作维持视野）
    // ================================================================
    patrol: function (creep, roomName) {
        // 每 5 tick 走一步，覆盖更多视野
        if (Game.time % 5 === 0) {
            // 检测当前房间是否有敌人
            var room = Game.rooms[roomName];
            if (room) {
                var hostiles = room.find(FIND_HOSTILE_CREEPS);
                if (hostiles.length > 0 && hostiles.length !== (creep.memory.lastHostileCount || 0)) {
                    console.log('👁️ [观察者] ' + roomName + ' 发现敌人! 数量=' + hostiles.length);
                    creep.memory.lastHostileCount = hostiles.length;
                }
                if (hostiles.length === 0) {
                    creep.memory.lastHostileCount = 0;
                }
            }

            // 沿边界小范围移动观察
            var x = creep.pos.x;
            var y = creep.pos.y;

            // 靠边时往中间走
            if (x < 5) {
                creep.move(RIGHT);
            } else if (x > 44) {
                creep.move(LEFT);
            } else if (y < 5) {
                creep.move(BOTTOM);
            } else if (y > 44) {
                creep.move(TOP);
            } else {
                // 不在边界 → 随机走一步
                var dirs = [TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT];
                creep.move(dirs[Math.floor(Math.random() * dirs.length)]);
            }
        }
    },

    // ================================================================
    //  撤退 — 返回老家
    // ================================================================
    retreat: function (creep) {
        var homeRoom = creep.memory.homeRoom;

        // 已经到家了 — 转换逻辑由 main.js 处理
        if (creep.room.name === homeRoom) {
            return;
        }

        // 往老家方向走
        this.moveToRoom(creep, homeRoom);
    },

    // ================================================================
    //  移动到目标房间（统一入口）
    // ================================================================
    moveToRoom: function (creep, targetRoom) {
        var err = creep.moveTo(new RoomPosition(25, 25, targetRoom), {
            visualizePathStyle: { stroke: '#ff88ff' },
            reusePath: 50,
            maxRooms: 15
        });

        if (err !== OK && err !== ERR_TIRED) {
            console.log('⚠️ [观察者] ' + creep.name + ' 移动失败(' + err + ') 目标=' + targetRoom + '，换目标');
            creep.memory.targetRoom = null;
        }
    },

    // ================================================================
    //  记录房间情报
    // ================================================================
    recordRoom: function (creep, roomName) {
        var room = Game.rooms[roomName];
        if (!room) return;

        if (!Memory.roomScout) Memory.roomScout = {};

        var prevInfo = Memory.roomScout[roomName];

        var info = {
            name: roomName,
            timestamp: Game.time,
            owner: null,
            controllerLevel: 0,
            hostiles: 0,
            hostilePlayers: [],
            sources: 0,
            mineralType: null
        };

        if (room.controller) {
            info.controllerLevel = room.controller.level;
            if (room.controller.owner) {
                info.owner = room.controller.owner.username;
            }
        }

        var hostiles = room.find(FIND_HOSTILE_CREEPS);
        info.hostiles = hostiles.length;

        var hostileNames = [];
        for (var i = 0; i < hostiles.length; i++) {
            var ownerName = hostiles[i].owner.username;
            if (hostileNames.indexOf(ownerName) === -1) {
                hostileNames.push(ownerName);
            }
        }
        info.hostilePlayers = hostileNames;

        info.sources = room.find(FIND_SOURCES).length;

        var minerals = room.find(FIND_MINERALS);
        if (minerals.length > 0) {
            info.mineralType = minerals[0].mineralType;
        }

        // 检测变化，有变化才打 log
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
