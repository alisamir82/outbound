import { createClientAction } from "@/actions/clients";
import { ClientFields } from "@/components/client-form";
import { ActionForm } from "@/components/forms";
import { Card, PageHeader } from "@/components/ui";

export default function NewClientPage() {
  return (
    <>
      <PageHeader title="New client" subtitle="Step 1 of onboarding. You can invite the client admin on the next screen." />
      <Card>
        <ActionForm action={createClientAction} submitLabel="Create client">
          <ClientFields />
        </ActionForm>
      </Card>
    </>
  );
}
