import type { ComponentProps } from "react";
import { cn } from "@/components/ui";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn("w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900", className)} {...props} />;
}
