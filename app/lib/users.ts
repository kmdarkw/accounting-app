import { User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import { normalizePhone } from "@/app/lib/auth-helpers";

export type AppUserRole = "super_admin" | "admin" | "staff";

export type AppUserProfile = {
  uid: string;
  phone: string;
  role: AppUserRole;
  isActive: boolean;
  mustChangePassword: boolean;
};

function mapProfileData(
  uid: string,
  data: {
    phone?: string;
    role?: AppUserRole;
    isActive?: boolean;
    mustChangePassword?: boolean;
  },
): AppUserProfile {
  return {
    uid,
    phone: data.phone ?? "",
    role: data.role ?? "staff",
    isActive: data.isActive ?? false,
    mustChangePassword: data.mustChangePassword ?? false,
  };
}

export async function getUserProfile(uid: string) {
  const userRef = doc(db, "users", uid);
  const userDoc = await getDoc(userRef);
  if (!userDoc.exists()) {
    return null;
  }

  return mapProfileData(uid, userDoc.data() as {
    phone?: string;
    role?: AppUserRole;
    isActive?: boolean;
    mustChangePassword?: boolean;
  });
}

export async function ensureUserProfile(user: User) {
  const existingProfile = await getUserProfile(user.uid);
  if (existingProfile) {
    return existingProfile;
  }

  const legacyAdminRef = doc(db, "admins", user.uid);
  const legacyAdminDoc = await getDoc(legacyAdminRef);
  if (!legacyAdminDoc.exists()) {
    return null;
  }

  const emailLocalPart = (user.email ?? "").split("@")[0] ?? "";
  const phoneFromEmail = normalizePhone(emailLocalPart);

  const userRef = doc(db, "users", user.uid);
  await setDoc(
    userRef,
    {
      phone: phoneFromEmail,
      role: "super_admin",
      isActive: true,
      mustChangePassword: false,
      migratedFromLegacyAdmin: true,
      createdByUid: user.uid,
      createdByEmail: user.email ?? "",
      updatedByUid: user.uid,
      updatedByEmail: user.email ?? "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  const migratedProfile = await getUserProfile(user.uid);
  return migratedProfile;
}
