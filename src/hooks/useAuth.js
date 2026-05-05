import { useState, useEffect } from "react";
import { auth, db } from "../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [setupMode, setSetupMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const ref = doc(db, "users", u.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          setProfile(data);
          if (!data.nickname || data.nickname === data.email?.split("@")[0]) {
            setSetupMode(true);
          }
        } else {
          setSetupMode(true);
        }
      } else {
        setProfile(null);
        setSetupMode(false);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const saveProfile = async (uid, data) => {
    const ref = doc(db, "users", uid);
    await setDoc(ref, data);
    setProfile(data);
    setSetupMode(false);
  };

  const logout = () => signOut(auth);

  return { user, profile, setProfile, setupMode, setSetupMode, loading, saveProfile, logout };
}
