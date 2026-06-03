import connectDB from "@/lib/mongodb";
import ContactSubmission from "@/models/ContactSubmission";
import PartnerApplication from "@/models/PartnerApplication";

export interface UnviewedSubmissionsCount {
  contact: number;
  partner: number;
  total: number;
}

/**
 * Count of submissions (contact + partner-application) that have not been
 * marked viewed/read by an admin. Used by the admin sidebar badge and by Norm.
 */
export async function getUnviewedSubmissionsCount(): Promise<UnviewedSubmissionsCount> {
  await connectDB();
  const unreadQuery = { $or: [{ readAt: null }, { readAt: { $exists: false } }] };
  const [contact, partner] = await Promise.all([
    ContactSubmission.countDocuments(unreadQuery),
    PartnerApplication.countDocuments(unreadQuery),
  ]);
  return { contact, partner, total: contact + partner };
}
