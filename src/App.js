import { useState, useEffect, useCallback } from "react";
import { db } from "./firebase";
import { collection, getDocs, query, orderBy, doc, where } from "firebase/firestore";

import { useAuth } from "./hooks/useAuth";
import { usePosts } from "./hooks/usePosts";
import { useChat } from "./hooks/useChat";
import { useFollow } from "./hooks/useFollow";

import { PostForm } from "./components/PostForm";
import { PostCard } from "./components/PostCard";
import { Feed } from "./pages/Feed";
import { Match } from "./pages/Match";
import { Chats, ChatWindow } from "./pages/Chats";
import { Profile } from "./pages/Profile";

import { s } from "./styles";
import { getAvatarColor, isWithin24h } from "./utils";
import { LANG } from "./constants";

export default function App() {
  const { user, profile, setupMode, saveProfile, logout, loading } = useAuth();
  const { following, followers, mutualIds, extraQuota, handleFollow } = useFollow(user);
  const {
    posts, fetchPosts, myTodayMatchCount, totalQuota,
    matchResults, matchLoading, hasMatched, setHasMatched,
    handlePost, handleUpgrade, handleMatch, handleLike, handleComment,
  } = usePosts(user, profile, extraQuota);
  const {
    chatList, chatTarget, setChatTarget,
    chatInput, setChatInput,
    messages, unreadCounts, totalUnread,
    openChat, sendMessage, markRead,
  } = useChat(user, profile, posts);

  const [view, setView] = useState("feed");
  const [lang, setLang] = useState("zh");
  const [setupNickname, setSetupNickname] = useState("");
  const [setupSaving, setSetupSaving] = useState(false);
  const [commentInputs, setCommentInputs] = useState({});
  const [openComments, setOpenComments] = useState({});
  const [profileTarget, setProfileTarget] = useState(null);
  const [profilePosts, setProfilePosts] = useState([]);
  const [currentTopic, setCurrentTopic] = useState("");
  const [topicPosts, setTopicPosts] = useState([]);
  const [upgradeTarget, setUpgradeTarget] = useState(null);

  const t = LANG[lang];

  useEffect(() => { if (user) fetchPosts(); }, [user, fetchPosts]);

  const handleSaveSetup = async () => {
    if (!setupNickname.trim()) return alert(lang === "zh" ? "请输入昵称" : "Please enter a nickname");
    setSetupSaving(true);
    await saveProfile(user.uid, {
      email: user.email,
      nickname: setupNickname.trim(),
      avatar: "",
      createdAt: Date.now(),
    });
    setSetupSaving(false);
  };

  const openProfile = useCallback(async (targetUserId, targetNickname) => {
    setProfileTarget({ userId: targetUserId, nickname: targetNickname });
    setView("profile");
    const q = query(collection(db, "posts"), where("userId", "==", targetUserId), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    setProfilePosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, []);

  const openTopic = useCallback((topic) => {
    setCurrentTopic(topic);
    setView("topic");
    setTopicPosts(posts.filter(p => p.topics?.includes(topic)));
  }, [posts]);

  const handleOpenChat = async (targetUserId, targetNickname) => {
    const result = await openChat(targetUserId, targetNickname, t);
    if (result === "chat") setView("chat");
  };

  const remaining = totalQuota - myTodayMatchCount;
  const myTodayMatchPosts = posts.filter(p =>
    p.userId === user?.uid && p.isMatchPost && isWithin24h(p.createdAt)
  );

  if (loading) return <div style={{ ...s.container, display: "flex", alignItems: "center", justifyContent: "center" }}>⚡</div>;

  // ── Setup page ──
  if (user && setupMode) {
    return (
      <div style={s.container}>
        <div style={s.setupBox}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
          <h2 style={s.loginTitle}>{t.setupTitle}</h2>
          <p style={s.loginSub}>{t.setupSub}</p>
          <div style={{
            width: 72, height: 72, borderRadius: "50%",
            background: getAvatarColor(user.uid), color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28, fontWeight: 700, margin: "0 auto 20px",
          }}>
            {setupNickname?.[0]?.toUpperCase() || "?"}
          </div>
          <input
            style={s.input}
            placeholder={t.nicknamePlaceholder}
            value={setupNickname}
            maxLength={12}
            onChange={e => setSetupNickname(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSaveSetup()}
          />
          <button style={{ ...s.btnPrimary, opacity: setupSaving ? 0.6 : 1 }} onClick={handleSaveSetup} disabled={setupSaving}>
            {setupSaving ? t.saving : t.enter}
          </button>
        </div>
      </div>
    );
  }

  // ── Login page ──
  if (!user) {
    return (
      <div style={s.container}>
        <div style={s.loginBox}>
          <div style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 4 }}>
            <button style={{ ...s.btnSmall, fontWeight: lang === "zh" ? 700 : 400 }} onClick={() => setLang("zh")}>中</button>
            <button style={{ ...s.btnSmall, fontWeight: lang === "en" ? 700 : 400 }} onClick={() => setLang("en")}>EN</button>
          </div>
          <div style={s.loginEmoji}>⚡</div>
          <h2 style={s.loginTitle}>{t.appName}</h2>
          <p style={s.loginSub}>{t.tagline}</p>
          <input id="email" type="email" placeholder={t.emailPlaceholder} style={{ ...s.input, marginBottom: 8 }} />
          <input id="password" type="password" placeholder={t.passwordPlaceholder} style={{ ...s.input, marginBottom: 16 }} />
          <button style={s.btnPrimary} onClick={() => {
            const email = document.getElementById("email").value;
            const password = document.getElementById("password").value;
            if (!email || !password) return alert(lang === "zh" ? "请填写邮箱和密码" : "Please enter email and password");
            import("firebase/auth").then(({ signInWithEmailAndPassword, createUserWithEmailAndPassword }) => {
              signInWithEmailAndPassword(auth, email, password)
                .catch(() => createUserWithEmailAndPassword(auth, email, password)
                  .catch(err => alert(err.message)));
            });
          }}>{t.login}</button>
        </div>
      </div>
    );
  }

  // ── Main app ──
  return (
    <div style={s.container}>
      <header style={s.header}>
        <span style={s.logo}>⚡ {t.appName}</span>
        <div style={s.headerRight}>
          <button style={{ ...s.btnSmall, padding: "3px 8px", fontSize: 11, fontWeight: lang === "zh" ? 700 : 400 }} onClick={() => setLang("zh")}>中</button>
          <button style={{ ...s.btnSmall, padding: "3px 8px", fontSize: 11, fontWeight: lang === "en" ? 700 : 400 }} onClick={() => setLang("en")}>EN</button>
          <span style={s.userLabel} onClick={() => openProfile(user.uid, profile?.nickname)}>
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: "50%",
              background: getAvatarColor(user.uid), color: "#fff",
              fontSize: 13, fontWeight: 700, marginRight: 6,
            }}>{profile?.nickname?.[0]?.toUpperCase()}</span>
            {profile?.nickname}
          </span>
          <button style={s.btnSmall} onClick={logout}>{t.logout}</button>
        </div>
      </header>

      <nav style={s.nav}>
        {[
          { key: "feed", label: t.feed },
          { key: "match", label: t.match },
          { key: "chats", label: totalUnread > 0 ? `${t.chats} ${totalUnread}` : t.chats },
        ].map(({ key, label }) => (
          <button key={key}
            style={{ ...s.navBtn, ...(view === key ? s.navBtnActive : {}), ...(key === "chats" && totalUnread > 0 && view !== key ? { color: "#f97316" } : {}) }}
            onClick={() => setView(key)}
          >{label}</button>
        ))}
      </nav>

      {/* Quota bar */}
      {(view === "feed" || view === "match") && (
        <>
          <div style={s.quotaBar}>
            <span style={{ color: "#666", fontSize: 13 }}>{t.quotaBar}</span>
            <div style={s.quotaDots}>
              {Array.from({ length: totalQuota }).map((_, i) => (
                <div key={i} style={{ ...s.quotaDot, background: i < myTodayMatchCount ? "#f97316" : "#e5e7eb" }} />
              ))}
            </div>
            <span style={{ color: remaining > 0 ? "#f97316" : "#aaa", fontSize: 13 }}>{t.remaining(remaining)}</span>
          </div>
          {remaining === 0 && (
            <div style={s.inviteBanner}>
              🎁 {t.quotaUsed}{" "}
              <span style={{ color: "#f97316", cursor: "pointer", fontWeight: 600 }}
                onClick={() => {
                  const link = `${window.location.origin}?ref=${user.uid}`;
                  navigator.clipboard?.writeText(link);
                  alert(t.inviteAlert(link));
                }}>
                {t.inviteText}
              </span>
            </div>
          )}
          <PostForm
            user={user}
            myTodayMatchCount={myTodayMatchCount}
            totalQuota={totalQuota}
            onPost={async (params) => {
              const result = await handlePost({ ...params, t });
              if (result && params.isMatchPost) {
                setHasMatched(false);
                setView("match");
              }
              return result;
            }}
            t={t}
          />
        </>
      )}

      {/* Pages */}
      {view === "feed" && (
        <Feed
          posts={posts} user={user} profile={profile}
          following={following} mutualIds={mutualIds}
          commentInputs={commentInputs} setCommentInputs={setCommentInputs}
          openComments={openComments} setOpenComments={setOpenComments}
          onLike={handleLike}
          onComment={(post) => handleComment(post, commentInputs, setCommentInputs)}
          onChat={handleOpenChat} onProfile={openProfile} onTopic={openTopic}
          onUpgrade={setUpgradeTarget}
          myTodayMatchCount={myTodayMatchCount} totalQuota={totalQuota}
          t={t}
        />
      )}

      {view === "match" && (
        <Match
          myTodayMatchPosts={myTodayMatchPosts}
          matchResults={matchResults}
          matchLoading={matchLoading}
          hasMatched={hasMatched}
          onMatch={() => handleMatch(t)}
          onChat={handleOpenChat}
          onProfile={openProfile}
          t={t}
        />
      )}

      {view === "chats" && (
        <Chats
          chatList={chatList} user={user}
          unreadCounts={unreadCounts}
          onOpenChat={(id, name) => { setChatTarget({ userId: id, nickname: name }); setView("chat"); }}
          t={t}
        />
      )}

      {view === "chat" && chatTarget && (
        <ChatWindow
          chatTarget={chatTarget}
          messages={messages}
          chatInput={chatInput}
          setChatInput={setChatInput}
          user={user} profile={profile}
          onSend={sendMessage}
          onBack={() => setView("chats")}
          onClose={() => { setChatTarget(null); setView("feed"); }}
          onProfile={openProfile}
          markRead={markRead}
          t={t}
        />
      )}

      {view === "profile" && (
        <Profile
          profileTarget={profileTarget}
          profilePosts={profilePosts}
          user={user} profile={profile}
          following={following}
          onFollow={handleFollow}
          onChat={handleOpenChat}
          onBack={() => setView("feed")}
          commentInputs={commentInputs} setCommentInputs={setCommentInputs}
          openComments={openComments} setOpenComments={setOpenComments}
          onLike={handleLike}
          onComment={(post) => handleComment(post, commentInputs, setCommentInputs)}
          onProfile={openProfile} onTopic={openTopic}
          t={t}
        />
      )}

      {view === "topic" && (
        <div>
          <button style={{ ...s.btnSmall, marginBottom: 12 }} onClick={() => setView("feed")}>{t.back}</button>
          <div style={s.sectionTitle}># {currentTopic}</div>
          {topicPosts.length === 0 && <div style={s.empty}>{t.noPosts2}</div>}
          {topicPosts.map(post => (
            <PostCard key={post.id} post={post} user={user} profile={profile}
              commentInputs={commentInputs} setCommentInputs={setCommentInputs}
              openComments={openComments} setOpenComments={setOpenComments}
              onLike={handleLike}
              onComment={(post) => handleComment(post, commentInputs, setCommentInputs)}
              onChat={handleOpenChat} onProfile={openProfile} onTopic={openTopic}
              t={t}
            />
          ))}
        </div>
      )}

      {/* Upgrade modal */}
      {upgradeTarget && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <div style={s.modalTitle}>{t.upgradeTitle}</div>
            <div style={s.modalSub}>{t.upgradeSub(remaining)}</div>
            <button style={s.btnPrimary} onClick={() => { handleUpgrade(upgradeTarget, t); setUpgradeTarget(null); }}>
              {t.upgradeConfirm}
            </button>
            <button style={{ ...s.btnSmall, marginTop: 8, width: "100%", textAlign: "center" }}
              onClick={() => setUpgradeTarget(null)}>{t.cancel}</button>
          </div>
        </div>
      )}
    </div>
  );
}