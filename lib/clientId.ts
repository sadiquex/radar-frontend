const KEY = "grouptrack:clientId";

// A stable per-browser identity, and the layer accounts sit on top of rather
// than replace. Signed in or not, this is how we recognise "you"
// across the create/join/group screens and (later) attach a position to a person.
export function getClientId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
