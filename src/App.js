import { useEffect, useState, useRef } from "react";
import { db, auth, provider } from "./firebase";
import {
  collection, addDoc, getDocs, query, orderBy,
  doc, updateDoc, arrayUnion, onSnapshot,
  where, setDoc, getDoc
} from "firebase/firestore";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

const MATCH_QUOTA = 3;

const COMPLEMENT_MAP = {
  想倾诉: ["想倾听"], 想倾听: ["想倾诉"],
  找饭搭子: ["找饭搭子"], 找运动伙伴: ["找运动伙伴"],
  需要鼓励: ["愿意给能量"], 愿意给能量: ["需要鼓励"],
  想聊某个话题: ["想聊某个话题"], 找搭子一起玩: ["找搭子一起玩"],
};

const MODE_OPTIONS = ["想输出", "想接收", "想一起做某事", "随缘"];

const TAG_OPTIONS = [
  "想倾诉", "想倾听", "找饭搭子", "找运动伙伴",
  "需要鼓励", "愿意给能量", "想聊某个话题", "找搭子一起玩",
];

const todayStr = () => new Date().toISOString().slice(0, 10);
const getChatId = (a, b) => [a, b].sort().join("_");

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
  const parts = text.split(/([@#][\u4e00-\u9fa5\w]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) return <span key={i} style={s.mention}>{part}</span>;
    if (part.startsWith("#")) return <span key={i} style={s.hashtag}>{part}</span>;
    return part;
  });
}

async function aiMatch(myPost, candidates) {
  const myText = `${myPost.mode} ${myPost.tags?.join(" ")} ${myPost.note || ""} ${myPost.topics?.join(" ") || ""}`.trim();
  const list = candidates.map(p => ({
    id: p.id,
    content: `${p.mode} ${p.tags?.join(" ")} ${p.note || ""} ${p.topics?.join(" ") || ""}`.trim(),
    user: p.user, userId: p.userId, avatar: p.avatar,
    mode: p.mode, tags: p.tags, note: p.note,
    topics: p.topics, likes: p.likes, comments: p.comments, date: p.date,
  }));
  const res = await fetch("http://localhost:3001/embedding-match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ myText, list }),
  });
  if (!res.ok) throw new Error("server error");
  return await res.json();
}

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [mode, setMode] = useState(MODE_OPTIONS[0]);
  const [tags, setTags] = useState([]);
  const [postText, setPostText] = useState("");
  const [isMatchPost, setIsMatchPost] = useState(true);
  const [posts, setPosts] = useState([]);
  const [myTodayMatchCount, setMyTodayMatchCount] = useState(0);
  const [matchResults, setMatchResults] = useState([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState("");
  const [hasMatched, setHasMatched] = useState(false);
  const [chatTarget, setChatTarget] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [commentInputs, setCommentInputs] = useState({});
  const [openComments, setOpenComments] = useState({});
  const [view, setView] = useState("feed");
  const [profileTarget, setProfileTarget] = useState(null);
  const [profilePosts, setProfilePosts] = useState([]);
  const [currentTopic, setCurrentTopic] = useState("");
  const [topicPosts, setTopicPosts] = useState([]);
  const [upgradeTarget, setUpgradeTarget] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const ref = doc(db, "users", u.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setProfile(snap.data());
        } else {
          const p = {
            email: u.email,
            nickname: u.displayName || u.email.split("@")[0],
            avatar: u.photoURL || "",
          };
          await setDoc(ref, p);
          setProfile(p);
        }
      } else {
        setProfile(null);
      }
    });
    return () => unsub();
  }, []);

  const fetchPosts = async () => {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setPosts(list);
    if (user) {
      const count = list.filter(p => p.userId === user.uid && p.date === todayStr() && p.isMatchPost).length;
      setMyTodayMatchCount(count);
    }
  };

  useEffect(() => { fetchPosts(); }, [user]);

  const toggleTag = (tag) => {
    setTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : prev.length < 3 ? [...prev, tag] : prev
    );
  };

  const handlePost = async () => {
    if (!user || !profile) return alert("请先登录");
    if (isMatchPost && myTodayMatchCount >= MATCH_QUOTA) {
      return alert(`今日匹配额度已用完（${MATCH_QUOTA}条），可发普通动态或升级已有普通动态`);
    }
    const { mentions, topics } = parseMentionsAndTopics(postText);
    await addDoc(collection(db, "posts"), {
      content: postText || `${mode} · ${tags.join(" / ")}`,
      mode, tags, note: postText,
      mentions, topics,
      isMatchPost, isPublic: true,
      user: profile.nickname, userId: user.uid,
      avatar: profile.avatar || "",
      date: todayStr(), createdAt: Date.now(),
      likes: [], comments: [],
    });
    for (const nickname of mentions) {
      const usersSnap = await getDocs(query(collection(db, "users"), where("nickname", "==", nickname)));
      usersSnap.forEach(async (ud) => {
        await addDoc(collection(db, "notifications"), {
          toUserId: ud.id, fromUser: profile.nickname,
          fromUserId: user.uid, type: "mention",
          text: `${profile.nickname} 在动态中提到了你`,
          createdAt: Date.now(), read: false,
        });
      });
    }
    setPostText("");
    setTags([]);
    await fetchPosts();
    if (isMatchPost) setView("match");
  };

  const handleUpgrade = async (post) => {
    if (myTodayMatchCount >= MATCH_QUOTA) {
      return alert(`今日匹配额度已满（${MATCH_QUOTA}条），无法升级`);
    }
    await updateDoc(doc(db, "posts", post.id), { isMatchPost: true });
    setUpgradeTarget(null);
    await fetchPosts();
    alert("已升级为匹配动态！");
  };

  const handleMatch = async () => {
    const myMatchPosts = posts.filter(p => p.userId === user?.uid && p.date === todayStr() && p.isMatchPost);
    if (myMatchPosts.length === 0) return alert("请先发布匹配动态");
    setMatchLoading(true);
    setMatchError("");
    setView("match");
    const myPost = myMatchPosts[0];
    const candidates = posts.filter(p => {
      if (!user || p.userId === user.uid) return false;
      if (p.date !== todayStr() || !p.isMatchPost) return false;
      const wanted = myPost.tags?.flatMap(t => COMPLEMENT_MAP[t] || [t]);
      return p.tags?.some(t => wanted?.includes(t));
    });
    if (candidates.length === 0) {
      setMatchResults([]);
      setMatchLoading(false);
      setHasMatched(true);
      return;
    }
    try {
      const ranked = await aiMatch(myPost, candidates);
      setMatchResults(ranked);
    } catch {
      setMatchError("AI服务未启动（需运行 node server.js），已显示本地匹配结果");
      setMatchResults(candidates.map(c => ({ ...c, score: 0.5 })));
    }
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
    const myMatchPosts = posts.filter(p => p.userId === user?.uid && p.date === todayStr() && p.isMatchPost);
    if (myMatchPosts.length === 0) return alert("请先发布匹配动态才能发起聊天");
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
    }
  };

  useEffect(() => {
    if (!chatTarget || !user) return;
    const chatId = getChatId(user.uid, chatTarget.userId);
    const q = query(collection(db, "messages"), where("chatId", "==", chatId), orderBy("createdAt"));
    const unsub = onSnapshot(q, snap => setMessages(snap.docs.map(d => d.data())));
    return () => unsub();
  }, [chatTarget, user]);

  const sendMessage = async () => {
    if (!chatInput.trim()) return;
    const chatId = getChatId(user.uid, chatTarget.userId);
    await addDoc(collection(db, "messages"), {
      chatId, from: profile.nickname, fromId: user.uid,
      to: chatTarget.userId, text: chatInput, createdAt: Date.now(),
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

  const remaining = MATCH_QUOTA - myTodayMatchCount;
  const myTodayMatchPosts = posts.filter(p => p.userId === user?.uid && p.date === todayStr() && p.isMatchPost);
  const publicPosts = posts.filter(p => p.isPublic !== false);

  return (
    <div style={s.container}>
      <header style={s.header}>
        <span style={s.logo}>⚡ Vibe</span>
        {user && (
          <div style={s.headerRight}>
            <span style={s.userLabel} onClick={() => openProfile(user.uid, profile?.nickname)}>
              👤 {profile?.nickname}
            </span>
            <button style={s.btnSmall} onClick={() => signOut(auth)}>退出</button>
          </div>
        )}
      </header>

      {!user && (
        <div style={s.loginBox}>
          <div style={s.loginEmoji}>⚡</div>
          <h2 style={s.loginTitle}>找到今天需要的人</h2>
          <p style={s.loginSub}>每天更新状态，匹配此刻互补的人</p>
          <button style={s.btnPrimary} onClick={() => signInWithPopup(auth, provider)}>
            用 Google 登录
          </button>
        </div>
      )}

      {user && (
        <>
          <nav style={s.nav}>
            {[{ key: "feed", label: "📋 广场" }, { key: "match", label: "🎯 匹配" }].map(({ key, label }) => (
              <button key={key}
                style={{ ...s.navBtn, ...(view === key ? s.navBtnActive : {}) }}
                onClick={() => setView(key)}
              >{label}</button>
            ))}
            {chatTarget && (
              <button
                style={{ ...s.navBtn, ...(view === "chat" ? s.navBtnActive : {}) }}
                onClick={() => setView("chat")}
              >💬 {chatTarget.nickname}</button>
            )}
          </nav>

          {view !== "chat" && view !== "profile" && view !== "topic" && (
            <div style={s.quotaBar}>
              <span>今日匹配额度</span>
              <div style={s.quotaDots}>
                {Array.from({ length: MATCH_QUOTA }).map((_, i) => (
                  <div key={i} style={{ ...s.quotaDot, background: i < myTodayMatchCount ? "#f97316" : "#e5e7eb" }} />
                ))}
              </div>
              <span style={{ color: remaining > 0 ? "#f97316" : "#aaa" }}>剩余 {remaining} 条</span>
            </div>
          )}

          {view !== "chat" && view !== "profile" && view !== "topic" && (
            <div style={s.card}>
              <div style={s.cardTitle}>
                {isMatchPost ? "📍 发布匹配动态" : "✏️ 发普通动态"}
                <div style={s.postTypeToggle}>
                  <button style={{ ...s.typeBtn, ...(isMatchPost ? s.typeBtnActive : {}) }} onClick={() => setIsMatchPost(true)}>匹配动态</button>
                  <button style={{ ...s.typeBtn, ...(!isMatchPost ? s.typeBtnActive : {}) }} onClick={() => setIsMatchPost(false)}>普通动态</button>
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

              <textarea
                style={s.textarea}
                placeholder={isMatchPost ? "补充说明，支持 @用户名 和 #话题标签（可选）" : "说点什么... 支持 @用户名 和 #话题标签"}
                maxLength={200}
                value={postText}
                rows={3}
                onChange={e => setPostText(e.target.value)}
              />
              <div style={s.charCount}>{postText.length}/200</div>

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
          )}

          {view === "feed" && (
            <div>
              <div style={s.sectionTitle}>今日动态</div>
              {publicPosts.length === 0 && <div style={s.empty}>暂无动态</div>}
              {publicPosts.map(post => (
                <PostCard key={post.id} post={post} user={user} profile={profile}
                  commentInputs={commentInputs} setCommentInputs={setCommentInputs}
                  openComments={openComments} setOpenComments={setOpenComments}
                  onLike={handleLike} onComment={handleComment}
                  onChat={openChat} onProfile={openProfile} onTopic={openTopic}
                  onUpgrade={myTodayMatchCount < MATCH_QUOTA ? setUpgradeTarget : null}
                />
              ))}
            </div>
          )}

          {view === "match" && (
            <div>
              <div style={s.sectionTitle}>🎯 今日匹配</div>
              {matchError && <div style={s.errorBanner}>{matchError}</div>}
              {myTodayMatchPosts.length === 0 && <div style={s.empty}>先发布匹配动态，才能开始匹配</div>}
              {myTodayMatchPosts.length > 0 && !hasMatched && (
                <div style={{ textAlign: "center", padding: 30 }}>
                  <button style={s.btnPrimary} onClick={handleMatch}>🎯 开始匹配</button>
                </div>
              )}
              {matchLoading && <div style={s.empty}>AI 匹配中...</div>}
              {hasMatched && !matchLoading && matchResults.length === 0 && (
                <div style={s.empty}>
                  暂无匹配，今天更新状态的人还不多~<br />
                  <button style={{ ...s.btnPrimary, marginTop: 12 }} onClick={handleMatch}>重新匹配</button>
                </div>
              )}
              {matchResults.map(post => (
                <div key={post.id} style={{ ...s.card, borderLeft: "3px solid #f97316" }}>
                  <div style={s.postHeader}>
                    <div style={s.avatarPlaceholder} onClick={() => openProfile(post.userId, post.user)}>
                      {post.avatar ? <img src={post.avatar} style={s.avatarImg} alt="" /> : post.user?.[0]}
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
                  {post.topics?.length > 0 && (
                    <div style={s.tagRow}>
                      {post.topics.map(t => (
                        <span key={t} style={s.topicBadge} onClick={() => openTopic(t)}>#{t}</span>
                      ))}
                    </div>
                  )}
                  <button style={s.btnPrimary} onClick={() => openChat(post.userId, post.user)}>💬 发起聊天</button>
                </div>
              ))}
            </div>
          )}

          {view === "chat" && chatTarget && (
            <div style={s.chatBox}>
              <div style={s.chatHeader}>
                <span onClick={() => openProfile(chatTarget.userId, chatTarget.nickname)} style={{ cursor: "pointer" }}>
                  与 <b>{chatTarget.nickname}</b> 聊天
                </span>
                <button style={s.btnSmall} onClick={() => { setChatTarget(null); setView("feed"); }}>关闭</button>
              </div>
              <div style={s.messageList}>
                {messages.length === 0 && <div style={{ ...s.empty, padding: 20 }}>发个消息打个招呼吧</div>}
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

          {view === "profile" && profileTarget && (
            <div>
              <button style={{ ...s.btnSmall, marginBottom: 12 }} onClick={() => setView("feed")}>← 返回</button>
              <div style={s.profileCard}>
                <div style={s.profileAvatar}>{profileTarget.nickname?.[0]}</div>
                <div style={s.profileName}>{profileTarget.nickname}</div>
                <div style={s.profileSub}>
                  {profilePosts.filter(p => p.isMatchPost).length} 条匹配动态 · {profilePosts.filter(p => !p.isMatchPost).length} 条普通动态
                </div>
                {profileTarget.userId !== user.uid && (
                  <button style={{ ...s.btnOrange, marginTop: 10 }} onClick={() => openChat(profileTarget.userId, profileTarget.nickname)}>
                    💬 发消息
                  </button>
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
                />
              ))}
            </div>
          )}

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
                />
              ))}
            </div>
          )}

          {upgradeTarget && (
            <div style={s.overlay}>
              <div style={s.modal}>
                <div style={s.modalTitle}>升级为匹配动态？</div>
                <div style={s.modalSub}>将占用今日 1 条匹配额度（剩余 {remaining} 条），升级后将参与今日匹配。</div>
                <button style={s.btnPrimary} onClick={() => handleUpgrade(upgradeTarget)}>确认升级</button>
                <button style={{ ...s.btnSmall, marginTop: 8, width: "100%", textAlign: "center" }} onClick={() => setUpgradeTarget(null)}>取消</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PostCard({ post, user, profile, commentInputs, setCommentInputs,
  openComments, setOpenComments, onLike, onComment, onChat, onProfile, onTopic, onUpgrade }) {
  const liked = post.likes?.includes(user?.uid);
  const showComment = openComments[post.id];
  return (
    <div style={s.card}>
      <div style={s.postHeader}>
        <div style={s.avatarPlaceholder} onClick={() => onProfile(post.userId, post.user)}>
          {post.avatar ? <img src={post.avatar} style={s.avatarImg} alt="" /> : post.user?.[0]}
        </div>
        <div style={{ flex: 1 }}>
          <div style={s.username} onClick={() => onProfile(post.userId, post.user)}>{post.user}</div>
          <div style={s.timeText}>
            {post.date === new Date().toISOString().slice(0, 10) ? "今天" : post.date}
            {post.isMatchPost
              ? <span style={s.matchBadge}>匹配</span>
              : <span style={s.normalBadge}>普通</span>
            }
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
        <button style={s.actionBtn} onClick={() => setOpenComments({ ...openComments, [post.id]: !showComment })}>
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
  userLabel: { fontSize: 13, color: "#555", cursor: "pointer" },
  nav: { display: "flex", gap: 8, padding: "12px 0" },
  navBtn: { flex: 1, padding: "8px 0", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 14, color: "#555" },
  navBtnActive: { background: "#f97316", color: "#fff", border: "1px solid #f97316", fontWeight: 600 },
  quotaBar: { display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#666", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" },
  quotaDots: { display: "flex", gap: 6 },
  quotaDot: { width: 10, height: 10, borderRadius: "50%", transition: "background 0.2s" },
  loginBox: { textAlign: "center", padding: "80px 20px" },
  loginEmoji: { fontSize: 48, marginBottom: 16 },
  loginTitle: { fontSize: 26, fontWeight: 800, marginBottom: 8, color: "#111" },
  loginSub: { color: "#888", marginBottom: 32, fontSize: 15 },
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
  textarea: { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14, marginBottom: 4, boxSizing: "border-box", outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.6 },
  charCount: { fontSize: 11, color: "#bbb", textAlign: "right", marginBottom: 10 },
  input: { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14, marginBottom: 10, boxSizing: "border-box", outline: "none" },
  btnPrimary: { padding: "10px 20px", background: "#f97316", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14, width: "100%", marginTop: 4 },
  btnOrange: { padding: "8px 16px", background: "#f97316", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14, whiteSpace: "nowrap" },
  btnSmall: { padding: "5px 12px", background: "#f3f4f6", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, color: "#444" },
  upgradeBtn: { padding: "4px 10px", background: "#fff7ed", color: "#f97316", border: "1px solid #fed7aa", borderRadius: 6, cursor: "pointer", fontSize: 12 },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: "#333", margin: "8px 0 10px" },
  empty: { textAlign: "center", color: "#bbb", padding: 40, fontSize: 14 },
  errorBanner: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#dc2626", marginBottom: 12 },
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
  chatHeader: { padding: "12px 0", fontWeight: 600, borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" },
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