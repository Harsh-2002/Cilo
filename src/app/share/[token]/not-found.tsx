import { SystemPage } from "@/components/system-page";
export default function Unavailable() {
  return (
    <SystemPage code="404" title="This note is no longer available.">
      The link may have been removed or replaced by its owner.
    </SystemPage>
  );
}
