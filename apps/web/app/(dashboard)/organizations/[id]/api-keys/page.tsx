import { redirect } from "next/navigation";

export default function OldApiKeysPage() {
  redirect("/settings/api-keys");
}
