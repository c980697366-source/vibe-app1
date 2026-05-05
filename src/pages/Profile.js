import { s } from "../styles";
import { getAvatarColor } from "../utils";
import { PostCard } from "../components/PostCard";

export function Profile({
  profileTarget, profilePosts, user, profile,
  following, onFollow, onChat, onBack,
  commentInputs, setCommentInputs,
  openComments, setOpenComments,
  onLike, onComment, onProfile, onTopic, t
}) {
  if (!profileTarget) return null;

  return (
    <div>
      <button style={{ ...s.btnSmall, marginBottom: 12 }} onClick={onBack}>{t.back}</button>
      <div style={s.profileCard}>
        <div style={{ ...s.profileAvatar, background: getAvatarColor(profileTarget.userId) }}>
          {profileTarget.nickname?.[0]?.toUpperCase()}
        </div>
        <div style={s.profileName}>{profileTarget.nickname}</div>
        <div style={s.profileSub}>
          {t.matchPosts(profilePosts.filter(p => p.isMatchPost).length)} · {t.normalPosts(profilePosts.filter(p => !p.isMatchPost).length)}
        </div>
        {profileTarget.userId !== user.uid && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
            <button
              style={following.includes(profileTarget.userId)
                ? { ...s.btnSmall, marginTop: 0 }
                : { ...s.btnOrange }}
              onClick={() => onFollow(profileTarget.userId)}
            >
              {following.includes(profileTarget.userId) ? t.following : t.follow}
            </button>
            <button style={s.btnOrange} onClick={() => onChat(profileTarget.userId, profileTarget.nickname)}>
              {t.message}
            </button>
          </div>
        )}
      </div>

      <div style={s.sectionTitle}>{t.allPosts}</div>
      {profilePosts.length === 0 && <div style={s.empty}>{t.noPosts2}</div>}
      {profilePosts.map(post => (
        <PostCard
          key={post.id} post={post} user={user} profile={profile}
          commentInputs={commentInputs} setCommentInputs={setCommentInputs}
          openComments={openComments} setOpenComments={setOpenComments}
          onLike={onLike} onComment={onComment}
          onChat={onChat} onProfile={onProfile} onTopic={onTopic}
          t={t}
        />
      ))}
    </div>
  );
}
