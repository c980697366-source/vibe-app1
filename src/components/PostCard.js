import { s } from "../styles";
import { getAvatarColor, renderRichText, isWithin24h } from "../utils";
import { LANG } from "../constants";

export function PostCard({
  post, user, profile,
  commentInputs, setCommentInputs,
  openComments, setOpenComments,
  onLike, onComment, onChat, onProfile, onTopic, onUpgrade,
  t = LANG.zh
}) {
  const liked = post.likes?.includes(user?.uid);
  const showComment = openComments[post.id];
  const expired = !isWithin24h(post.createdAt);
  const isEn = t === LANG.en;

  return (
    <div style={{ ...s.card, opacity: expired && post.isMatchPost ? 0.6 : 1 }}>
      <div style={s.postHeader}>
        <div
          style={{ ...s.avatarPlaceholder, background: getAvatarColor(post.userId) }}
          onClick={() => onProfile(post.userId, post.user)}
        >
          {post.avatar
            ? <img src={post.avatar} style={s.avatarImg} alt="" />
            : post.user?.[0]}
        </div>
        <div style={{ flex: 1 }}>
          <div style={s.username} onClick={() => onProfile(post.userId, post.user)}>
            {post.user}
          </div>
          <div style={s.timeText}>
            {post.date === new Date().toISOString().slice(0, 10) ? t.today : post.date}
            {post.isMatchPost
              ? <span style={{ ...s.matchBadge, ...(expired ? { opacity: 0.5 } : {}) }}>
                  {expired ? t.expired : t.match}
                </span>
              : <span style={s.normalBadge}>{t.normal}</span>
            }
            {post.visibility === "mutual" && <span style={s.visibilityBadge}>🔒</span>}
            {post.visibility === "followers" && <span style={s.visibilityBadge}>👥</span>}
          </div>
        </div>
        {user && post.userId === user.uid && !post.isMatchPost && onUpgrade && (
          <button style={s.upgradeBtn} onClick={() => onUpgrade(post)}>
            {t.upgradeMatch}
          </button>
        )}
      </div>

      {post.tags?.length > 0 && (
        <div style={s.tagRow}>
          {post.tags.map(tg => <span key={tg} style={s.tagBadge}>{tg}</span>)}
        </div>
      )}

      <div style={s.postContent}>{renderRichText(post.content || "")}</div>

      {post.topics?.length > 0 && (
        <div style={s.tagRow}>
          {post.topics.map(tg => (
            <span key={tg} style={s.topicBadge} onClick={() => onTopic(tg)}>#{tg}</span>
          ))}
        </div>
      )}

      <div style={s.actionRow}>
        <button
          style={{ ...s.actionBtn, color: liked ? "#f97316" : "#888" }}
          onClick={() => onLike(post)}
        >
          👍 {post.likes?.length || 0}
        </button>
        <button
          style={s.actionBtn}
          onClick={() => setOpenComments({ ...openComments, [post.id]: !showComment })}
        >
          💬 {post.comments?.length || 0}
        </button>
        {user && post.userId !== user.uid && (
          <button style={s.actionBtn} onClick={() => onChat(post.userId, post.user)}>
            ✉️ {t.chat}
          </button>
        )}
      </div>

      {showComment && (
        <div style={s.commentSection}>
          {post.comments?.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
              <div
                style={{
                  width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                  background: getAvatarColor(c.userId || c.user),
                  color: "#fff", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 11, fontWeight: 700,
                  cursor: c.userId ? "pointer" : "default",
                }}
                onClick={() => c.userId && onProfile(c.userId, c.user)}
              >
                {c.user?.[0]}
              </div>
              <div>
                <span
                  style={{ fontWeight: 600, fontSize: 13, cursor: c.userId ? "pointer" : "default", color: "#333" }}
                  onClick={() => c.userId && onProfile(c.userId, c.user)}
                >
                  {c.user}
                </span>
                <span style={{ fontSize: 13, color: "#555", marginLeft: 6 }}>{c.text}</span>
              </div>
            </div>
          ))}
          {user && (
            <div style={s.commentInputRow}>
              <input
                style={{ ...s.input, flex: 1, marginBottom: 0 }}
                placeholder={t.writeComment}
                value={commentInputs[post.id] || ""}
                onChange={e => setCommentInputs({ ...commentInputs, [post.id]: e.target.value })}
                onKeyDown={e => e.key === "Enter" && onComment(post)}
              />
              <button style={s.btnSmall} onClick={() => onComment(post)}>
                {t.commentSend}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
