/**
 * session.ts — main-process session holder. The current principal is
 * main-memory state (an honest local identity selection — NOT auth); the
 * domain service enforces all role gating and tenant isolation.
 */
import { ADCOS_DEFAULT_PRINCIPAL } from "../contract.js";

export class DesktopSession {
  private principal_: string = ADCOS_DEFAULT_PRINCIPAL;

  get principal(): string {
    return this.principal_;
  }

  switch(principal: string): { applied: boolean; reason?: string } {
    if (principal.trim() === "") {
      return { applied: false, reason: "empty principal" };
    }
    this.principal_ = principal;
    return { applied: true };
  }
}
