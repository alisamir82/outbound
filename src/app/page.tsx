import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();
  redirect(session?.user?.role === "super_admin" ? "/admin" : session?.user ? "/app" : "/login");
}
