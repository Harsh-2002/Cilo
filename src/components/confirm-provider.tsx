"use client";
import { createContext, useContext, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "./ui/alert-dialog";
type Request = { title: string; description: string; action?: string };
type Confirm = (request: Request) => Promise<boolean>;
const Context = createContext<Confirm | null>(null);
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const confirm: Confirm = (request) =>
    new Promise((resolve) => {
      resolver.current?.(false);
      resolver.current = resolve;
      setRequest(request);
    });
  function settle(value: boolean) {
    resolver.current?.(value);
    resolver.current = null;
    setRequest(null);
  }
  return (
    <Context.Provider value={confirm}>
      {children}
      <AlertDialog
        open={!!request}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{request?.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {request?.description}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => settle(true)}>
              {request?.action || "Continue"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Context.Provider>
  );
}
export function useConfirm() {
  const confirm = useContext(Context);
  if (!confirm) throw new Error("Confirmation requires ConfirmProvider.");
  return confirm;
}
