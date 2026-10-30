import { redirect } from "next/navigation";

export default function OldMembersPage() {
  redirect("/settings/members");
}
