import Link from "next/link";

export default function FormNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">
        Form not available
      </h1>
      <p className="text-muted-foreground">
        This form may have been unpublished or removed. Check the link with the
        person who shared it.
      </p>
      <Link
        href="/"
        className="w-fit rounded-sm font-medium underline underline-offset-4 focus-visible:outline-1"
      >
        Go to Nivra
      </Link>
    </main>
  );
}
