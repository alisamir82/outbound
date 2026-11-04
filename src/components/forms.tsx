"use client";

import { useActionState } from "react";
import type { ActionState } from "@/actions/auth";
import { Alert, Button } from "./ui";
import type { ReactNode } from "react";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Generic form wrapper: runs a server action, shows errors/success, disables submit while pending. */
export function ActionForm({
  action,
  children,
  submitLabel,
  className,
  hidden,
}: {
  action: Action;
  children: ReactNode;
  submitLabel: string;
  className?: string;
  hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className ?? "space-y-4"}>
      {hidden ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
      {children}
      <Alert state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Working…" : submitLabel}
      </Button>
    </form>
  );
}
