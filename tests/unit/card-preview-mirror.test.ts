/**
 * The card preview's two islands, driven without a browser (spec 042 §5.3.2; AC-10 and AC-11's unit
 * halves, T-10 and T-11; TASK-308). The browser halves are `tests/e2e/product-card-preview.spec.ts`
 * (the product page) and `tests/e2e/checkout-ui.spec.ts` (checkout's primitive on `/dev/components`).
 *
 *  - **Product page** (`CardMessageField`): typing puts the words, exactly as typed, into the
 *    `<bdi>` of the `[data-fo-card-text]` line and marks the sample before it `aria-hidden="true"`
 *    (which is also what `globals.css` swaps the two lines on); clearing the field empties the words
 *    and gives the sample back. Red with the sample left in place after typing.
 *  - **Checkout** (`CardCounter`): the message and the signature mirror into the preview lines that
 *    name their own field ids, and into no other card's lines, so a page with one card per bouquet
 *    keeps each preview to its own fields.
 *
 * The unit project has no DOM: `useEffect` and `useState` are stood in for (as
 * `checkout-ui-islands.test.ts` does), so calling a component as a function gives its effects and
 * its element, and the DOM is a few fakes with only what the islands touch.
 */
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CardCounter } from "../../src/modules/ui/checkout/CardCounter.tsx";
import {
  CARD_TEXT_SELECTOR,
  CardMessageField,
} from "../../src/modules/ui/product/CardMessageField.tsx";

const hooks = vi.hoisted(() => ({
  effects: [] as { run: () => unknown; deps: readonly unknown[] | undefined }[],
  state: "" as unknown,
  set: (value: unknown): void => {
    hooks.state = value;
  },
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: (run: () => unknown, deps?: readonly unknown[]) => {
    hooks.effects.push({ run, deps });
  },
  useState: () => [hooks.state, hooks.set],
}));

type Listener = (event: unknown) => void;

class FakeNode {
  textContent: string | null = "";
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, Listener[]>();
  id = "";
  value = "";
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  removeEventListener(type: string, listener: Listener): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((fn) => fn !== listener),
    );
  }
  fire(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ target: this });
    }
  }
}
class FakeTextArea extends FakeNode {}
class FakeInput extends FakeNode {}

/** `PrintedCardPreview`'s product-page cell: the sample, then the words line with its `<bdi>`. */
function productCell(sampleText: string): {
  sample: FakeNode;
  words: FakeNode;
  line: { firstElementChild: FakeNode; previousElementSibling: FakeNode };
} {
  const sample = new FakeNode();
  sample.textContent = sampleText;
  const words = new FakeNode();
  return {
    sample,
    words,
    line: { firstElementChild: words, previousElementSibling: sample },
  };
}

afterEach(() => {
  hooks.effects.length = 0;
  hooks.state = "";
  vi.unstubAllGlobals();
});

describe("AC-10 / T-10 (unit half): the product page's island fills the card preview", () => {
  const SAMPLE =
    "Your message, printed on our card and tucked into the bouquet.";

  /** Renders the island with the field holding `text` and runs its effects, as React would. */
  function render(text: string): ReactElement {
    hooks.state = text;
    hooks.effects.length = 0;
    const element = CardMessageField({
      id: "pdp-card-message",
      labelledBy: "pdp-card-legend",
      max: 200,
      limit: "200",
    });
    for (const effect of hooks.effects) effect.run();
    return element;
  }

  /** The `<textarea>`'s change handler, as the buyer types `value`. */
  function type(element: ReactElement, value: string): void {
    const children = (element.props as { children: ReactElement[] }).children;
    const textarea = children.find((child) => child.type === "textarea");
    const onChange = (
      textarea?.props as {
        onChange: (event: { target: { value: string } }) => void;
      }
    ).onChange;
    onChange({ target: { value } });
  }

  function stub(cell: ReturnType<typeof productCell>): void {
    vi.stubGlobal("document", {
      querySelectorAll: (selector: string) =>
        selector === CARD_TEXT_SELECTOR ? [cell.line] : [],
      querySelector: () => null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
  }

  it("mirrors the words exactly as typed and hides the sample from assistive technology", () => {
    const cell = productCell(SAMPLE);
    stub(cell);
    const empty = render("");
    // On hydration the server's state stands: no words, the sample shown.
    expect(cell.words.textContent).toBe("");
    expect(cell.sample.attributes.get("aria-hidden")).toBe("false");

    type(empty, "Happy birthday, Ola");
    expect(hooks.state).toBe("Happy birthday, Ola");
    render(hooks.state as string);
    expect(cell.words.textContent).toBe("Happy birthday, Ola");
    expect(cell.sample.attributes.get("aria-hidden")).toBe("true");
    // The sample node keeps the server's sentence: nothing overwrote it.
    expect(cell.sample.textContent).toBe(SAMPLE);
  });

  it("gives the sample back when the field is cleared", () => {
    const cell = productCell(SAMPLE);
    stub(cell);
    type(render("Happy birthday, Ola"), "");
    render(hooks.state as string);
    expect(cell.words.textContent).toBe("");
    expect(cell.sample.attributes.get("aria-hidden")).toBe("false");
    expect(cell.sample.textContent).toBe(SAMPLE);
  });

  it("keeps right-to-left and joined text whole (the `<bdi>` takes the string as typed)", () => {
    const cell = productCell(SAMPLE);
    stub(cell);
    for (const words of ["عيد ميلاد سعيد", "Kochana Mamo 👨‍👩‍👧", "a\nb"]) {
      render(words);
      expect(cell.words.textContent).toBe(words);
    }
  });
});

describe("AC-11 / T-11 (unit half): checkout's island mirrors message and signature into its own card", () => {
  function stubCheckout(
    elements: Record<string, FakeNode>,
    mirrors: FakeNode[],
  ): void {
    vi.stubGlobal("HTMLTextAreaElement", FakeTextArea);
    vi.stubGlobal("HTMLInputElement", FakeInput);
    vi.stubGlobal("document", {
      getElementById: (id: string) => elements[id] ?? null,
      querySelectorAll: (selector: string) =>
        selector === "[data-fo-mirror]" ? mirrors : [],
    });
  }

  function mirrorNode(fieldId: string): FakeNode {
    const node = new FakeNode();
    node.dataset.foMirror = fieldId;
    return node;
  }

  it("writes each field into the lines that name it, as typed, and leaves another card's lines alone", () => {
    const message = new FakeTextArea();
    message.id = "card-1";
    const sign = new FakeInput();
    sign.id = "sign-1";
    const counter = new FakeNode();
    const own = {
      words: mirrorNode("card-1"),
      signature: mirrorNode("sign-1"),
    };
    const other = {
      words: mirrorNode("card-2"),
      signature: mirrorNode("sign-2"),
    };
    other.words.textContent = "Kept for bouquet two";
    stubCheckout(
      { "card-1": message, "sign-1": sign, "card-1-count": counter },
      [own.words, own.signature, other.words, other.signature],
    );
    CardCounter({
      fieldId: "card-1",
      counterId: "card-1-count",
      template: "{count} of 200",
      max: 200,
      mirrorIds: ["sign-1"],
    });
    for (const effect of hooks.effects) effect.run();

    message.value = "Happy birthday Mama!";
    message.fire("input");
    sign.value = "Love, Anna";
    sign.fire("input");

    expect(own.words.textContent).toBe("Happy birthday Mama!");
    expect(own.signature.textContent).toBe("Love, Anna");
    expect(other.words.textContent).toBe("Kept for bouquet two");
    expect(other.signature.textContent).toBe("");
    expect(counter.textContent).toBe("20 of 200");
  });
});
