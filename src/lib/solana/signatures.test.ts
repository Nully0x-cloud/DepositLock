import { describe, expect, it } from "vitest";
import { pickDepositSignatures } from "./signatures";

describe("pickDepositSignatures", () => {
  it("uses the only successful write for an initialized agreement", () => {
    expect(
      pickDepositSignatures(
        [{ signature: "initialize-signature", err: null }],
        "initialized",
      ),
    ).toEqual({ initialization: "initialize-signature", funding: null });
  });

  it("maps oldest to initialization and newest to funding", () => {
    expect(
      pickDepositSignatures(
        [
          { signature: "fund-signature", err: null },
          { signature: "initialize-signature", err: null },
        ],
        "funded",
      ),
    ).toEqual({
      initialization: "initialize-signature",
      funding: "fund-signature",
    });
  });

  it("ignores failed transaction attempts", () => {
    expect(
      pickDepositSignatures(
        [
          { signature: "failed-fund", err: { InstructionError: [0, "Custom"] } },
          { signature: "fund-signature", err: null },
          { signature: "initialize-signature", err: null },
        ],
        "funded",
      ),
    ).toEqual({
      initialization: "initialize-signature",
      funding: "fund-signature",
    });
  });

  it("rejects missing or incomplete successful history", () => {
    expect(() => pickDepositSignatures([], "initialized")).toThrow(
      "no successful transactions",
    );
    expect(() =>
      pickDepositSignatures([{ signature: "only-init", err: null }], "funded"),
    ).toThrow("initialization and a funding transaction");
  });
});
