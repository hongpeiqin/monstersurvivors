export const VERSION='1.3.1';
export const STORAGE_KEY='frostblade-survivors.save.v1';
export const TAU=Math.PI*2;
export const ISO_Y=.64;
export const QUALITY_PROFILES={off:{particles:0,drawParticles:0,dpr:1.2,enemyScale:.9},medium:{particles:420,drawParticles:300,dpr:1.6,enemyScale:1},high:{particles:760,drawParticles:520,dpr:2,enemyScale:1}};
export const DAYS=[
{id:1,title:'霜原试炼',subtitle:'学会在包围中移动',map:'frost',duration:360,enemyCap:72,boss:'霜牙酋长',rewardCoins:260,rewardShards:2,weights:{grunt:68,runner:18,brute:10,archer:4}},
{id:2,title:'疾风裂谷',subtitle:'速度成为第二层护甲',map:'rift',duration:390,enemyCap:82,boss:'裂风猎手',rewardCoins:330,rewardShards:2,weights:{grunt:46,runner:34,brute:12,archer:8},haste:1.12},
{id:3,title:'腐化林地',subtitle:'不要站在毒圈里思考人生',map:'grove',duration:420,enemyCap:92,boss:'孢子母体',rewardCoins:410,rewardShards:3,weights:{grunt:40,runner:20,brute:18,archer:12,splitter:10},hazard:'poison'},
{id:4,title:'雷鸣矿井',subtitle:'远程弹幕开始要求你认真',map:'mine',duration:435,enemyCap:100,boss:'雷铸监工',rewardCoins:500,rewardShards:3,weights:{grunt:35,runner:18,brute:16,archer:23,splitter:8},hazard:'lightning'},
{id:5,title:'镜湖围猎',subtitle:'精英怪终于拿到了预算',map:'lake',duration:450,enemyCap:110,boss:'镜湖双生',rewardCoins:620,rewardShards:4,weights:{grunt:32,runner:22,brute:18,archer:16,splitter:12},elite:.07},
{id:6,title:'王城残垣',subtitle:'所有敌种混合登场',map:'ruins',duration:480,enemyCap:120,boss:'失冠骑士',rewardCoins:760,rewardShards:5,weights:{grunt:26,runner:20,brute:22,archer:18,splitter:14}},
{id:7,title:'终夜王座',subtitle:'击败寒夜之主',map:'throne',duration:510,enemyCap:132,boss:'寒夜之主',rewardCoins:1000,rewardShards:8,weights:{grunt:22,runner:22,brute:24,archer:18,splitter:14},hazard:'night'}];
export const HEROES={
bladeguard:{id:'bladeguard',name:'霜刃卫士',icon:'⚔',unlockDay:1,desc:'均衡近战，初始携带霜刃斩。',baseHp:125,speed:220,armor:2,startWeapon:'blade',color:'#7debd2'},
stormhunter:{id:'stormhunter',name:'逐雷猎手',icon:'⚡',unlockDay:3,desc:'高速机动，初始携带连锁雷击。',baseHp:100,speed:248,armor:0,startWeapon:'lightning',color:'#76cfff'},
runekeeper:{id:'runekeeper',name:'符文守望',icon:'✦',unlockDay:5,desc:'范围控制，初始携带符文地雷。',baseHp:110,speed:208,armor:1,startWeapon:'mine',color:'#b69cff'}};
export const WEAPONS={
blade:{id:'blade',name:'霜刃斩',icon:'🗡',maxLevel:5,evolveWith:'might',evolvedName:'月蚀霜刃',desc:'自动向最近敌人挥出扇形刀光。',levels:['伤害 +15%','攻击范围 +18%','额外挥出侧刃','冷却 -18%','伤害 +30%，准备进化']},
orbit:{id:'orbit',name:'冰轮护卫',icon:'❄',maxLevel:5,evolveWith:'area',evolvedName:'暴雪王冠',desc:'冰刃围绕角色旋转并持续伤害。',levels:['冰轮 +1','伤害 +20%','旋转半径 +18%','冰轮 +1','转速与伤害提高，准备进化']},
lightning:{id:'lightning',name:'连锁雷击',icon:'⚡',maxLevel:5,evolveWith:'haste',evolvedName:'天穹风暴',desc:'雷电在多个敌人之间跳跃。',levels:['额外跳跃 1 次','伤害 +22%','冷却 -14%','额外跳跃 2 次','暴击率提高，准备进化']},
chakram:{id:'chakram',name:'回旋月刃',icon:'☾',maxLevel:5,evolveWith:'speed',evolvedName:'双月回廊',desc:'投出会折返的月刃。',levels:['月刃 +1','飞行速度 +18%','伤害 +24%','穿透 +2','月刃 +1，准备进化']},
mine:{id:'mine',name:'符文地雷',icon:'✦',maxLevel:5,evolveWith:'luck',evolvedName:'星陨法阵',desc:'放置延迟爆炸的符文。',levels:['爆炸范围 +20%','地雷 +1','伤害 +25%','冷却 -18%','连环爆炸，准备进化']},
nova:{id:'nova',name:'圣霜新星',icon:'✹',maxLevel:5,evolveWith:'vitality',evolvedName:'永冻圣域',desc:'周期释放环形冲击并减速敌人。',levels:['范围 +18%','伤害 +20%','冷却 -15%','冻结时间延长','双重冲击，准备进化']}};
export const PASSIVES={might:{id:'might',name:'锋锐',icon:'⬆',maxLevel:5,desc:'所有伤害提高 10%。'},haste:{id:'haste',name:'急速',icon:'⏱',maxLevel:5,desc:'武器冷却缩短 7%。'},vitality:{id:'vitality',name:'体魄',icon:'♥',maxLevel:5,desc:'最大生命提高 12%。'},area:{id:'area',name:'领域',icon:'◉',maxLevel:5,desc:'攻击范围提高 9%。'},armor:{id:'armor',name:'甲胄',icon:'⬡',maxLevel:5,desc:'受到伤害减少 1.5。'},magnet:{id:'magnet',name:'引力',icon:'⌁',maxLevel:5,desc:'拾取范围提高 16%。'},speed:{id:'speed',name:'疾步',icon:'➤',maxLevel:5,desc:'移动速度提高 7%。'},luck:{id:'luck',name:'命运',icon:'✧',maxLevel:5,desc:'高品质升级与掉落概率提高。'}};
export const META_UPGRADES={power:{id:'power',name:'磨刃',icon:'⚔',maxLevel:8,baseCost:160,desc:'永久伤害 +3%/级'},health:{id:'health',name:'厚甲',icon:'♥',maxLevel:8,baseCost:150,desc:'永久生命 +4%/级'},haste:{id:'haste',name:'战术',icon:'⏱',maxLevel:6,baseCost:210,desc:'永久冷却 -1.5%/级'},magnet:{id:'magnet',name:'拾荒',icon:'⌁',maxLevel:6,baseCost:140,desc:'永久拾取范围 +5%/级'},greed:{id:'greed',name:'军需',icon:'🪙',maxLevel:8,baseCost:180,desc:'结算金币 +4%/级'},reroll:{id:'reroll',name:'预案',icon:'↻',maxLevel:3,baseCost:420,desc:'每局重抽次数 +1'}};
export const ENEMY_TYPES={grunt:{id:'grunt',name:'霜原小兵',hp:34,speed:76,damage:8,radius:18,xp:4,coin:1,color:'#66865a',attackRate:1.05},runner:{id:'runner',name:'裂风兽',hp:24,speed:126,damage:7,radius:15,xp:4,coin:1,color:'#87a966',attackRate:.82},brute:{id:'brute',name:'冰甲蛮兵',hp:94,speed:54,damage:14,radius:25,xp:9,coin:2,color:'#61765d',attackRate:1.35},archer:{id:'archer',name:'寒弓手',hp:42,speed:64,damage:9,radius:18,xp:7,coin:2,color:'#667f86',attackRate:1.9,ranged:true},splitter:{id:'splitter',name:'孢裂体',hp:66,speed:70,damage:10,radius:21,xp:8,coin:2,color:'#7d7660',attackRate:1.1,splits:true},mite:{id:'mite',name:'孢子虫',hp:14,speed:138,damage:5,radius:10,xp:2,coin:0,color:'#9d9c70',attackRate:.7}};
export const BOSS_TYPES={1:{name:'霜牙酋长',hp:4600,speed:62,damage:18,radius:42,color:'#79906b',pattern:'charge'},2:{name:'裂风猎手',hp:5900,speed:78,damage:19,radius:40,color:'#7698a2',pattern:'dash'},3:{name:'孢子母体',hp:7600,speed:46,damage:20,radius:48,color:'#8c7f63',pattern:'summon'},4:{name:'雷铸监工',hp:9200,speed:54,damage:22,radius:46,color:'#6d8090',pattern:'volley'},5:{name:'镜湖双生',hp:11000,speed:70,damage:23,radius:43,color:'#6c8f8a',pattern:'mirror'},6:{name:'失冠骑士',hp:13200,speed:64,damage:25,radius:48,color:'#74777d',pattern:'knight'},7:{name:'寒夜之主',hp:16800,speed:66,damage:28,radius:52,color:'#6c6c88',pattern:'nightfall'}};
export const ACHIEVEMENTS={firstBlood:{id:'firstBlood',name:'第一滴血',desc:'累计击破 1 个敌人',test:t=>t.kills>=1},thousand:{id:'thousand',name:'千军退散',desc:'累计击破 1000 个敌人',test:t=>t.kills>=1000},veteran:{id:'veteran',name:'七夜老兵',desc:'通关第七夜',test:t=>t.clearedDays>=7},collector:{id:'collector',name:'霜晶收藏家',desc:'累计获得 40 枚霜晶',test:t=>t.shardsEarned>=40},survivor:{id:'survivor',name:'拒绝倒下',desc:'单局存活 8 分钟',test:t=>t.bestSurvival>=480}};
export const DAILY_REWARDS=[120,160,220,280,360,480,700];
export const metaCost=(def,level)=>Math.round(def.baseCost*Math.pow(1.58,level));
export const dayById=id=>DAYS.find(d=>d.id===Number(id))||DAYS[0];
export function weightedPick(weights,random=Math.random){let total=Object.values(weights).reduce((a,b)=>a+b,0),roll=random()*total;for(const [key,value] of Object.entries(weights)){roll-=value;if(roll<=0)return key}return Object.keys(weights)[0]}
