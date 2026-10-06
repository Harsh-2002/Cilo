type Tone = "status" | "error";
function announce(message: string, tone: Tone = "status") {
  window.dispatchEvent(
    new CustomEvent("nivra:feedback", { detail: { message, tone } }),
  );
}
export const notify = {
  success: (message: string) => announce(message),
  info: (message: string) => announce(message),
  message: (message: string) => announce(message),
  error: (message: string) => announce(message, "error"),
  dismiss: () =>
    window.dispatchEvent(new CustomEvent("nivra:feedback", { detail: null })),
};
