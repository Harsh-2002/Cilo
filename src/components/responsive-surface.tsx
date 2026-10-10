"use client";
import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type ComponentProps,
} from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
import { Dialog, DialogContent } from "./ui/dialog";
import { Button } from "./ui/button";
import { FeedbackOutlet } from "./inline-feedback";

function subscribe(callback: () => void) {
  const media = window.matchMedia("(max-width: 1023px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
export function ResponsiveSurface({
  open,
  onOpenChange,
  blocked = false,
  surface,
  title,
  children,
  ...contentProps
}: ComponentProps<typeof DialogContent> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blocked?: boolean;
  surface: "search" | "settings";
  title: string;
}) {
  const mobile = useSyncExternalStore(
    subscribe,
    () => window.innerWidth < 1024,
    () => false,
  );
  const page = useRef<HTMLElement>(null);
  const returnUrl = useRef("/overview");
  const pushed = useRef(false);
  const wasOpen = useRef(false);
  const state = useRef({
    open,
    blocked,
    onOpenChange,
    onCloseAutoFocus: contentProps.onCloseAutoFocus,
  });
  useEffect(() => {
    state.current = {
      open,
      blocked,
      onOpenChange,
      onCloseAutoFocus: contentProps.onCloseAutoFocus,
    };
  });
  useEffect(() => {
    const restore = () => {
      const atSurface =
        window.location.pathname.replace(/\/$/, "") === `/${surface}`;
      if (!atSurface && state.current.open && state.current.blocked) {
        window.history.pushState(null, "", `/${surface}`);
        return;
      }
      state.current.onOpenChange(atSurface);
    };
    const timer = setTimeout(() => {
      if (window.location.pathname.replace(/\/$/, "") === `/${surface}`)
        restore();
    }, 0);
    window.addEventListener("popstate", restore);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("popstate", restore);
    };
  }, [surface]);
  useEffect(() => {
    const atSurface =
      window.location.pathname.replace(/\/$/, "") === `/${surface}`;
    if (open && mobile && !atSurface) {
      returnUrl.current = window.location.href;
      pushed.current = true;
      window.history.pushState(
        {
          ...window.history.state,
          nivraSurface: surface,
        },
        "",
        `/${surface}`,
      );
    } else if (
      open &&
      atSurface &&
      window.history.state?.nivraSurface === surface
    ) {
      pushed.current = true;
    } else if (!open && atSurface && wasOpen.current) {
      if (pushed.current) window.history.back();
      else window.history.replaceState(null, "", returnUrl.current);
      pushed.current = false;
    }
    wasOpen.current = open;
  }, [open, mobile, surface]);
  useEffect(() => {
    if (!open || !mobile) return;
    const workspace = document.querySelector<HTMLElement>(".workspace");
    if (workspace) workspace.inert = true;
    const previous = document.activeElement;
    page.current?.focus({ preventScroll: true });
    return () => {
      if (workspace) workspace.inert = false;
      const focusEvent = new Event("closeAutoFocus", { cancelable: true });
      state.current.onCloseAutoFocus?.(focusEvent);
      if (focusEvent.defaultPrevented) return;
      if (
        previous instanceof HTMLElement &&
        previous.isConnected &&
        !document.querySelector('[role="dialog"][data-state="open"]')
      )
        previous.focus({ preventScroll: true });
      else
        document
          .querySelector<HTMLElement>(
            '.workspace button[aria-label="Open navigation"]',
          )
          ?.focus({ preventScroll: true });
    };
  }, [open, mobile]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {mobile ? (
        open &&
        createPortal(
          <section
            ref={page}
            className={`mobile-app-page ${contentProps.className ?? ""}`}
            data-slot="app-page"
            role="main"
            aria-label={title}
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                contentProps.onEscapeKeyDown?.(event.nativeEvent);
                if (!blocked && !event.nativeEvent.defaultPrevented)
                  onOpenChange(false);
              }
            }}
          >
            <div className="mobile-page-heading">
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Back from ${title}`}
                disabled={blocked}
                onClick={() => onOpenChange(false)}
              >
                <ArrowLeft size={20} />
              </Button>
              <h1>{title}</h1>
            </div>
            <FeedbackOutlet />
            {children}
          </section>,
          document.body,
        )
      ) : (
        <DialogContent {...contentProps}>{children}</DialogContent>
      )}
    </Dialog>
  );
}
