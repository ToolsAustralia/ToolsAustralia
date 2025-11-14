import { redirect } from "next/navigation";

export default function MajorDrawPage() {
  // NOTE: We redirect to the promotional giveaway page while the dedicated
  // major draw layout is paused, keeping the UX consistent for every visitor.
  redirect("/promotional/giveaway");
}
