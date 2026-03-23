import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/app/lib/firebase";

type AuditLogInput = {
  action: "create" | "update" | "delete";
  entity: string;
  entityId: string;
  details?: Record<string, unknown>;
};

export async function writeAuditLog(input: AuditLogInput) {
  const user = auth.currentUser;

  await addDoc(collection(db, "auditLogs"), {
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    details: input.details ?? {},
    actorUid: user?.uid ?? "",
    actorEmail: user?.email ?? "",
    createdAt: serverTimestamp(),
  });
}
