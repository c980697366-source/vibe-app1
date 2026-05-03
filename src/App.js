import { useEffect, useState, useCallback } from "react";
import { db, auth } from "./firebase";
import {
  collection, addDoc, getDocs, query, orderBy,
  doc, updateDoc, arrayUnion, onSnapshot,
  where, setDoc, getDoc
} from "firebase/firestore";
import { signOut, onAuthStateChanged } from "firebase/auth";

const MATCH_QUOTA = 3;
const MATCH_WINDOW_MS = 24 * 60 * 60 * 1000; // 24小时

const COMPLEMENT_MAP = {
  想倾诉: ["想倾听"], 想倾听: ["想倾诉"],
  找饭搭子: ["找饭搭子"], 找运动伙伴: ["找运动伙伴"],
  需要鼓励: ["愿意给能量"], 愿意给能量: ["需要鼓励"],
  想聊某个话题: ["想聊某个话题"], 找搭子一起玩: ["找搭子一起玩"],
  想输出: ["想接收"], 想接收: ["想输出"],
  随缘: ["随缘"],
};

const MODE_OPTIONS = ["想输出", "想接收", "想一起做某事", "随缘"];

const TAG_OPTIONS = [
  "想倾诉", "想倾听", "找饭搭子", "找运动伙伴",
  "需要鼓励", "愿意给能量", "想聊某个话题", "找搭子一起玩",
];

const PROMPT_HINTS = [
  "今天心情怎么样？想找人聊聊吗？",
  "现在最想做的一件事是什么？",
  "你在寻找什么样的人陪你度过今天？",
  "有什么烦恼想说出来吗？",
  "想找人一起吃饭、运动或者玩游戏吗？",
  "今天需要被鼓励，还是想鼓励别人？",
];

const AVATAR_COLORS = ["#f97316","#3b82f6","#10b981","#8b5cf6","#ec4899","#f59e0b","#06b6d4","#ef4444"];

const todayStr = () => new Date().toISOString().slice(0, 10);
const getChatId = (a, b) => [a, b].sort().join("_");

const getAvatarColor = (uid) => {
  if (!uid) return AVATAR_COLORS[0];
  const idx = uid.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
};

function isWithin24h(createdAt) {
  return Date.now() - createdAt < MATCH_WINDOW_MS;
}

function parseMentionsAndTopics(text) {
  const mentions = [];
  const topics = [];
  const regex = /[@#][\u4e00-\u9fa5\w]+/g;
  const matches = text.match(regex) || [];
  matches.forEach(m => {
    if (m.startsWith("@")) mentions.push(m.slice(1));
    if (m.startsWith("#")) topics.push(m.slice(1));
  });
  return { mentions, topics };
}

function renderRichText(text) {
  if (!text) return null;
  const parts = text.split(/([@#][\u4e00-\u9fa5\w]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) return <span key={i} style={s.mention}>{part}</span>;
    if (part.startsWith("#")) return <span key={i} style={s.hashtag}>{part}</span>;
    return part;
  });
}

// 本地匹配算法（标签+文字双重匹配，兼容AI接口不可用的情况）
function localMatch(myPost, candidates) {
  return candidates.map(p => {
    let score = 0;
    // 标签互补匹配
    const wanted = myPost.tags?.flatMap(t => COMPLEMENT_MAP[t] || [t]) || [];
    const tagMatch = p.tags?.filter(t => wanted.includes(t)).length || 0;
    score += tagMatch * 0.4;
    // 模式匹配
    const modeWanted = COMPLEMENT_MAP[myPost.mode] || [myPost.mode];
    if (modeWanted.includes(p.mode)) score += 0.3;
    // 文字相似度（共同词）
    const myWords = (myPost.note || "").split(/\s+|，|。|！|？/).filter(Boolean);
    const pWords = (p.note || "").split(/\s+|，|。|！|？/).filter(Boolean);
    const commonWords = myWords.filter(w => w.length > 1 && pWords.includes(w)).length;
    score += Math.min(commonWords * 0.1, 0.3);
    return { ...p, score: Math.min(score, 1) };
  }).sort((a, b) => b.score - a.score);
}

async function aiMatch(myPost, candidates) {
  try {
    const myText = `${myPost.mode} ${myPost.tags?.join(" ")} ${myPost.note || ""}`.trim();
    const list = candidates.map(p => ({
      id: p.id,
      content: `${p.mode} ${p.tags?.join(" ")} ${p.note || ""}`.trim(),
      ...p,
    }));
    const res = await fetch("/api/embedding-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ myText, list }),
    });
    if (!res.ok) throw new Error("server error");
    return await res.json();
  } catch {
    // AI不可用时回退到本地匹配
    return localMatch(myPost, candidates);
  }
}

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [setupMode, setSetupMode] = useState(false); // 新用户设置昵称
  const [setupNickname, setSetupNickname] = useState("");
  const [setupSaving, setSetupSaving] = useState(false);

  const [mode, setMode] = useState(MODE_OPTIONS[0]);
  const [tags, setTags] = useState([]);
  const [postText, setPostText] = useState("");
  const [isMatchPost, setIsMatchPost] = useState(true);
  const [postVisibility, setPostVisibility] = useState("public"); // public / followers / mutual
  const [posts, setPosts] = useState([]);
  const [myTodayMatchCount, setMyTodayMatchCount] = useState(0);
  const [matchResults, setMatchResults] = useState([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [hasMatched, setHasMatched] = useState(false);

  const [chatList, setChatList] = useState([]); // 聊天列表
  const [chatTarget, setChatTarget] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});

  const [commentInputs, setCommentInputs] = useState({});
  const [openComments, setOpenComments] = useState({});
  const [view, setView] = useState("feed");
  const [profileTarget, setProfileTarget] = useState(null);
  const [profilePosts, setProfilePosts] = useState([]);
  const [currentTopic, setCurrentTopic] = useState("");
  const [topicPosts, setTopicPosts] = useState([]);
  const [upgradeTarget, setUpgradeTarget] = useState(null);
  const [currentHint, setCurrentHint] = useState(0);
  const [friendIds, setFriendIds] = useState([]); // 已经聊过的用户
  const [following, setFollowing] = useState([]); // 我关注的人
  const [followers, setFollowers] = useState([]); // 关注我的人
  const [extraQuota, setExtraQuota] = useState(0); // 邀请获得的额外额度

  // 轮换提示语
  useEffect(() => {
    const t = setInterval(() => setCurrentHint(h => (h + 1) % PROMPT_HINTS.length), 4000);
    return () => clearInterval(t);
  }, []);

  // 监听登录状态
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const ref = doc(db, "users", u.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          setProfile(data);
          // 如果没有昵称，进入设置模式
          if (!data.nickname || data.nickname === data.email?.split("@")[0]) {
            setSetupMode(true);
          }
        } else {
          // 新用户，进入设置模式
          setSetupMode(true);
          setSetupNickname(u.email?.split("@")[0] || "");
        }
      } else {
        setProfile(null);
        setSetupMode(false);
      }
    });
    return () => unsub();
  }, []);

  // 保存昵称
  const handleSaveSetup = async () => {
    if (!setupNickname.trim()) return alert("请输入昵称");
    setSetupSaving(true);
    const ref = doc(db, "users", user.uid);
    const p = {
      email: user.email,
      nickname: setupNickname.trim(),
      avatar: "",
      createdAt: Date.now(),
    };
    await setDoc(ref, p);
    setProfile(p);
    setSetupMode(false);
    setSetupSaving(false);
  };

  // 加载关注/粉丝关系
  const fetchFollows = useCallback(async () => {
    if (!user) return;
    const followingSnap = await getDocs(query(collection(db, "follows"), where("fromId", "==", user.uid)));
    setFollowing(followingSnap.docs.map(d => d.data().toId));
    const followerSnap = await getDocs(query(collection(db, "follows"), where("toId", "==", user.uid)));
    setFollowers(followerSnap.docs.map(d => d.data().fromId));
  }, [user]);

  useEffect(() => { fetchFollows(); }, [fetchFollows]);

  // 关注/取消关注
  const handleFollow = async (targetUserId) => {
    if (!user) return;
    const followId = `${user.uid}_${targetUserId}`;
    const ref = doc(db, "follows", followId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await snap.ref.delete ? snap.ref.delete() : updateDoc(ref, { deleted: true });
      setFollowing(prev => prev.filter(id => id !== targetUserId));
    } else {
      await setDoc(ref, { fromId: user.uid, toId: targetUserId, createdAt: Date.now() });
      setFollowing(prev => [...prev, targetUserId]);
    }
  };

  // 加载额外额度
  const fetchExtraQuota = useCallback(async () => {
    if (!user) return;
    const ref = doc(db, "inviteQuota", user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) setExtraQuota(snap.data().extra || 0);
  }, [user]);

  useEffect(() => { fetchExtraQuota(); }, [fetchExtraQuota]);

  // 注册时检测邀请码
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (!ref || ref === user.uid) return;
    // 给邀请人加3条额度
    const addQuota = async () => {
      const inviterRef = doc(db, "inviteQuota", ref);
      const snap = await getDoc(inviterRef);
      if (snap.exists()) {
        await updateDoc(inviterRef, { extra: (snap.data().extra || 0) + 3 });
      } else {
        await setDoc(inviterRef, { extra: 3 });
      }
      // 清除URL参数避免重复计算
      window.history.replaceState({}, "", window.location.pathname);
    };
    addQuota();
  }, [user]);

  // 加载聊天列表
  const fetchChatList = useCallback(async () => {
    if (!user) return;
    const q = query(collection(db, "matchFriends"), where("users", "array-contains", user.uid));
    const snap = await getDocs(q);
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setChatList(list);
    setFriendIds(list.flatMap(c => c.users).filter(id => id !== user.uid));
  }, [user]);

  useEffect(() => { fetchChatList(); }, [fetchChatList]);

  const fetchPosts = useCallback(async () => {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setPosts(list);
    if (user) {
      const count = list.filter(p => p.userId === user.uid && p.date === todayStr() && p.isMatchPost).length;
      setMyTodayMatchCount(count);
    }
  }, [user]);

  useEffect(() => { fetchPosts(); }, [user, fetchPosts]);

  // 监听未读消息
  useEffect(() => {
    if (!user || chatList.length === 0) return;
    const unsubs = chatList.map(chat => {
      const q = query(
        collection(db, "messages"),
        where("chatId", "==", chat.id),
        where("toId", "==", user.uid),
        where("read", "==", false)
      );
      return onSnapshot(q, snap => {
        setUnreadCounts(prev => ({ ...prev, [chat.id]: snap.size }));
      });
    });
    return () => unsubs.forEach(u => u());
  }, [user, chatList]);

  const toggleTag = (tag) => {
    setTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : prev.length < 3 ? [...prev, tag] : prev
    );
  };

  const handlePost = async () => {
    if (!user || !profile) return alert("请先登录");
    if (isMatchPost && myTodayMatchCount >= totalQuota) {
      return alert(`今日匹配额度已用完（${totalQuota}条）`);
    }
    const { mentions, topics } = parseMentionsAndTopics(postText);
    await addDoc(collection(db, "posts"), {
      content: postText || `${mode} · ${tags.join(" / ")}`,
      mode, tags, note: postText,
      mentions, topics,
      isMatchPost, visibility: postVisibility,
      user: profile.nickname, userId: user.uid,
      avatar: profile.avatar || "",
      date: todayStr(), createdAt: Date.now(),
      likes: [], comments: [],
    });
    setPostText("");
    setTags([]);
    await fetchPosts();
    if (isMatchPost) {
      setHasMatched(false);
      setView("match");
    }
  };

  const handleUpgrade = async (post) => {
    if (myTodayMatchCount >= totalQuota) return alert(`今日匹配额度已满`);
    await updateDoc(doc(db, "posts", post.id), { isMatchPost: true });
    setUpgradeTarget(null);
    await fetchPosts();
  };

  const handleMatch = async () => {
    const myMatchPosts = posts.filter(p =>
      p.userId === user?.uid && p.isMatchPost && isWithin24h(p.createdAt)
    );
    if (myMatchPosts.length === 0) return alert("请先发布匹配动态");
    setMatchLoading(true);
    setView("match");
    const myPost = myMatchPosts[0];
    // 24小时内有效候选人（排除自己）
    const candidates = posts.filter(p => {
      if (!user || p.userId === user.uid) return false;
      if (!p.isMatchPost || !isWithin24h(p.createdAt)) return false;
      return true;
    });
    if (candidates.length === 0) {
      setMatchResults([]);
      setMatchLoading(false);
      setHasMatched(true);
      return;
    }
    const ranked = await aiMatch(myPost, candidates);
    setMatchResults(ranked);
    setMatchLoading(false);
    setHasMatched(true);
  };

  const handleLike = async (post) => {
    if (!user || post.likes?.includes(user.uid)) return;
    await updateDoc(doc(db, "posts", post.id), { likes: arrayUnion(user.uid) });
    fetchPosts();
  };

  const handleComment = async (post) => {
    const text = commentInputs[post.id];
    if (!text?.trim()) return;
    await updateDoc(doc(db, "posts", post.id), {
      comments: arrayUnion({ user: profile.nickname, text, time: Date.now() })
    });
    setCommentInputs({ ...commentInputs, [post.id]: "" });
    fetchPosts();
  };

  const openChat = async (targetUserId, targetNickname) => {
    // 只有老朋友（已聊过）免门槛，新聊天需要先发匹配动态
    const isFriend = friendIds.includes(targetUserId);
    if (!isFriend) {
      const myMatchPosts = posts.filter(p =>
        p.userId === user?.uid && p.isMatchPost && isWithin24h(p.createdAt)
      );
      if (myMatchPosts.length === 0) return alert("请先发布匹配动态才能发起新的聊天");
    }
    setChatTarget({ userId: targetUserId, nickname: targetNickname });
    setView("chat");
    const chatId = getChatId(user.uid, targetUserId);
    const friendRef = doc(db, "matchFriends", chatId);
    const snap = await getDoc(friendRef);
    if (!snap.exists()) {
      await setDoc(friendRef, {
        users: [user.uid, targetUserId],
        nicknames: { [user.uid]: profile.nickname, [targetUserId]: targetNickname },
        createdAt: Date.now(),
      });
      await fetchChatList();
    }
  };

  useEffect(() => {
    if (!chatTarget || !user) return;
    const chatId = getChatId(user.uid, chatTarget.userId);
    const q = query(collection(db, "messages"), where("chatId", "==", chatId), orderBy("createdAt"));
    const unsub = onSnapshot(q, snap => setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, [chatTarget, user]);

  // 标记消息已读
  const markRead = useCallback(async () => {
    if (!chatTarget || !user) return;
    const chatId = getChatId(user.uid, chatTarget.userId);
    const q = query(
      collection(db, "messages"),
      where("chatId", "==", chatId),
      where("toId", "==", user.uid),
      where("read", "==", false)
    );
    const snap = await getDocs(q);
    snap.docs.forEach(d => updateDoc(d.ref, { read: true }));
    setUnreadCounts(prev => ({ ...prev, [chatId]: 0 }));
  }, [chatTarget, user]);

  useEffect(() => { if (view === "chat") markRead(); }, [view, markRead]);

  const sendMessage = async () => {
    if (!chatInput.trim()) return;
    const chatId = getChatId(user.uid, chatTarget.userId);
    await addDoc(collection(db, "messages"), {
      chatId, from: profile.nickname, fromId: user.uid,
      to: chatTarget.nickname, toId: chatTarget.userId,
      text: chatInput, createdAt: Date.now(), read: false,
    });
    setChatInput("");
  };

  const openProfile = async (targetUserId, targetNickname) => {
    setProfileTarget({ userId: targetUserId, nickname: targetNickname });
    setView("profile");
    const q = query(collection(db, "posts"), where("userId", "==", targetUserId), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    setProfilePosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const openTopic = (topic) => {
    setCurrentTopic(topic);
    setView("topic");
    setTopicPosts(posts.filter(p => p.topics?.includes(topic)));
  };

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
  const totalQuota = MATCH_QUOTA + extraQuota;
  const remaining = totalQuota - myTodayMatchCount;
  const myTodayMatchPosts = posts.filter(p => p.userId === user?.uid && p.isMatchPost && isWithin24h(p.createdAt));

  // 互关用户列表
  const mutualIds = following.filter(id => followers.includes(id));

  // 大厅显示：根据可见性和关注关系过滤
  const publicPosts = posts.filter(p => {
    if (p.userId === user?.uid) return true; // 自己的帖子始终可见
    if (p.visibility === "mutual") return mutualIds.includes(p.userId);
    if (p.visibility === "followers") return following.includes(p.userId);
    return true; // public
  });

  // ============ 新用户设置页面 ============
  if (user && setupMode) {
    return (
      <div style={s.container}>
        <div style={s.setupBox}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
          <h2 style={s.loginTitle}>设置你的昵称</h2>
          <p style={s.loginSub}>让其他人认识你</p>
          <div style={{
            width: 72, height: 72, borderRadius: "50%",
            background: getAvatarColor(user.uid),
            color: "#fff", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 28, fontWeight: 700,
            margin: "0 auto 20px",
          }}>
            {setupNickname?.[0]?.toUpperCase() || "?"}
          </div>
          <input
            style={s.input}
            placeholder="输入你的昵称（2-12个字）"
            value={setupNickname}
            maxLength={12}
            onChange={e => setSetupNickname(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSaveSetup()}
          />
          <button
            style={{ ...s.btnPrimary, opacity: setupSaving ? 0.6 : 1 }}
            onClick={handleSaveSetup}
            disabled={setupSaving}
          >
            {setupSaving ? "保存中..." : "进入氛围 →"}
          </button>
        </div>
      </div>
    );
  }

  // ============ 登录页面 ============
  if (!user) {
    return (
      <div style={s.container}>
        <div style={s.loginBox}>
          <div style={s.loginEmoji}>⚡</div>
          <h2 style={s.loginTitle}>氛围</h2>
          <p style={s.loginSub}>找到今天需要的人</p>
          <input id="email" type="email" placeholder="输入邮箱" style={{ ...s.input, marginBottom: 8 }} />
          <input id="password" type="password" placeholder="输入密码（6位以上）" style={{ ...s.input, marginBottom: 16 }} />
          <button style={s.btnPrimary} onClick={() => {
            const email = document.getElementById("email").value;
            const password = document.getElementById("password").value;
            if (!email || !password) return alert("请填写邮箱和密码");
            import("firebase/auth").then(({ signInWithEmailAndPassword, createUserWithEmailAndPassword }) => {
              signInWithEmailAndPassword(auth, email, password)
                .catch(() => createUserWithEmailAndPassword(auth, email, password)
                  .catch(err => alert(err.message)));
            });
          }}>
            一键登录 / 注册
          </button>
        </div>
      </div>
    );
  }

  // ============ 主界面 ============
  return (
    <div style={s.container}>
      <header style={s.header}>
        <span style={s.logo}>⚡ 氛围</span>
        <div style={s.headerRight}>
          <span style={s.userLabel} onClick={() => openProfile(user.uid, profile?.nickname)}>
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: "50%",
              background: getAvatarColor(user.uid), color: "#fff",
              fontSize: 13, fontWeight: 700, marginRight: 6,
            }}>{profile?.nickname?.[0]?.toUpperCase()}</span>
            {profile?.nickname}
          </span>
          <button style={s.btnSmall} onClick={() => signOut(auth)}>退出</button>
        </div>
      </header>

      <nav style={s.nav}>
        {[
          { key: "feed", label: "广场" },
          { key: "match", label: "匹配" },
          { key: "chats", label: totalUnread > 0 ? `消息 ${totalUnread}` : "消息" },
        ].map(({ key, label }) => (
          <button key={key}
            style={{ ...s.navBtn, ...(view === key ? s.navBtnActive : {}), ...(key === "chats" && totalUnread > 0 ? { color: view === key ? "#fff" : "#f97316" } : {}) }}
            onClick={() => setView(key)}
          >{label}</button>
        ))}
      </nav>

      {/* 发布区域 - 广场和匹配页都显示 */}
      {(view === "feed" || view === "match") && (
        <>
          <div style={s.quotaBar}>
            <span style={{ color: "#666", fontSize: 13 }}>今日匹配额度</span>
            <div style={s.quotaDots}>
              {Array.from({ length: totalQuota }).map((_, i) => (
                <div key={i} style={{ ...s.quotaDot, background: i < myTodayMatchCount ? "#f97316" : "#e5e7eb" }} />
              ))}
            </div>
            <span style={{ color: remaining > 0 ? "#f97316" : "#aaa", fontSize: 13 }}>剩余 {remaining} 条</span>
          </div>

          {remaining === 0 && (
            <div style={s.inviteBanner}>
              🎁 今日额度已用完 · <span style={{ color: "#f97316", cursor: "pointer", fontWeight: 600 }}
                onClick={() => {
                  const link = `${window.location.origin}?ref=${user.uid}`;
                  navigator.clipboard?.writeText(link);
                  alert(`邀请链接已复制！\n${link}\n邀请1位好友注册，获得额外3条额度`);
                }}>
                邀请好友解锁额外3条 →
              </span>
            </div>
          )}

          <div style={s.card}>
            <div style={s.cardTitle}>
              <span>{isMatchPost ? "📍 发布匹配动态" : "✏️ 普通动态"}</span>
              <div style={s.postTypeToggle}>
                <button style={{ ...s.typeBtn, ...(isMatchPost ? s.typeBtnActive : {}) }} onClick={() => setIsMatchPost(true)}>匹配</button>
                <button style={{ ...s.typeBtn, ...(!isMatchPost ? s.typeBtnActive : {}) }} onClick={() => setIsMatchPost(false)}>普通</button>
              </div>
            </div>

            {isMatchPost && (
              <>
                <div style={s.fieldLabel}>今天的模式</div>
                <div style={s.tagRow}>
                  {MODE_OPTIONS.map(m => (
                    <button key={m} style={{ ...s.tag, ...(mode === m ? s.tagActive : {}) }} onClick={() => setMode(m)}>{m}</button>
                  ))}
                </div>
                <div style={s.fieldLabel}>需求标签（最多3个）</div>
                <div style={s.tagRow}>
                  {TAG_OPTIONS.map(t => (
                    <button key={t} style={{ ...s.tag, ...(tags.includes(t) ? s.tagActive : {}) }} onClick={() => toggleTag(t)}>{t}</button>
                  ))}
                </div>
              </>
            )}

            <div style={{ position: "relative" }}>
              <textarea
                style={s.textarea}
                placeholder={PROMPT_HINTS[currentHint]}
                maxLength={200}
                value={postText}
                rows={3}
                onChange={e => setPostText(e.target.value)}
              />
              <div style={s.charCount}>{postText.length}/200</div>
            </div>

            {/* 可见性设置 */}
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              <span style={s.fieldLabel}>可见性：</span>
              {[
                { val: "public", label: "🌐 公开" },
                { val: "followers", label: "👥 粉丝" },
                { val: "mutual", label: "🔒 互关" },
              ].map(({ val, label }) => (
                <button key={val}
                  style={{ ...s.typeBtn, ...(postVisibility === val ? s.typeBtnActive : {}) }}
                  onClick={() => setPostVisibility(val)}
                >{label}</button>
              ))}
            </div>

            <button
              style={{ ...s.btnPrimary, opacity: isMatchPost && remaining === 0 ? 0.5 : 1 }}
              onClick={handlePost}
              disabled={isMatchPost && remaining === 0}
            >
              {isMatchPost
                ? remaining === 0 ? "今日匹配额度已满" : `发布（剩余 ${remaining} 条）`
                : "发布普通动态"
              }
            </button>
          </div>
        </>
      )}

      {/* 广场 */}
      {view === "feed" && (
        <div>
          <div style={s.sectionTitle}>今日动态</div>
          {publicPosts.length === 0 && <div style={s.empty}>暂无动态，快来发第一条吧</div>}
          {publicPosts.map(post => (
            <PostCard key={post.id} post={post} user={user} profile={profile}
              commentInputs={commentInputs} setCommentInputs={setCommentInputs}
              openComments={openComments} setOpenComments={setOpenComments}
              onLike={handleLike} onComment={handleComment}
              onChat={openChat} onProfile={openProfile} onTopic={openTopic}
              onUpgrade={myTodayMatchCount < totalQuota ? setUpgradeTarget : null}
              isWithin24h={isWithin24h}
            />
          ))}
        </div>
      )}

      {/* 匹配 */}
      {view === "match" && (
        <div>
          <div style={s.sectionTitle}>🎯 今日匹配</div>
          {myTodayMatchPosts.length === 0 && (
            <div style={s.emptyMatch}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🎯</div>
              <div>先发布匹配动态，才能开始匹配</div>
            </div>
          )}
          {myTodayMatchPosts.length > 0 && !hasMatched && (
            <div style={{ textAlign: "center", padding: 24 }}>
              <button style={s.btnPrimary} onClick={handleMatch}>开始匹配</button>
            </div>
          )}
          {matchLoading && (
            <div style={s.emptyMatch}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
              <div>匹配中...</div>
            </div>
          )}
          {hasMatched && !matchLoading && matchResults.length === 0 && (
            <div style={s.emptyMatch}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
              <div style={{ marginBottom: 16 }}>暂时没有匹配的人，稍后再试～</div>
              <button style={s.btnPrimary} onClick={handleMatch}>重新匹配</button>
            </div>
          )}
          {matchResults.map(post => (
            <div key={post.id} style={{ ...s.card, borderLeft: "3px solid #f97316" }}>
              <div style={s.postHeader}>
                <div style={{ ...s.avatarPlaceholder, background: getAvatarColor(post.userId) }}
                  onClick={() => openProfile(post.userId, post.user)}>
                  {post.user?.[0]}
                </div>
                <div>
                  <div style={s.username}>{post.user}</div>
                  <div style={s.matchScore}>匹配度 {Math.round((post.score || 0) * 100)}%</div>
                </div>
              </div>
              <div style={s.tagRow}>
                {post.tags?.map(t => <span key={t} style={s.tagBadge}>{t}</span>)}
              </div>
              {post.note && <div style={s.noteText}>{renderRichText(post.note)}</div>}
              <button style={s.btnPrimary} onClick={() => openChat(post.userId, post.user)}>
                💬 发起聊天
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 聊天列表 */}
      {view === "chats" && (
        <div>
          <div style={s.sectionTitle}>💬 消息</div>
          {chatList.length === 0 && (
            <div style={s.empty}>还没有聊天记录，去匹配认识新朋友吧</div>
          )}
          {chatList.map(chat => {
            const otherId = chat.users.find(id => id !== user.uid);
            const otherName = chat.nicknames?.[otherId] || "用户";
            const unread = unreadCounts[chat.id] || 0;
            return (
              <div key={chat.id} style={{ ...s.card, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
                onClick={() => { setChatTarget({ userId: otherId, nickname: otherName }); setView("chat"); }}>
                <div style={{ ...s.avatarPlaceholder, background: getAvatarColor(otherId), flexShrink: 0 }}>
                  {otherName[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{otherName}</div>
                  <div style={{ fontSize: 12, color: "#aaa", marginTop: 2 }}>点击继续聊天</div>
                </div>
                {unread > 0 && (
                  <div style={s.unreadBadge}>{unread}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 聊天窗口 */}
      {view === "chat" && chatTarget && (
        <div style={s.chatBox}>
          <div style={s.chatHeader}>
            <button style={s.btnSmall} onClick={() => setView("chats")}>← 返回</button>
            <span style={{ fontWeight: 600, cursor: "pointer" }}
              onClick={() => openProfile(chatTarget.userId, chatTarget.nickname)}>
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 28, height: 28, borderRadius: "50%",
                background: getAvatarColor(chatTarget.userId), color: "#fff",
                fontSize: 13, fontWeight: 700, marginRight: 6,
              }}>{chatTarget.nickname?.[0]}</span>
              {chatTarget.nickname}
            </span>
            <button style={s.btnSmall} onClick={() => { setChatTarget(null); setView("feed"); }}>关闭</button>
          </div>
          <div style={s.messageList}>
            {messages.length === 0 && <div style={{ ...s.empty, padding: 20 }}>发个消息打个招呼吧 👋</div>}
            {messages.map((m, i) => (
              <div key={i} style={{
                ...s.messageBubble,
                alignSelf: m.fromId === user.uid ? "flex-end" : "flex-start",
                background: m.fromId === user.uid ? "#f97316" : "#f3f4f6",
                color: m.fromId === user.uid ? "#fff" : "#111",
              }}>{m.text}</div>
            ))}
          </div>
          <div style={s.chatInputRow}>
            <input style={{ ...s.input, flex: 1, marginBottom: 0 }}
              value={chatInput} placeholder="说点什么..."
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendMessage()}
            />
            <button style={s.btnOrange} onClick={sendMessage}>发送</button>
          </div>
        </div>
      )}

      {/* 个人主页 */}
      {view === "profile" && profileTarget && (
        <div>
          <button style={{ ...s.btnSmall, marginBottom: 12 }} onClick={() => setView("feed")}>← 返回</button>
          <div style={s.profileCard}>
            <div style={{
              ...s.profileAvatar,
              background: getAvatarColor(profileTarget.userId),
            }}>{profileTarget.nickname?.[0]?.toUpperCase()}</div>
            <div style={s.profileName}>{profileTarget.nickname}</div>
            <div style={s.profileSub}>
              {profilePosts.filter(p => p.isMatchPost).length} 条匹配动态 · {profilePosts.filter(p => !p.isMatchPost).length} 条普通动态
            </div>
            {profileTarget.userId !== user.uid && (
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
                <button
                  style={following.includes(profileTarget.userId)
                    ? { ...s.btnSmall, marginTop: 0 }
                    : { ...s.btnOrange }}
                  onClick={() => handleFollow(profileTarget.userId)}
                >
                  {following.includes(profileTarget.userId) ? "✓ 已关注" : "+ 关注"}
                </button>
                <button style={s.btnOrange}
                  onClick={() => openChat(profileTarget.userId, profileTarget.nickname)}>
                  💬 发消息
                </button>
              </div>
            )}
          </div>
          <div style={s.sectionTitle}>全部动态</div>
          {profilePosts.length === 0 && <div style={s.empty}>暂无动态</div>}
          {profilePosts.map(post => (
            <PostCard key={post.id} post={post} user={user} profile={profile}
              commentInputs={commentInputs} setCommentInputs={setCommentInputs}
              openComments={openComments} setOpenComments={setOpenComments}
              onLike={handleLike} onComment={handleComment}
              onChat={openChat} onProfile={openProfile} onTopic={openTopic}
              isWithin24h={isWithin24h}
            />
          ))}
        </div>
      )}

      {/* 话题页 */}
      {view === "topic" && (
        <div>
          <button style={{ ...s.btnSmall, marginBottom: 12 }} onClick={() => setView("feed")}>← 返回</button>
          <div style={s.sectionTitle}># {currentTopic}</div>
          {topicPosts.length === 0 && <div style={s.empty}>暂无相关动态</div>}
          {topicPosts.map(post => (
            <PostCard key={post.id} post={post} user={user} profile={profile}
              commentInputs={commentInputs} setCommentInputs={setCommentInputs}
              openComments={openComments} setOpenComments={setOpenComments}
              onLike={handleLike} onComment={handleComment}
              onChat={openChat} onProfile={openProfile} onTopic={openTopic}
              isWithin24h={isWithin24h}
            />
          ))}
        </div>
      )}

      {/* 升级匹配弹窗 */}
      {upgradeTarget && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <div style={s.modalTitle}>升级为匹配动态？</div>
            <div style={s.modalSub}>将占用今日 1 条匹配额度（剩余 {remaining} 条），升级后参与今日匹配。</div>
            <button style={s.btnPrimary} onClick={() => handleUpgrade(upgradeTarget)}>确认升级</button>
            <button style={{ ...s.btnSmall, marginTop: 8, width: "100%", textAlign: "center" }}
              onClick={() => setUpgradeTarget(null)}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PostCard({ post, user, profile, commentInputs, setCommentInputs,
  openComments, setOpenComments, onLike, onComment, onChat, onProfile, onTopic, onUpgrade, isWithin24h }) {
  const liked = post.likes?.includes(user?.uid);
  const showComment = openComments[post.id];
  const expired = !isWithin24h(post.createdAt);

  return (
    <div style={{ ...s.card, opacity: expired && post.isMatchPost ? 0.6 : 1 }}>
      <div style={s.postHeader}>
        <div style={{ ...s.avatarPlaceholder, background: getAvatarColor(post.userId) }}
          onClick={() => onProfile(post.userId, post.user)}>
          {post.avatar ? <img src={post.avatar} style={s.avatarImg} alt="" /> : post.user?.[0]}
        </div>
        <div style={{ flex: 1 }}>
          <div style={s.username} onClick={() => onProfile(post.userId, post.user)}>{post.user}</div>
          <div style={s.timeText}>
            {post.date === new Date().toISOString().slice(0, 10) ? "今天" : post.date}
            {post.isMatchPost
              ? <span style={{ ...s.matchBadge, ...(expired ? { opacity: 0.5 } : {}) }}>
                  {expired ? "已过期" : "匹配"}
                </span>
              : <span style={s.normalBadge}>普通</span>
            }
            {post.visibility === "mutual" && <span style={s.visibilityBadge}>🔒</span>}
            {post.visibility === "followers" && <span style={s.visibilityBadge}>👥</span>}
          </div>
        </div>
        {user && post.userId === user.uid && !post.isMatchPost && onUpgrade && (
          <button style={s.upgradeBtn} onClick={() => onUpgrade(post)}>升级匹配</button>
        )}
      </div>
      {post.tags?.length > 0 && (
        <div style={s.tagRow}>
          {post.tags.map(t => <span key={t} style={s.tagBadge}>{t}</span>)}
        </div>
      )}
      <div style={s.postContent}>{renderRichText(post.content || "")}</div>
      {post.topics?.length > 0 && (
        <div style={s.tagRow}>
          {post.topics.map(t => (
            <span key={t} style={s.topicBadge} onClick={() => onTopic(t)}>#{t}</span>
          ))}
        </div>
      )}
      <div style={s.actionRow}>
        <button style={{ ...s.actionBtn, color: liked ? "#f97316" : "#888" }} onClick={() => onLike(post)}>
          👍 {post.likes?.length || 0}
        </button>
        <button style={s.actionBtn}
          onClick={() => setOpenComments({ ...openComments, [post.id]: !showComment })}>
          💬 {post.comments?.length || 0}
        </button>
        {user && post.userId !== user.uid && (
          <button style={s.actionBtn} onClick={() => onChat(post.userId, post.user)}>✉️ 聊聊</button>
        )}
      </div>
      {showComment && (
        <div style={s.commentSection}>
          {post.comments?.map((c, i) => (
            <div key={i} style={s.commentItem}><b>{c.user}:</b> {c.text}</div>
          ))}
          {user && (
            <div style={s.commentInputRow}>
              <input style={{ ...s.input, flex: 1, marginBottom: 0 }}
                placeholder="写评论..."
                value={commentInputs[post.id] || ""}
                onChange={e => setCommentInputs({ ...commentInputs, [post.id]: e.target.value })}
                onKeyDown={e => e.key === "Enter" && onComment(post)}
              />
              <button style={s.btnSmall} onClick={() => onComment(post)}>发送</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const s = {
  container: { maxWidth: 600, margin: "0 auto", padding: "0 16px 100px", fontFamily: "'PingFang SC', 'Helvetica Neue', sans-serif", background: "#f8f8f6", minHeight: "100vh" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid #eee", position: "sticky", top: 0, background: "#f8f8f6", zIndex: 10 },
  logo: { fontSize: 22, fontWeight: 800, color: "#f97316", letterSpacing: -1 },
  headerRight: { display: "flex", alignItems: "center", gap: 10 },
  userLabel: { fontSize: 13, color: "#555", cursor: "pointer", display: "flex", alignItems: "center" },
  nav: { display: "flex", gap: 8, padding: "12px 0" },
  navBtn: { flex: 1, padding: "8px 0", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 14, color: "#555" },
  navBtnActive: { background: "#f97316", color: "#fff", border: "1px solid #f97316", fontWeight: 600 },
  quotaBar: { display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", borderRadius: 10, padding: "10px 14px", marginBottom: 8, fontSize: 13, color: "#666", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" },
  quotaDots: { display: "flex", gap: 6 },
  quotaDot: { width: 10, height: 10, borderRadius: "50%", transition: "background 0.2s" },
  inviteBanner: { background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "10px 14px", marginBottom: 8, fontSize: 13, color: "#92400e" },
  loginBox: { textAlign: "center", padding: "80px 20px" },
  setupBox: { textAlign: "center", padding: "60px 20px" },
  loginEmoji: { fontSize: 48, marginBottom: 16 },
  loginTitle: { fontSize: 26, fontWeight: 800, marginBottom: 8, color: "#111" },
  loginSub: { color: "#888", marginBottom: 24, fontSize: 15 },
  card: { background: "#fff", borderRadius: 14, padding: 16, marginBottom: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" },
  cardTitle: { fontWeight: 700, marginBottom: 12, fontSize: 15, display: "flex", justifyContent: "space-between", alignItems: "center" },
  postTypeToggle: { display: "flex", gap: 4 },
  typeBtn: { padding: "4px 10px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontSize: 12, color: "#666" },
  typeBtnActive: { background: "#f97316", color: "#fff", border: "1px solid #f97316" },
  fieldLabel: { fontSize: 12, color: "#999", marginBottom: 6, marginTop: 10 },
  tagRow: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  tag: { padding: "5px 12px", borderRadius: 20, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontSize: 13, color: "#444" },
  tagActive: { background: "#f97316", color: "#fff", border: "1px solid #f97316" },
  tagBadge: { padding: "3px 10px", borderRadius: 20, background: "#fff7ed", color: "#f97316", fontSize: 12, border: "1px solid #fed7aa" },
  topicBadge: { padding: "3px 10px", borderRadius: 20, background: "#eff6ff", color: "#3b82f6", fontSize: 12, border: "1px solid #bfdbfe", cursor: "pointer" },
  visibilityBadge: { fontSize: 11, padding: "1px 6px" },
  textarea: { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14, marginBottom: 4, boxSizing: "border-box", outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.6 },
  charCount: { fontSize: 11, color: "#bbb", textAlign: "right", marginBottom: 10 },
  input: { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14, marginBottom: 10, boxSizing: "border-box", outline: "none" },
  btnPrimary: { padding: "10px 20px", background: "#f97316", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14, width: "100%", marginTop: 4 },
  btnOrange: { padding: "8px 16px", background: "#f97316", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14, whiteSpace: "nowrap" },
  btnSmall: { padding: "5px 12px", background: "#f3f4f6", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, color: "#444" },
  upgradeBtn: { padding: "4px 10px", background: "#fff7ed", color: "#f97316", border: "1px solid #fed7aa", borderRadius: 6, cursor: "pointer", fontSize: 12 },
  unreadBadge: { background: "#f97316", color: "#fff", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: "#333", margin: "8px 0 10px" },
  empty: { textAlign: "center", color: "#bbb", padding: 40, fontSize: 14 },
  emptyMatch: { textAlign: "center", color: "#bbb", padding: 40, fontSize: 14, lineHeight: 1.6 },
  postHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 },
  avatarPlaceholder: { width: 38, height: 38, borderRadius: "50%", background: "#f97316", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16, flexShrink: 0, cursor: "pointer", overflow: "hidden" },
  avatarImg: { width: "100%", height: "100%", objectFit: "cover" },
  username: { fontWeight: 600, fontSize: 14, cursor: "pointer" },
  timeText: { fontSize: 12, color: "#aaa", display: "flex", alignItems: "center", gap: 6 },
  matchBadge: { fontSize: 11, padding: "1px 7px", borderRadius: 10, background: "#fff7ed", color: "#f97316", border: "1px solid #fed7aa" },
  normalBadge: { fontSize: 11, padding: "1px 7px", borderRadius: 10, background: "#f3f4f6", color: "#888", border: "1px solid #e5e7eb" },
  matchScore: { fontSize: 12, color: "#f97316", fontWeight: 600 },
  postContent: { fontSize: 14, color: "#333", marginBottom: 10, lineHeight: 1.7 },
  noteText: { fontSize: 13, color: "#555", marginBottom: 10, lineHeight: 1.6 },
  mention: { color: "#3b82f6", fontWeight: 600 },
  hashtag: { color: "#f97316", fontWeight: 600, cursor: "pointer" },
  actionRow: { display: "flex", gap: 20, marginTop: 6 },
  actionBtn: { background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#888", padding: 0 },
  commentSection: { marginTop: 12, borderTop: "1px solid #f5f5f5", paddingTop: 10 },
  commentItem: { fontSize: 13, color: "#555", marginBottom: 6 },
  commentInputRow: { display: "flex", gap: 8, marginTop: 8 },
  chatBox: { display: "flex", flexDirection: "column", height: "calc(100vh - 160px)" },
  chatHeader: { padding: "12px 0", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" },
  messageList: { flex: 1, overflowY: "auto", padding: "12px 0", display: "flex", flexDirection: "column", gap: 8 },
  messageBubble: { maxWidth: "72%", padding: "8px 14px", borderRadius: 16, fontSize: 14, lineHeight: 1.5 },
  chatInputRow: { display: "flex", gap: 8, paddingTop: 10, borderTop: "1px solid #eee" },
  profileCard: { background: "#fff", borderRadius: 14, padding: 24, textAlign: "center", marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" },
  profileAvatar: { width: 72, height: 72, borderRadius: "50%", background: "#f97316", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 700, margin: "0 auto 12px" },
  profileName: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  profileSub: { fontSize: 13, color: "#aaa" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
  modal: { background: "#fff", borderRadius: 16, padding: 24, width: "85%", maxWidth: 360, boxShadow: "0 8px 32px rgba(0,0,0,0.15)" },
  modalTitle: { fontSize: 17, fontWeight: 700, marginBottom: 8 },
  modalSub: { fontSize: 14, color: "#666", marginBottom: 16, lineHeight: 1.6 },
};