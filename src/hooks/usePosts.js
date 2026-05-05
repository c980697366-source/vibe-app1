import { useState, useCallback } from "react";
import { db } from "../firebase";
import {
  collection, addDoc, getDocs, query, orderBy,
  doc, updateDoc, arrayUnion, where
} from "firebase/firestore";
import { todayStr, parseMentionsAndTopics, isWithin24h, aiMatch } from "../utils";
import { MATCH_QUOTA, COMPLEMENT_MAP } from "../constants";

export function usePosts(user, profile, extraQuota) {
  const [posts, setPosts] = useState([]);
  const [myTodayMatchCount, setMyTodayMatchCount] = useState(0);
  const [matchResults, setMatchResults] = useState([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [hasMatched, setHasMatched] = useState(false);

  const totalQuota = MATCH_QUOTA + (extraQuota || 0);

  const fetchPosts = useCallback(async () => {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setPosts(list);
    if (user) {
      const count = list.filter(p =>
        p.userId === user.uid && p.date === todayStr() && p.isMatchPost
      ).length;
      setMyTodayMatchCount(count);
    }
  }, [user]);

  const handlePost = async ({ mode, tags, postText, isMatchPost, postVisibility, t }) => {
    if (!user || !profile) return alert(t.needPost);
    if (isMatchPost && myTodayMatchCount >= totalQuota) {
      return alert(t.quotaFull);
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
    for (const nickname of mentions) {
      const usersSnap = await getDocs(query(collection(db, "users"), where("nickname", "==", nickname)));
      usersSnap.forEach(async (ud) => {
        await addDoc(collection(db, "notifications"), {
          toUserId: ud.id, fromUser: profile.nickname,
          fromUserId: user.uid, type: "mention",
          text: `${profile.nickname} mentioned you`,
          createdAt: Date.now(), read: false,
        });
      });
    }
    await fetchPosts();
    return true;
  };

  const handleUpgrade = async (post, t) => {
    if (myTodayMatchCount >= totalQuota) return alert(t.quotaFull);
    await updateDoc(doc(db, "posts", post.id), { isMatchPost: true });
    await fetchPosts();
  };

  const handleMatch = async (t) => {
    const myMatchPosts = posts.filter(p =>
      p.userId === user?.uid && p.isMatchPost && isWithin24h(p.createdAt)
    );
    if (myMatchPosts.length === 0) return alert(t.needPost);
    setMatchLoading(true);
    const myPost = myMatchPosts[0];
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
    const ranked = await aiMatch(myPost, candidates, COMPLEMENT_MAP);
    setMatchResults(ranked);
    setMatchLoading(false);
    setHasMatched(true);
  };

  const handleLike = async (post) => {
    if (!user || post.likes?.includes(user.uid)) return;
    await updateDoc(doc(db, "posts", post.id), { likes: arrayUnion(user.uid) });
    fetchPosts();
  };

  const handleComment = async (post, commentInputs, setCommentInputs) => {
    const text = commentInputs[post.id];
    if (!text?.trim()) return;
    await updateDoc(doc(db, "posts", post.id), {
      comments: arrayUnion({ user: profile.nickname, userId: user.uid, text, time: Date.now() })
    });
    setCommentInputs({ ...commentInputs, [post.id]: "" });
    fetchPosts();
  };

  return {
    posts, fetchPosts, myTodayMatchCount, totalQuota,
    matchResults, matchLoading, hasMatched, setHasMatched,
    handlePost, handleUpgrade, handleMatch, handleLike, handleComment,
  };
}
