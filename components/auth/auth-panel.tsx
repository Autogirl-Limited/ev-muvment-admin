import type { ReactNode } from "react";

/** Heading, form and footer link for one auth screen (the layout supplies the chrome). */
export function AuthPanel({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="animate-fade-in">
      <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      {description && <p className="mt-2 text-pretty text-sm text-muted sm:text-base">{description}</p>}
      <div className="mt-6 sm:mt-8">{children}</div>
      {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
    </div>
  );
}
