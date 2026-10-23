import { useState, useCallback } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

export function useAccountAuth() {
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem("qisda_kam_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const loginWithEmail = async (inputEmail) => {
    const cleanEmail = inputEmail.trim().toLowerCase();
    if (!cleanEmail) {
      setAuthError("請輸入有效的公司 Email");
      return false;
    }

    setLoading(true);
    setAuthError("");

    try {
      const userRef = doc(db, "permissions", cleanEmail);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        setAuthError("查無此 Email 的授權記錄，請聯繫 Team Leader 開通權限。");
        setLoading(false);
        return false;
      }

      const userData = { email: cleanEmail, ...userSnap.data() };
      setCurrentUser(userData);
      localStorage.setItem("qisda_kam_user", JSON.stringify(userData));
      setLoading(false);
      return true;
    } catch (err) {
      console.error("Auth check failed:", err);
      setAuthError("連線驗證失敗，請確認 Firebase 設定。");
      setLoading(false);
      return false;
    }
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem("qisda_kam_user");
  };

  const checkPermission = useCallback(
    (accountId) => {
      if (!currentUser) return "none";
      if (currentUser.role === "admin") return "read_write";

      const mappings = currentUser.mappings || {};
      const perm = mappings[accountId.toLowerCase()];
      return perm || "none";
    },
    [currentUser]
  );

  return {
    currentUser,
    loading,
    authError,
    loginWithEmail,
    logout,
    checkPermission,
    isAdmin: currentUser?.role === "admin"
  };
}