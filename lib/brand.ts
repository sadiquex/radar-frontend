// The product name is still being decided. Every user-visible mention reads
// from here, so changing it is a one-line edit.
//
// Deliberately NOT wired to the `gt:` localStorage prefixes or the package
// name: `data.subscribe` string-matches those keys, so renaming them would
// orphan every trip already live in someone's browser.
export const PRODUCT_NAME = "Radar";
