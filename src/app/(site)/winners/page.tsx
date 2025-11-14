import { redirect } from "next/navigation";

export default function WinnersPage() {
  // Redirect to home page since winners page is temporarily hidden
  redirect("/");
}
