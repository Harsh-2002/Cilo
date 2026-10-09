import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormRenderer } from "@/components/form-renderer";
import { publicForm } from "@/lib/server/forms";
import { installationExists } from "@/lib/server/installation";
import { uploadLimit } from "@/lib/server/config";
import { HttpError } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  if (!installationExists()) notFound();
  const { token } = await params;
  let form: ReturnType<typeof publicForm>;
  try {
    form = publicForm(token);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
  return (
    <main className="mx-auto w-full max-w-3xl px-5 pt-10 pb-16 md:px-8 md:pt-14">
      <FormRenderer
        definition={form.definition}
        token={token}
        versionId={form.versionId}
        closed={form.status === "closed"}
        maxFileBytes={Math.min(uploadLimit(), 10 * 1024 * 1024)}
      />
    </main>
  );
}
