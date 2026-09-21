import type { KeyboardEvent } from "react";

function isEmpty(input: HTMLInputElement): boolean {
  // Passwords are compared as typed; spaces are meaningful.
  return input.type === "password" ? input.value === "" : input.value.trim() === "";
}

/**
 * "Enter moves on" for multi-field forms. Attach to a <form onKeyDown>.
 *
 * Pressing Enter in a field jumps to the first field that is still empty
 * instead of submitting a half-filled form. Once nothing is empty, Enter
 * submits as usual. If the field you are in is itself the first empty one,
 * Enter submits, so the form's own validation can explain what is missing.
 */
export function advanceToEmptyField(event: KeyboardEvent<HTMLFormElement>): void {
  // Ignore Enter that confirms an IME composition (Japanese, Chinese, ...).
  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
  if (!(event.target instanceof HTMLInputElement)) return;

  const fields = [...event.currentTarget.querySelectorAll<HTMLInputElement>("input")].filter(
    (input) =>
      !input.disabled && !input.readOnly && input.type !== "hidden" && input.type !== "checkbox",
  );
  const firstEmpty = fields.find(isEmpty);

  if (firstEmpty && firstEmpty !== event.target) {
    event.preventDefault();
    firstEmpty.focus();
  }
}
