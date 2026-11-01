import type { Worksheet } from "../parse/types";
export class History {
  private past: string[] = [];
  private future: string[] = [];
  constructor(private doc: Worksheet) {}
  record() {
    this.past.push(JSON.stringify(this.doc));
    if (this.past.length > 50) this.past.shift();
    this.future = [];
  }
  undo() {
    return this.restore(this.past, this.future);
  }
  redo() {
    return this.restore(this.future, this.past);
  }
  private restore(from: string[], to: string[]) {
    const snapshot = from.pop();
    if (!snapshot) return false;
    to.push(JSON.stringify(this.doc));
    Object.assign(this.doc, JSON.parse(snapshot));
    return true;
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
}
