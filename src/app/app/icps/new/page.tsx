import { createIcpAction } from "@/actions/icps";
import { ActionForm } from "@/components/forms";
import { Textarea } from "@/components/textarea";
import { Card, Field, PageHeader } from "@/components/ui";

export const metadata = { title: "New ICP" };

export default function NewIcpPage() {
  return (
    <>
      <PageHeader title="New ICP" subtitle="One paragraph is enough. Claude turns it into a structured profile you can edit." />
      <Card>
        <ActionForm action={createIcpAction} submitLabel="Generate ICP">
          <Field label="What do you sell, and to whom?" help="Include the product, the buyer, the company type and size, regions, and the outcome you deliver.">
            <Textarea
              name="prompt"
              rows={6}
              required
              placeholder="We sell route-optimisation software to logistics companies with 50-500 drivers in the UK and EU. Buyers are operations and fleet leaders. Customers typically cut fleet mileage by 12-18% within 90 days."
            />
          </Field>
        </ActionForm>
      </Card>
    </>
  );
}
