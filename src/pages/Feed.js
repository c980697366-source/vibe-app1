import { s } from "../styles";
import { PostCard } from "../components/PostCard";

export function Feed({
  posts, user, profile, following, mutualIds,
  commentInputs, setCommentInputs,
  openComments, setOpenComments,
  onLike, onComment, onChat, onProfile, onTopic,
  onUpgrade, myTodayMatchCount, totalQuota, t
}) {
  const publicPosts = posts.filter(p => {
    if (p.userId === user?.uid) return true;
    if (p.visibility === "mutual") return mutualIds.includes(p.userId);
    if (p.visibility === "followers") return following.includes(p.userId);
    return true;
  });

  return (
    <div>
      <div style={s.sectionTitle}>{t.todayPosts}</div>
      {publicPosts.length === 0 && <div style={s.empty}>{t.noPosts}</div>}
      {publicPosts.map(post => (
        <PostCard
          key={post.id} post={post} user={user} profile={profile}
          commentInputs={commentInputs} setCommentInputs={setCommentInputs}
          openComments={openComments} setOpenComments={setOpenComments}
          onLike={onLike} onComment={onComment}
          onChat={onChat} onProfile={onProfile} onTopic={onTopic}
          onUpgrade={myTodayMatchCount < totalQuota ? onUpgrade : null}
          t={t}
        />
      ))}
    </div>
  );
}
