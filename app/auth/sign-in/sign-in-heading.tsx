"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export default function SignInHeading({ children }: { children: ReactNode }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <h1 ref={headingRef} id="sign-in-title" tabIndex={-1}>
      {children}
    </h1>
  );
}
