import "./helpers/components.mjs";
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { Window } from "happy-dom";
import { act, createElement as h } from "react";

const dom = new Window({ url: "http://localhost/", width: 390, height: 844 });
for (const name of ["window", "document", "HTMLElement", "HTMLDialogElement", "Event", "CustomEvent", "MouseEvent", "FormData"]) {
  globalThis[name] = name === "window" ? dom : dom[name];
}
globalThis.requestAnimationFrame = dom.requestAnimationFrame.bind(dom);
globalThis.cancelAnimationFrame = dom.cancelAnimationFrame.bind(dom);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { createRoot } = await import("react-dom/client");
const { BookingSheet, openBooking } = await import("../src/components/BookingSheet.tsx");
const { BookButton } = await import("../src/components/Actions.tsx");
const { Intro } = await import("../src/components/Intro.tsx");
const { ManageBooking } = await import("../src/components/ManageBooking.tsx");
const { TenantProvider } = await import("../src/components/TenantContext.tsx");
const { tenant } = await import("../src/config/tenant.ts");

let root;
let container;
beforeEach(() => {
  document.body.innerHTML = "<div id='test-root'></div>";
  document.documentElement.removeAttribute("data-intro");
  document.documentElement.style.cssText = "";
  dom.sessionStorage.clear();
  dom.history.replaceState(null, "", "/");
  container = document.getElementById("test-root");
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
});

const view = (sheet = true) => h(TenantProvider, { value: tenant }, h(BookButton), sheet && h(BookingSheet));
const render = async (node) => act(() => root.render(node));
const click = async (node) => act(async () => {
  node.click();
  // Native anchor navigation queues hashchange as a browser task.
  await delay(0);
});

test("a first booking tap is retained when the sheet mounts later", async () => {
  await render(view(false));
  await click(container.querySelector(".vb-pill"));
  await render(view());
  assert.equal(container.querySelector("dialog")?.open, true, "the first tap must open the booking view without a second tap");
});

test("a booking link followed before hydration opens when the sheet mounts", async () => {
  dom.history.replaceState(null, "", "/#book");
  await render(view());
  assert.equal(container.querySelector("dialog")?.open, true);
});

test("Back releases the page even when the exit animation event never arrives", async () => {
  await render(view());
  const trigger = container.querySelector(".vb-pill");
  trigger.focus();
  await click(trigger);
  assert.equal(container.querySelector("dialog")?.open, true);
  await click(container.querySelector(".vb-sheet-back"));
  await act(() => delay(550));
  assert.equal(container.querySelector("dialog"), null);
  assert.equal(document.documentElement.style.overflow, "");
  assert.equal(document.activeElement, trigger);
  await click(trigger);
  assert.equal(container.querySelector("dialog")?.open, true, "one tap must reopen it");
});

test("the visible landing page accepts taps while the intro slides away", async () => {
  await render(h(Intro, null, h("main", { id: "booking" }, h(BookButton))));
  await act(() => delay(650));
  assert.equal(container.querySelector(".vb-entry").dataset.phase, "slide");
  assert.equal(document.getElementById("booking").hasAttribute("inert"), false, "the visible booking button must not remain inert");
});

test("repeated opening taps do not reset a service already selected", async () => {
  await render(view());
  await click(container.querySelector(".vb-pill"));
  await click(container.querySelector(".vb-service"));
  await act(async () => { openBooking(); await delay(0); });
  assert.equal(container.querySelector(".vb-service").getAttribute("aria-pressed"), "true");
  assert.ok(container.querySelector("#step-date"));
});

test("opening during the intro keeps the modal locked and restores scrolling on Back", async () => {
  dom.history.replaceState(null, "", "/#book");
  await render(h(TenantProvider, { value: tenant }, h(Intro, null,
    h("main", { id: "booking" }, h(BookButton)), h(BookingSheet))));
  await act(() => delay(650));
  assert.equal(container.querySelector("dialog")?.open, true);
  assert.equal(document.documentElement.style.overflow, "hidden", "the intro must not release the modal's scroll lock");
  await click(container.querySelector(".vb-sheet-back"));
  await act(() => delay(550));
  assert.equal(document.documentElement.style.overflow, "", "Back must not restore an old intro scroll lock");
});

test("failed availability can be retried without reloading or changing the chosen date", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ error: "Connection interrupted. Try again." }, { status: 503 }));
  await render(view());
  await click(container.querySelector(".vb-pill"));
  await click(container.querySelector(".vb-service"));
  await click(container.querySelector("#step-date button:not(:disabled)"));
  const retry = [...container.querySelectorAll("button")].find((b) => b.textContent === "Retry times");
  assert.ok(retry, "a failed request needs a retry control on the same date");
  assert.doesNotMatch(container.querySelector("#step-time").textContent, /No times available/);
  fetch.mock.mockImplementation(async () => Response.json({ starts: [] }));
  await click(retry);
  assert.match(container.querySelector("#step-time").textContent, /No times available/);
  assert.doesNotMatch(container.querySelector("#step-time").textContent, /Connection interrupted/);
});

test("rescheduling shows availability failures and allows retry on the same date", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ error: "Connection interrupted. Try again." }, { status: 503 }));
  await render(h(TenantProvider, { value: tenant }, h(ManageBooking, {
    initial: {
      id: "00000000-0000-4000-8000-000000000001", serviceId: tenant.services[0].id,
      serviceName: "Haircut", startsAt: new Date(Date.now() + 86400000).toISOString(),
      endsAt: new Date(Date.now() + 89100000).toISOString(), priceCents: 5000,
      status: "confirmed", name: "Local test", canChange: true,
    }, token: "local-test", address: "Local test",
  })));
  await click([...container.querySelectorAll("button")].find((b) => b.textContent === "Move to another time"));
  await click(container.querySelector("#move-date button:not(:disabled)"));
  const retry = [...container.querySelectorAll("button")].find((b) => b.textContent === "Retry times");
  assert.ok(retry);
  assert.match(container.querySelector("#move-time").textContent, /Connection interrupted/);
  assert.doesNotMatch(container.querySelector("#move-time").textContent, /No times available/);
  fetch.mock.mockImplementation(async () => Response.json({ starts: [] }));
  await click(retry);
  assert.match(container.querySelector("#move-time").textContent, /No times available/);
});
