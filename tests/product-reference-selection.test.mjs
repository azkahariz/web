import assert from "node:assert/strict";
import test from "node:test";
import {
  clearProductReferenceSelection,
  getCurrentPageSelectionState,
  productReferenceSelectionKey,
  toggleCurrentPageSelection,
} from "../app/lib/product-reference-selection.ts";

function reference(name, overrides = {}) {
  return {
    submissionId: `submission-${name}`,
    expectedSubmissionVersion: 1,
    itemId: `item-${name}`,
    archivedAt: null,
    activeLock: false,
    ...overrides,
  };
}

test("checkbox halaman membedakan unchecked, indeterminate, checked, dan disabled", () => {
  const first = reference("first");
  const second = reference("second");
  const archived = reference("archived", { archivedAt: "2026-08-21T00:00:00Z" });
  const locked = reference("locked", { activeLock: true });

  assert.deepEqual(getCurrentPageSelectionState([first, second], new Map()), {
    eligibleCount: 2,
    selectedCount: 0,
    checked: false,
    indeterminate: false,
    disabled: false,
  });

  const partial = new Map([[productReferenceSelectionKey(first), first]]);
  assert.equal(getCurrentPageSelectionState([first, second], partial).indeterminate, true);

  const complete = toggleCurrentPageSelection([first, second], new Map());
  assert.equal(getCurrentPageSelectionState([first, second], complete).checked, true);

  assert.deepEqual(getCurrentPageSelectionState([archived, locked], new Map()), {
    eligibleCount: 0,
    selectedCount: 0,
    checked: false,
    indeterminate: false,
    disabled: true,
  });
});

test("toggle halaman hanya memilih row eligible dan mempertahankan pilihan lintas halaman", () => {
  const pageOne = [
    reference("one"),
    reference("two"),
    reference("archived", { archivedAt: "2026-08-21T00:00:00Z" }),
    reference("locked", { activeLock: true }),
    reference("missing-item", { itemId: null }),
  ];
  const otherPage = reference("other-page");
  const initial = new Map([[productReferenceSelectionKey(otherPage), otherPage]]);

  const selected = toggleCurrentPageSelection(pageOne, initial);
  assert.equal(selected.size, 3);
  assert.equal(selected.has(productReferenceSelectionKey(pageOne[0])), true);
  assert.equal(selected.has(productReferenceSelectionKey(pageOne[1])), true);
  assert.equal(selected.has(productReferenceSelectionKey(pageOne[2])), false);
  assert.equal(selected.has(productReferenceSelectionKey(pageOne[3])), false);
  assert.equal(selected.has(productReferenceSelectionKey(pageOne[4])), false);

  const deselectedCurrentPage = toggleCurrentPageSelection(pageOne, selected);
  assert.deepEqual([...deselectedCurrentPage.keys()], [productReferenceSelectionKey(otherPage)]);
});

test("partial current page menjadi terpilih penuh dan pilihan stabil saat halaman berubah", () => {
  const pageOne = [reference("one"), reference("two")];
  const pageTwo = [reference("three"), reference("four")];
  let selected = new Map([[productReferenceSelectionKey(pageOne[0]), pageOne[0]]]);

  selected = toggleCurrentPageSelection(pageOne, selected);
  assert.equal(selected.size, 2);
  assert.equal(getCurrentPageSelectionState(pageOne, selected).checked, true);

  selected = toggleCurrentPageSelection(pageTwo, selected);
  assert.equal(selected.size, 4);
  assert.equal(getCurrentPageSelectionState(pageOne, selected).checked, true);
  assert.equal(getCurrentPageSelectionState(pageTwo, selected).checked, true);

  const cleared = clearProductReferenceSelection();
  assert.equal(cleared.size, 0);
});

test("selection key membedakan item dan version submission untuk mencegah stale identity", () => {
  const current = reference("same", { submissionId: "submission", itemId: "item", expectedSubmissionVersion: 4 });
  const otherItem = { ...current, itemId: "item-2" };
  const otherVersion = { ...current, expectedSubmissionVersion: 5 };

  assert.notEqual(productReferenceSelectionKey(current), productReferenceSelectionKey(otherItem));
  assert.notEqual(productReferenceSelectionKey(current), productReferenceSelectionKey(otherVersion));
});
