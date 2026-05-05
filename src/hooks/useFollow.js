import { useState, useCallback, useEffect } from "react";
import { db } from "../firebase";
import {
  collection, getDocs, query, doc,
  setDoc, getDoc, updateDoc, where
} from "firebase/firestore";

export function useFollow(user) {
  const [following, setFollowing] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [extraQuota, setExtraQuota] = useState(0);

  const fetchFollows = useCallback(async () => {
    if (!user) return;
    const followingSnap = await getDocs(query(collection(db, "follows"), where("fromId", "==", user.uid)));
    setFollowing(followingSnap.docs.map(d => d.data().toId));
    const followerSnap = await getDocs(query(collection(db, "follows"), where("toId", "==", user.uid)));
    setFollowers(followerSnap.docs.map(d => d.data().fromId));
  }, [user]);

  useEffect(() => { fetchFollows(); }, [fetchFollows]);

  const fetchExtraQuota = useCallback(async () => {
    if (!user) return;
    const ref = doc(db, "inviteQuota", user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) setExtraQuota(snap.data().extra || 0);
  }, [user]);

  useEffect(() => { fetchExtraQuota(); }, [fetchExtraQuota]);

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (!ref || ref === user.uid) return;
    const addQuota = async () => {
      const inviterRef = doc(db, "inviteQuota", ref);
      const snap = await getDoc(inviterRef);
      if (snap.exists()) {
        await updateDoc(inviterRef, { extra: (snap.data().extra || 0) + 3 });
      } else {
        await setDoc(inviterRef, { extra: 3 });
      }
      window.history.replaceState({}, "", window.location.pathname);
    };
    addQuota();
  }, [user]);

  const handleFollow = async (targetUserId) => {
    if (!user) return;
    const followId = `${user.uid}_${targetUserId}`;
    const ref = doc(db, "follows", followId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, { deleted: true, active: false });
      setFollowing(prev => prev.filter(id => id !== targetUserId));
    } else {
      await setDoc(ref, { fromId: user.uid, toId: targetUserId, createdAt: Date.now(), active: true });
      setFollowing(prev => [...prev, targetUserId]);
    }
  };

  const mutualIds = following.filter(id => followers.includes(id));

  return { following, followers, mutualIds, extraQuota, handleFollow };
}
