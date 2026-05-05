export const MATCH_QUOTA = 3;
export const MATCH_WINDOW_MS = 24 * 60 * 60 * 1000;

export const COMPLEMENT_MAP = {
  想倾诉: ["想倾听"], 想倾听: ["想倾诉"],
  找饭搭子: ["找饭搭子"], 找运动伙伴: ["找运动伙伴"],
  需要鼓励: ["愿意给能量"], 愿意给能量: ["需要鼓励"],
  想聊某个话题: ["想聊某个话题"], 找搭子一起玩: ["找搭子一起玩"],
  想输出: ["想接收"], 想接收: ["想输出"],
  随缘: ["随缘"],
};

export const MODE_OPTIONS = ["想输出", "想接收", "想一起做某事", "随缘"];

export const TAG_OPTIONS = [
  "想倾诉", "想倾听", "找饭搭子", "找运动伙伴",
  "需要鼓励", "愿意给能量", "想聊某个话题", "找搭子一起玩",
];

export const PROMPT_HINTS = [
  "今天心情怎么样？想找人聊聊吗？",
  "现在最想做的一件事是什么？",
  "你在寻找什么样的人陪你度过今天？",
  "有什么烦恼想说出来吗？",
  "想找人一起吃饭、运动或者玩游戏吗？",
  "今天需要被鼓励，还是想鼓励别人？",
];

export const AVATAR_COLORS = [
  "#f97316","#3b82f6","#10b981","#8b5cf6",
  "#ec4899","#f59e0b","#06b6d4","#ef4444"
];

export const LANG = {
  zh: {
    appName: "氛围", tagline: "找到今天需要的人",
    feed: "广场", match: "匹配", chats: "消息",
    postMatch: "匹配动态", postNormal: "普通动态",
    modeLabel: "今天的模式", tagLabel: "需求标签（最多3个）",
    visibility: "可见性", public: "🌐 公开", followers: "👥 粉丝", mutual: "🔒 互关",
    quotaFull: "今日匹配额度已满",
    remaining: (n) => `剩余 ${n} 条`,
    publishRemaining: (n) => `发布（剩余 ${n} 条）`,
    todayPosts: "今日动态", noPosts: "暂无动态，快来发第一条吧",
    todayMatch: "今日匹配", startMatch: "开始匹配", matching: "匹配中...",
    noMatch: "暂时没有匹配的人，稍后再试～", rematch: "重新匹配",
    matchScore: (n) => `匹配度 ${n}%`,
    startChat: "💬 发起聊天",
    send: "发送", sendHint: "说点什么...", noMessages: "发个消息打个招呼吧 👋",
    back: "← 返回", close: "关闭",
    follow: "+ 关注", following: "✓ 已关注", message: "💬 发消息",
    matchPosts: (n) => `${n} 条匹配动态`, normalPosts: (n) => `${n} 条普通动态`,
    allPosts: "全部动态", noPosts2: "暂无动态",
    setupTitle: "设置你的昵称", setupSub: "让其他人认识你",
    nicknamePlaceholder: "输入你的昵称（2-12个字）",
    enter: "进入氛围 →", saving: "保存中...",
    login: "一键登录 / 注册",
    emailPlaceholder: "输入邮箱", passwordPlaceholder: "输入密码（6位以上）",
    quotaBar: "今日匹配额度",
    inviteText: "邀请好友解锁额外3条 →",
    inviteAlert: (link) => `邀请链接已复制！\n${link}\n邀请1位好友注册，获得额外3条额度`,
    quotaUsed: "今日额度已用完 ·",
    upgradeTitle: "升级为匹配动态？", upgradeConfirm: "确认升级", cancel: "取消",
    upgradeSub: (n) => `将占用今日 1 条匹配额度（剩余 ${n} 条），升级后参与今日匹配。`,
    needPostFirst: "请先发布匹配动态才能发起新的聊天",
    needPost: "请先发布匹配动态",
    writeComment: "写评论...", commentSend: "发送",
    upgradeMatch: "升级匹配", logout: "退出",
    noChats: "还没有聊天记录，去匹配认识新朋友吧",
    clickChat: "点击继续聊天",
    today: "今天", expired: "已过期", match: "匹配", normal: "普通", chat: "聊聊",
  },
  en: {
    appName: "Vibe", tagline: "Find who you need today",
    feed: "Feed", match: "Match", chats: "Chats",
    postMatch: "Match Post", postNormal: "Normal Post",
    modeLabel: "Today's mode", tagLabel: "Tags (up to 3)",
    visibility: "Visibility", public: "🌐 Public", followers: "👥 Followers", mutual: "🔒 Mutual",
    quotaFull: "Daily quota used up",
    remaining: (n) => `${n} left`,
    publishRemaining: (n) => `Post (${n} left)`,
    todayPosts: "Today's Posts", noPosts: "No posts yet, be the first!",
    todayMatch: "Today's Matches", startMatch: "Start Matching", matching: "Matching...",
    noMatch: "No matches yet, try again later~", rematch: "Rematch",
    matchScore: (n) => `Match ${n}%`,
    startChat: "💬 Start Chat",
    send: "Send", sendHint: "Say something...", noMessages: "Say hi to start the conversation 👋",
    back: "← Back", close: "Close",
    follow: "+ Follow", following: "✓ Following", message: "💬 Message",
    matchPosts: (n) => `${n} match posts`, normalPosts: (n) => `${n} normal posts`,
    allPosts: "All Posts", noPosts2: "No posts",
    setupTitle: "Set your nickname", setupSub: "Let others know you",
    nicknamePlaceholder: "Enter nickname (2-12 chars)",
    enter: "Enter Vibe →", saving: "Saving...",
    login: "Login / Register",
    emailPlaceholder: "Enter email", passwordPlaceholder: "Password (6+ chars)",
    quotaBar: "Daily quota",
    inviteText: "Invite friends for 3 more →",
    inviteAlert: (link) => `Link copied!\n${link}\nInvite 1 friend to unlock 3 more posts`,
    quotaUsed: "Quota used up ·",
    upgradeTitle: "Upgrade to Match Post?", upgradeConfirm: "Confirm", cancel: "Cancel",
    upgradeSub: (n) => `Uses 1 quota (${n} left). Will join today's matching.`,
    needPostFirst: "Post a match post first to start chatting",
    needPost: "Post a match post first",
    writeComment: "Write a comment...", commentSend: "Send",
    upgradeMatch: "Upgrade", logout: "Logout",
    noChats: "No chats yet, go match someone!",
    clickChat: "Click to continue",
    today: "Today", expired: "Expired", match: "Match", normal: "Normal", chat: "Chat",
  }
};
