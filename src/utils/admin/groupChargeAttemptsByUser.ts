export interface ChargeAttemptInput {
  invoiceId: string;
  userId: string | null;
  userEmail: string;
  adminName: string;
  status: "success" | "failed" | "skipped";
  amount: number;
  attemptedAt: string;
  errorCode?: string;
  declineCode?: string;
  errorMessage?: string;
}

export interface UserAttemptGroup<T extends ChargeAttemptInput = ChargeAttemptInput> {
  userId: string | null;
  userEmail: string;
  attempts: T[];
  successCount: number;
  failedCount: number;
  skippedCount: number;
  totalAmount: number;
  lastAttemptedAt: string;
  latestStatus: "success" | "failed" | "skipped";
  adminLabel: string;
}

export function groupChargeAttemptsByUser<T extends ChargeAttemptInput>(
  attempts: readonly T[]
): UserAttemptGroup<T>[] {
  const buckets = new Map<string, T[]>();

  for (const a of attempts) {
    // Group by userId when present; fall back to userEmail so legacy/null userId rows still collapse.
    const key = a.userId ?? `email:${a.userEmail}`;
    const list = buckets.get(key);
    if (list) {
      list.push(a);
    } else {
      buckets.set(key, [a]);
    }
  }

  const groups: UserAttemptGroup<T>[] = [];
  for (const list of buckets.values()) {
    const sorted = [...list].sort((a, b) =>
      a.attemptedAt < b.attemptedAt ? 1 : a.attemptedAt > b.attemptedAt ? -1 : 0
    );
    const head = sorted[0];

    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let totalAmount = 0;
    const adminNames = new Set<string>();
    for (const a of sorted) {
      if (a.status === "success") successCount += 1;
      else if (a.status === "failed") failedCount += 1;
      else skippedCount += 1;
      totalAmount += a.amount;
      adminNames.add(a.adminName);
    }

    groups.push({
      userId: head.userId,
      userEmail: head.userEmail,
      attempts: sorted,
      successCount,
      failedCount,
      skippedCount,
      totalAmount,
      lastAttemptedAt: head.attemptedAt,
      latestStatus: head.status,
      adminLabel: adminNames.size === 1 ? head.adminName : "various",
    });
  }

  groups.sort((a, b) =>
    a.lastAttemptedAt < b.lastAttemptedAt ? 1 : a.lastAttemptedAt > b.lastAttemptedAt ? -1 : 0
  );

  return groups;
}
